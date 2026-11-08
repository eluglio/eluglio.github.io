const pool = require('../config/db');

/**
 * Cria uma notificação genérica para um usuário.
 */
async function createNotification(userId, type, title, message, data = {}, client = null) {
  const dbClient = client || pool;
  const query = `
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES ($1, $2, $3, $4, $5, FALSE)
    RETURNING *
  `;
  const values = [userId, type, title, message, JSON.stringify(data)];
  
  const res = await dbClient.query(query, values);
  return res.rows[0];
}

module.exports = { createNotification };