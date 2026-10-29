require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // Importa o cliente do PostgreSQL
const app = express();

const PORT = process.env.PORT || 3000;


app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️ AVISO: A variável DATABASE_URL não foi encontrada no .env!');
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        author VARCHAR(100) NOT NULL,
        avatar TEXT,
        category VARCHAR(50),
        title TEXT,
        text TEXT,
        image TEXT,
        ratings INT[] DEFAULT ARRAY[]::INT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const res = await pool.query('SELECT COUNT(*) FROM posts');
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO posts (author, avatar, category, title, text, image, ratings) VALUES
        ('Redação Ágora', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', 'Notícias', 'Avanço do transporte público gratuito ganha força nas capitais brasileiras', 'Debate sobre o Passe Livre cresce com novas propostas em tramitação na Câmara.', 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1000&auto=format&fit=crop&q=80', ARRAY[5,5,4,5,4]),
        ('Carlos Eduardo', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80', 'Debates', 'Como a inteligência artificial deve ser regulada para proteger os empregos?', 'A automação avança rapidamente em setores de serviços. Precisamos discutir a transição justa.', NULL, ARRAY[5,4,4]);
      `);
      console.log('Posts iniciais inseridos no banco de dados!');
    }
    console.log('Banco de dados conectado e inicializado com sucesso.');
  } catch (err) {
    console.error('Erro ao conectar ou inicializar o banco de dados:', err.message);
  }
}

initDatabase();


// Diz ao Express para servir todos os arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Sua rota de API continua funcionando normalmente
app.get('/api/dados', (req, res) => {
  res.json({ mensagem: 'Olá da API!' });
});

// Helper para calcular a média e total de avaliações
function calculateRatingStats(ratings) {
  if (!ratings || ratings.length === 0) {
    return { ratingAverage: 0, ratingCount: 0 };
  }
  const sum = ratings.reduce((acc, curr) => acc + curr, 0);
  const average = Number((sum / ratings.length).toFixed(1));
  return {
    ratingAverage: average,
    ratingCount: ratings.length
  };
}

// ROTA: Listar conteúdos
app.get('/api/posts', async (req, res) => {
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

// ROTA: Adicionar avaliação a um conteúdo
app.post('/api/posts/:id/rate', (req, res) => {
  const postId = parseInt(req.params.id);
  const { rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'A nota deve ser um número entre 1 e 5.' });
  }

  const post = posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }

  // Adiciona a nova avaliação ao post
  post.ratings.push(Number(rating));

  const stats = calculateRatingStats(post.ratings);

  res.json({
    message: 'Avaliação registrada com sucesso!',
    ratingAverage: stats.ratingAverage,
    ratingCount: stats.ratingCount
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});