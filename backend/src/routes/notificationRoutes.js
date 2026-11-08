const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { createNotification } = require('../services/notificationService');

// ROTA: Buscar notificações não lidas do usuário
router.get('/unread/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 AND is_read = FALSE 
       ORDER BY created_at ASC`,
      [userId]
    );

    res.json({ notifications: rows });
  } catch (err) {
    console.error('Erro ao buscar notificações não lidas:', err);
    res.status(500).json({ error: 'Erro interno ao consultar notificações.' });
  }
});

// ROTA: Marcar uma ou todas as notificações como lidas
router.post('/mark-read', async (req, res) => {
  const { notificationIds, userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'ID de usuário obrigatório.' });

  try {
    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      await pool.query(
        'UPDATE notifications SET is_read = TRUE WHERE id = ANY($1::int[]) AND user_id = $2',
        [notificationIds, userId]
      );
    } else {
      // Se não passar IDs específicos, marca todas do usuário como lidas
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
    }

    res.json({ message: 'Notificações marcadas como lidas.' });
  } catch (err) {
    console.error('Erro ao marcar notificações como lidas:', err);
    res.status(500).json({ error: 'Erro ao atualizar status das notificações.' });
  }
});

// ROTA: Enviar notificação customizada para um usuário específico
router.post('/send-custom', async (req, res) => {
  const { senderUserId, targetUserId, type, title, message } = req.body;

  if (!senderUserId || !targetUserId || !type || !message) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  try {
    // 1. Valida se quem envia é admin ou owner
    const senderRes = await pool.query('SELECT role FROM profiles WHERE user_id = $1', [senderUserId]);
    if (senderRes.rows.length === 0 || !['owner', 'admin'].includes(senderRes.rows.label || senderRes.rows[0].role)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores e donos podem enviar notificações.' });
    }

    // 2. Insere a notificação na tabela
    await createNotification(
      targetUserId,
      type.toLowerCase(), // 'notificacao', 'alerta' ou 'advertencia'
      title,
      message,
      { senderId: senderUserId }
    );

    res.status(201).json({ message: 'Notificação enviada com sucesso!' });
  } catch (err) {
    console.error('Erro ao enviar notificação customizada:', err);
    res.status(500).json({ error: 'Erro interno ao enviar notificação.' });
  }
});
// ROTA: Listar todas as notificações de um usuário específico (para visão do Admin)
router.get('/user/:targetUserId', async (req, res) => {
  const { targetUserId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [targetUserId]
    );

    res.json({ notifications: rows });
  } catch (err) {
    console.error('Erro ao buscar notificações do usuário:', err);
    res.status(500).json({ error: 'Erro interno ao carregar notificações do usuário.' });
  }
});
module.exports = router;