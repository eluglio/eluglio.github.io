require('dotenv').config();

const express = require('express');
const cors = require('cors');

const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const runMigrations = require('./runMigrations');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Registro das Rotas da API
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invitations', inviteRoutes);
app.use('/api/notifications', notificationRoutes);

// Rota padrão de verificação de saúde do servidor
app.get('/', (req, res) => {
  res.json({ status: 'API do Ágora Vermelha rodando com sucesso!' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Falha ao iniciar o servidor devido às migrations:', err);
  });