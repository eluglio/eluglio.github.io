const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// ROTA: Cadastro de Usuário e Perfil
router.post('/register', async (req, res) => {
  const { name, email, password, bio, avatar_url, social_links } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase().trim(), passwordHash]
    );
    const userId = userResult.rows[0].id;

    const profileResult = await client.query(
      `INSERT INTO profiles (user_id, name, avatar_url, bio, social_links) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING name, avatar_url, bio, social_links`,
      [
        userId, 
        name, 
        avatar_url || null, 
        bio || null, 
        social_links ? JSON.stringify(social_links) : '{}'
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Usuário e perfil cadastrados com sucesso!',
      user: {
        id: userId,
        email: userResult.rows[0].email,
        profile: profileResult.rows[0]
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  } finally {
    client.release();
  }
});

module.exports = router;