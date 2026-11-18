const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const pool = require('../config/db');
const { uploadFileToR2, deleteFileFromR2 } = require('./storageService');

// Configuração do Multer para manter o arquivo em memória (igual ao userRoutes)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado.'), false);
        }
    }
});

// Função auxiliar de segurança contra SSRF (Bloqueia IPs privados/loopback)
async function validateUrlSafety(targetUrl) {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Protocolo inválido.');
    }

    const hostname = parsed.hostname;
    
    try {
        const addresses = await dns.resolve4(hostname);
        for (const addr of addresses) {
            if (
                addr.startsWith('127.') || 
                addr.startsWith('10.') || 
                addr.startsWith('192.168.') || 
                addr.startsWith('169.254.') ||
                addr.startsWith('0.')
            ) {
                throw new Error('Acesso a endereço IP restrito.');
            }
        }
    } catch (err) {
        throw new Error('Não foi possível resolver o endereço do link.');
    }
}

// ==========================================
// 1) GET /link-preview
// ==========================================
router.get('/link-preview', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Parâmetro url é obrigatório.' });
        }

        await validateUrlSafety(url);

        const response = await axios.get(url, { 
            timeout: 8000,
            maxRedirects: 3,
            headers: { 'User-Agent': 'Mozilla/5.0 (Compatible; LinkPreviewBot)' }
        });

        const $ = cheerio.load(response.data);

        const title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text() || '';
        const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
        const mediaUrl = $('meta[property="og:image"]').attr('content') || $('meta[property="og:video"]').attr('content') || null;
        
        let mediaType = null;
        if (mediaUrl) {
            if (mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i) || $('meta[property="og:video"]').length > 0) {
                mediaType = 'video';
            } else if (mediaUrl.match(/\.gif(\?.*)?$/i)) {
                mediaType = 'gif';
            } else {
                mediaType = 'image';
            }
        }

        return res.json({
            sourceUrl: url,
            siteName: new URL(url).hostname,
            title: title.trim().substring(0, 150),
            description: description.trim().substring(0, 2000),
            mediaUrl,
            mediaType
        });

    } catch (error) {
        return res.status(422).json({ error: 'Link inacessível, privado, fora do ar ou sem conteúdo.' });
    }
});

// ==========================================
// POST / (Criar Postagem)
// ==========================================
router.post('/', upload.single('media'), async (req, res) => {
    try {
        const { userId, title, text, category, locationAccuracy, sourceUrl } = req.body;
        let { latitude, longitude } = req.body;

        // Validações básicas obrigatórias
        if (!userId || !title || !category) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
        }

        if (title.length > 150) {
            return res.status(400).json({ error: 'O título deve ter no máximo 150 caracteres.' });
        }

        if (text && text.length > 2000) {
            return res.status(400).json({ error: 'O texto deve ter no máximo 2000 caracteres.' });
        }

        if (!['Notícias', 'Debates'].includes(category)) {
            return res.status(400).json({ error: 'Categoria inválida. Use "Notícias" ou "Debates".' });
        }

        // Fallback para coordenadas caso venham vazias ou nulas (permite publicar sem GPS)
        if (!latitude) latitude = 0;
        if (!longitude) longitude = 0;

        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
            return res.status(400).json({ error: 'Coordenadas de geolocalização inválidas.' });
        }

        // Busca o nome e o avatar do usuário no perfil para preencher os campos da tabela de posts
        const profileResult = await pool.query(
            'SELECT name, avatar_url FROM profiles WHERE user_id = $1',
            [userId]
        );
        const userProfile = profileResult.rows[0] || { name: 'Usuário', avatar_url: null };

        let mediaUrl = null;
        let mediaType = null;
        let mediaStorage = null;

        // Caso A: Arquivo enviado diretamente via multipart/form-data
        if (req.file) {
            if (req.file.mimetype.startsWith('video/')) mediaType = 'video';
            else if (req.file.mimetype === 'image/gif') mediaType = 'gif';
            else mediaType = 'image';

            // Faz o upload para o Cloudflare R2 usando o serviço centralizado[cite: 8]
            mediaUrl = await uploadFileToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
            mediaStorage = 'r2';
        }

        // Caso B: Publicação a partir de um link externo (sourceUrl)
        else if (sourceUrl) {
            await validateUrlSafety(sourceUrl);

            const response = await axios.get(sourceUrl, { 
                timeout: 8000, 
                responseType: 'arraybuffer',
                maxContentLength: 55 * 1024 * 1024 
            });

            const contentLength = parseInt(response.headers['content-length'] || 0, 10);
            const contentType = response.headers['content-type'] || '';

            if (contentLength > 50 * 1024 * 1024) {
                mediaUrl = sourceUrl; 
                mediaStorage = 'external';
                mediaType = contentType.includes('video') ? 'video' : 'image';
            } else {
                if (contentType.includes('video')) mediaType = 'video';
                else if (contentType.includes('gif')) mediaType = 'gif';
                else mediaType = 'image';

                const fileName = `external-${Date.now()}`;
                mediaUrl = await uploadFileToR2(response.data, fileName, contentType);
                mediaStorage = 'r2';
            }
        }

        // Inserção no Banco de Dados PostgreSQL
        const query = `
            INSERT INTO posts (
                user_id, author, avatar, title, text, category, 
                latitude, longitude, location_accuracy, 
                media_url, media_type, media_storage, source_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, user_id, author, avatar, title, text, category, latitude, longitude, media_url, media_type, source_url, created_at;
        `;
        
        const values = [
            userId,
            userProfile.name,
            userProfile.avatar_url,
            title,
            text || null,
            category,
            latNum,
            lonNum, 
            locationAccuracy ? parseFloat(locationAccuracy) : null, 
            mediaUrl,
            mediaType,
            mediaStorage,
            sourceUrl || null
        ];

        const dbResult = await pool.query(query, values);
        const newPost = dbResult.rows[0];

        return res.status(201).json({
            message: "Publicação criada com sucesso!",
            post: newPost
        });

    } catch (error) {
        console.error('Erro ao criar publicação:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao processar a publicação.' });
    }
});

// ==========================================
// 3) GET / (Listar Publicações com dados do autor)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT p.*, pr.name as author_name, pr.avatar_url as author_avatar 
      FROM posts p
      LEFT JOIN profiles pr ON p.user_id = pr.user_id
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query);
    
    const formattedPosts = result.rows.map(post => {
      const ratings = post.ratings || [];
      let ratingAverage = 0;
      if (ratings.length > 0) {
        const sum = ratings.reduce((acc, curr) => acc + curr, 0);
        ratingAverage = Number((sum / ratings.length).toFixed(1));
      }

      return {
        id: post.id,
        author: post.author_name || 'Usuário Anônimo',
        avatar: post.author_avatar || '',
        category: post.category,
        title: post.title,
        text: post.text,
        image: post.media_url, 
        ratingAverage: ratingAverage,
        ratingCount: ratings.length,
        createdAt: post.created_at
      };
    });

    res.json(formattedPosts);
  } catch (err) {
    console.error('Erro ao buscar posts:', err);
    res.status(500).json({ error: 'Erro ao buscar conteúdos do banco de dados.' });
  }
});

// ==========================================
// 4) POST /:id/rate (Avaliar post)
// ==========================================
router.post('/:id/rate', async (req, res) => {
  const postId = req.params.id;
  const { rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'A nota deve ser entre 1 e 5.' });
  }

  try {
    await pool.query(
      'UPDATE posts SET ratings = array_append(ratings, $1) WHERE id = $2',
      [Number(rating), postId]
    );

    const result = await pool.query('SELECT ratings FROM posts WHERE id = $1', [postId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const ratings = result.rows[0].ratings || [];
    const sum = ratings.reduce((acc, curr) => acc + curr, 0);
    const ratingAverage = Number((sum / ratings.length).toFixed(1));

    res.json({
      message: 'Avaliação registrada!',
      ratingAverage,
      ratingCount: ratings.length
    });
  } catch (err) {
    console.error('Erro ao avaliar post:', err);
    res.status(500).json({ error: 'Erro ao registrar avaliação.' });
  }
});

module.exports = router;