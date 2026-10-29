const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ROTA: Listar conteúdos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
    
    const formattedPosts = result.rows.map(post => {
      const ratings = post.ratings || [];
      let ratingAverage = 0;
      if (ratings.length > 0) {
        const sum = ratings.reduce((acc, curr) => acc + curr, 0);
        ratingAverage = Number((sum / ratings.length).toFixed(1));
      }

      return {
        id: post.id,
        author: post.author,
        avatar: post.avatar,
        category: post.category,
        title: post.title,
        text: post.text,
        image: post.image,
        ratingAverage: ratingAverage,
        ratingCount: ratings.length,
        createdAt: post.created_at
      };
    });

    res.json(formattedPosts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar conteúdos do banco de dados.' });
  }
});

// ROTA: Avaliar um post
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
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar avaliação.' });
  }
});

module.exports = router;