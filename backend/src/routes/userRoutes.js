const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const multer = require('multer');
const { uploadFileToR2 } = require('./storageService');
const upload = multer({ storage: multer.memoryStorage() });

// ROTA: Cadastro de Usuário e Perfil (Com e-mail e senha)
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Verifica se o e-mail já existe
    const userExists = await dbClient.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userExists.rows.length > 0) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }

    // Hash da senha com bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insere na tabela users
    const newUser = await dbClient.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase().trim(), passwordHash]
    );
    const userId = newUser.rows[0].id;

    // Cria o perfil correspondente na tabela profiles
    const defaultAvatar = 'https://via.placeholder.com/150';
    const newProfile = await dbClient.query(
      `INSERT INTO profiles (user_id, name, avatar_url, bio, social_links) 
       VALUES ($1, $2, $3, $4, $5) RETURNING name, avatar_url, bio, social_links`,
      [userId, name, defaultAvatar, 'Membro do Ágora Vermelha', '{}']
    );

    await dbClient.query('COMMIT');

    res.status(201).json({
      message: 'Conta criada com sucesso!',
      user: {
        id: userId,
        email: newUser.rows[0].email,
        profile: newProfile.rows[0]
      }
    });

  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  } finally {
    dbClient.release();
  }
});

// ROTA: Login com E-mail e Senha
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Informe o e-mail e a senha.' });
  }

  try {
    const userResult = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const user = userResult.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const profileResult = await pool.query('SELECT name, avatar_url, bio, social_links FROM profiles WHERE user_id = $1', [user.id]);

    res.json({
      message: 'Login efetuado com sucesso!',
      user: {
        id: user.id,
        email: user.email,
        profile: profileResult.rows[0] || {}
      }
    });

  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

// ROTA: Login / Registro com Google
router.post('/google-login', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Credencial do Google não fornecida.' });
  }

  const dbClient = await pool.connect();

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    await dbClient.query('BEGIN');

    const cleanAvatarUrl = picture ? picture.split('=')[0] : null;
    let userResult = await dbClient.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      const dummyPasswordHash = await bcrypt.hash(Math.random().toString(36), 10);
      
      const newUser = await dbClient.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email.toLowerCase().trim(), dummyPasswordHash]
      );
      userId = newUser.rows[0].id;

      await dbClient.query(
        `INSERT INTO profiles (user_id, name, avatar_url, bio, social_links) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, name, cleanAvatarUrl, 'Membro do Ágora Vermelha via Google', '{}']
      );
    }

    const profileResult = await dbClient.query(
      'SELECT name, avatar_url, bio, social_links FROM profiles WHERE user_id = $1',
      [userId]
    );

    await dbClient.query('COMMIT');

    res.json({
      message: 'Login com Google realizado com sucesso!',
      user: {
        id: userId,
        email: email,
        profile: profileResult.rows[0]
      }
    });

  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erro no login do Google:', err);
    res.status(401).json({ error: 'Falha ao autenticar com o Google.' });
  } finally {
    dbClient.release();
  }
});

// ROTA: Atualizar Campos do Perfil (Nome, Bio, Redes Sociais)
router.put('/profile', async (req, res) => {
  // Recebe o userId juntamente com os campos do corpo da requisição
  const { userId, name, bio, social_links } = req.body; 

  if (!userId) {
    return res.status(401).json({ error: 'Utilizador não autenticado.' });
  }

  try {
    let queryFields = [];
    let queryValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'O nome não pode estar em branco.' });
      queryFields.push(`name = $${paramIndex++}`);
      queryValues.push(name.trim());
    }

    if (bio !== undefined) {
      queryFields.push(`bio = $${paramIndex++}`);
      queryValues.push(bio.trim());
    }

    if (social_links !== undefined) {
      queryFields.push(`social_links = $${paramIndex++}`);
      queryValues.push(JSON.stringify(social_links));
    }

    if (queryFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    queryValues.push(userId);
    const queryString = `UPDATE profiles SET ${queryFields.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`;

    const updatedProfile = await pool.query(queryString, queryValues);

    res.json({
      message: 'Perfil atualizado com sucesso!',
      profile: updatedProfile.rows[0]
    });

  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar perfil.' });
  }
});

router.post('/avatar', upload.single('avatar'), async (req, res) => {
  const { userId } = req.body;
  const file = req.file;

  if (!userId || !file) {
    return res.status(400).json({ error: 'Utilizador ou arquivo de imagem não fornecido.' });
  }

  try {
    // 1. Faz o upload da imagem para o Cloudflare R2 usando o serviço que criamos
    const publicUrl = await uploadFileToR2(file.buffer, file.originalname, file.mimetype);

    // 2. Atualiza a coluna avatar_url na tabela profiles no PostgreSQL
    const updatedProfile = await pool.query(
      `UPDATE profiles SET avatar_url = $1 WHERE user_id = $2 RETURNING name, avatar_url, bio, social_links`,
      [publicUrl, userId]
    );

    if (updatedProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    res.json({
      message: 'Foto de perfil atualizada com sucesso!',
      url: publicUrl,
      profile: updatedProfile.rows[0]
    });

  } catch (err) {
    console.error('Erro ao atualizar foto de perfil:', err);
    res.status(500).json({ error: 'Erro interno ao processar upload da foto.' });
  }
});

module.exports = router;