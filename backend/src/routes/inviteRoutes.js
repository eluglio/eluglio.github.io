const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const { sendInviteEmail } = require('../services/emailService'); 
const { createNotification } = require('../services/notificationService');

// Mapeamento numérico da hierarquia para comparação rápida
const ROLE_HIERARCHY = {
  consumer: 1,
  publisher: 2,
  admin: 3,
  owner: 4
};

// Middleware de verificação de permissão 'owner'
async function requireOwner(req, res, next) {
  const { userId } = req.body;
  if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

  try {
    const userRes = await pool.query('SELECT role FROM profiles WHERE user_id = $1', [userId]);
    if (userRes.rows.length === 0 || userRes.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Acesso negado. Apenas o Dono pode realizar esta ação.' });
    }
    next();
  } catch (err) {
    console.error('Erro ao verificar permissão de owner:', err);
    res.status(500).json({ error: 'Erro interno ao validar permissões.' });
  }
}

router.post('/create', requireOwner, async (req, res) => {
  const { userId, roleToGrant, inviteType, inviteeEmail, inviteeUserId } = req.body;

  if (!roleToGrant || !inviteType) {
    return res.status(400).json({ error: 'Nível e tipo de convite são obrigatórios.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let targetEmail = inviteeEmail ? inviteeEmail.toLowerCase().trim() : null;
    let targetUserId = inviteeUserId || null;

    if (inviteType === 'email' && !targetEmail) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Informe o e-mail do convidado.' });
    }

    // 1. Verificar se o usuário JÁ EXISTE no sistema (via ID ou E-mail)
    let existingUser = null;
    if (targetUserId) {
      const uRes = await client.query(
        'SELECT u.id, u.email, p.role FROM users u JOIN profiles p ON u.id = p.user_id WHERE u.id = $1',
        [targetUserId]
      );
      existingUser = uRes.rows[0];
    } else if (targetEmail) {
      const uRes = await client.query(
        'SELECT u.id, u.email, p.role FROM users u JOIN profiles p ON u.id = p.user_id WHERE LOWER(u.email) = $1',
        [targetEmail]
      );
      existingUser = uRes.rows[0];
    }

    const grantedLevel = ROLE_HIERARCHY[roleToGrant] || 1;

    // REQUISITO 3: Se o usuário já existe e possui nível igual ou superior, bloqueia o envio
    if (existingUser) {
      const currentLevel = ROLE_HIERARCHY[existingUser.role] || 1;
      if (currentLevel >= grantedLevel) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Não é possível atribuir esse nível a esse usuário.' });
      }

      // Garante vínculo correto
      targetUserId = existingUser.id;
      targetEmail = existingUser.email;
    }

    // 2. REQUISITO 4: Tratar convites pendentes existentes para este usuário/e-mail
    const pendingRes = await client.query(
      `SELECT id, role_to_grant FROM invitations 
       WHERE (invitee_user_id = $1 OR (invitee_email = $2 AND invitee_email IS NOT NULL)) 
         AND status = 'pending'`,
      [targetUserId, targetEmail]
    );

    for (const pendingInvite of pendingRes.rows) {
      const existingPendingLevel = ROLE_HIERARCHY[pendingInvite.role_to_grant] || 1;

      // Se o novo convite tem nível superior, revoga o convite pendente antigo
      if (grantedLevel > existingPendingLevel) {
        await client.query("UPDATE invitations SET status = 'revoked' WHERE id = $1", [pendingInvite.id]);
      } else {
        // Se o novo convite não for estritamente superior ao pendente atual, rejeita a criação
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Já existe um convite pendente de nível igual ou superior para este usuário.' 
        });
      }
    }

    // 3. Criar o novo convite
    let inviteCode = null;
    let inviteLink = null;

    // Gera código/link apenas se o usuário for novo/inexistente ou se for tipo 'code'
    if (!existingUser || inviteType === 'code') {
      inviteCode = crypto.randomBytes(32).toString('hex');
      const origin = req.headers.origin || 'https://eluglio.github.io';
      inviteLink = `${origin}/?invite=${inviteCode}`;
    }

    const newInvite = await client.query(
      `INSERT INTO invitations (inviter_id, invitee_email, invitee_user_id, role_to_grant, code, type, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [userId, targetEmail, targetUserId, roleToGrant, inviteCode, inviteType]
    );

    await client.query('COMMIT');

    // REQUISITO 1: Enviar e-mail com link APENAS se o usuário AINDA NÃO EXISTIR
    if (!existingUser && inviteType === 'email' && targetEmail && inviteLink) {
      sendInviteEmail(targetEmail, roleToGrant, inviteLink).catch(err => {
        console.error('Falha ao enviar e-mail de convite:', err);
      });
    }

    res.status(201).json({
      message: existingUser 
        ? 'Convite registrado! O usuário verá uma notificação ao fazer login.' 
        : 'Convite enviado por e-mail com sucesso!',
      invite: {
        ...newInvite.rows[0],
        inviteLink
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar convite:', err);
    res.status(500).json({ error: 'Erro interno ao processar convite.' });
  } finally {
    client.release();
  }
});

// ROTA: Validar e Aceitar Convite via Link Único (Código)
router.post('/accept-code', async (req, res) => {
  const { code, userId } = req.body;

  if (!code || !userId) {
    return res.status(400).json({ error: 'Código ou usuário inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Busca o convite pendente pelo código
    const inviteRes = await client.query(
      'SELECT * FROM invitations WHERE code = $1 AND status = $2 AND type = $3',
      [code, 'pending', 'code']
    );

    if (inviteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Convite inválido ou já utilizado.' });
    }

    const invite = inviteRes.rows[0];

    // 2. Atualiza o papel (role) do usuário e define quem o convidou
    await client.query(
      'UPDATE profiles SET role = $1, invited_by = $2 WHERE user_id = $3',
      [invite.role_to_grant, invite.inviter_id, userId]
    );

    // 3. Invalida o convite alterando o status para 'accepted' (Garantindo uso único)
    await client.query(
      'UPDATE invitations SET status = $1, invitee_user_id = $2 WHERE id = $3',
      ['accepted', userId, invite.id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Convite aceito com sucesso! Seu nível foi atualizado.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao aceitar convite por código:', err);
    res.status(500).json({ error: 'Erro ao processar aceitação de convite.' });
  }
});

// ROTA: Obter detalhes do convite pelo código (para preencher o cadastro)
router.get('/details/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const inviteRes = await pool.query(
      'SELECT invitee_email, role_to_grant, status FROM invitations WHERE code = $1',
      [code]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Convite inválido ou não encontrado.' });
    }

    const invite = inviteRes.rows[0];

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Este convite já foi utilizado ou expirou.' });
    }

    res.json({
      email: invite.invitee_email,
      roleToGrant: invite.role_to_grant
    });

  } catch (err) {
    console.error('Erro ao buscar detalhes do convite:', err);
    res.status(500).json({ error: 'Erro interno ao validar convite.' });
  }
});
// ROTA: Buscar convite pendente para o usuário logado
router.get('/pending/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Busca e-mail do usuário
    const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const userEmail = userRes.rows[0].email;

    // Busca convite pendente por ID ou por E-mail
    const inviteRes = await pool.query(
      `SELECT i.*, p.name as inviter_name 
       FROM invitations i
       JOIN profiles p ON i.inviter_id = p.user_id
       WHERE (i.invitee_user_id = $1 OR LOWER(i.invitee_email) = $2) 
         AND i.status = 'pending'
       ORDER BY i.created_at DESC LIMIT 1`,
      [userId, userEmail.toLowerCase()]
    );

    if (inviteRes.rows.length === 0) {
      return res.json({ hasPendingInvite: false });
    }

    res.json({
      hasPendingInvite: true,
      invite: inviteRes.rows[0]
    });

  } catch (err) {
    console.error('Erro ao buscar convites pendentes:', err);
    res.status(500).json({ error: 'Erro interno ao consultar convites.' });
  }
});

// ROTA: Responder a um convite (Aceitar ou Recusar)
router.post('/respond', async (req, res) => {
  const { inviteId, userId, action } = req.body; // action: 'accept' ou 'decline'

  if (!inviteId || !userId || !['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteRes = await client.query(
      'SELECT * FROM invitations WHERE id = $1 AND status = $2',
      [inviteId, 'pending']
    );

    if (inviteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Convite não encontrado ou já respondido.' });
    }

    const invite = inviteRes.rows[0];

    if (action === 'accept') {
      // Promove o usuário para o novo nível e registra quem o convidou
      await client.query(
        'UPDATE profiles SET role = $1, invited_by = $2 WHERE user_id = $3',
        [invite.role_to_grant, invite.inviter_id, userId]
      );

      await client.query(
        'UPDATE invitations SET status = $1, invitee_user_id = $2 WHERE id = $3',
        ['accepted', userId, inviteId]
      );

      await client.query('COMMIT');
      return res.json({ message: 'Convite aceito com sucesso! Seu nível foi atualizado.', newRole: invite.role_to_grant });

    } else {
      // Caso recuse o convite
      await client.query(
        'UPDATE invitations SET status = $1 WHERE id = $2',
        ['declined', inviteId]
      );

      await client.query('COMMIT');
      return res.json({ message: 'Convite recusado.' });
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao responder convite:', err);
    res.status(500).json({ error: 'Erro ao processar resposta do convite.' });
  } finally {
    client.release();
  }
});

// ROTA: Obter níveis permitidos para convite com base no papel do usuário
router.get('/allowed-roles/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const userRes = await pool.query('SELECT role FROM profiles WHERE user_id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const userRole = userRes.rows.label || userRes.rows[0].role;
    let allowedRoles = [];

    // Dono (owner) pode convidar: Dono, Administradores e Publicadores
    if (userRole === 'owner') {
      allowedRoles = [
        { value: 'publisher', label: 'Publicador' },
        { value: 'admin', label: 'Administrador' },
        { value: 'owner', label: 'Dono' }
      ];
    } 
    // Administrador (admin) pode convidar apenas: Publicadores
    else if (userRole === 'admin') {
      allowedRoles = [
        { value: 'publisher', label: 'Publicador' }
      ];
    }

    res.json({ roles: allowedRoles });

  } catch (err) {
    console.error('Erro ao buscar papéis permitidos:', err);
    res.status(500).json({ error: 'Erro interno ao carregar opções de convite.' });
  }
});
// ROTA: Listar convites e membros com base nas permissões de quem consulta
router.get('/manage/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Busca perfil do usuário logado
    const requesterRes = await pool.query(
      'SELECT role, invited_by FROM profiles WHERE user_id = $1',
      [userId]
    );

    if (requesterRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const { role: requesterRole, invited_by: requesterInvitedBy } = requesterRes.rows[0];

    // Apenas Admins e Owners têm acesso à gestão
    if (requesterRole !== 'owner' && requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores e donos podem gerenciar convites.' });
    }

    const isRootOwner = (requesterRole === 'owner' && !requesterInvitedBy);

    // 2. Busca todos os convites (pendentes, aceitos e revogados) com dados do convidado e do criador
    const invitesQuery = `
        SELECT 
            i.id,
            i.inviter_id,
            i.invitee_email,
            i.invitee_user_id,
            i.role_to_grant,
            i.status,
            i.created_at,
            inviter_prof.name AS inviter_name,
            target_prof.name AS invitee_name,
            target_prof.role AS current_target_role,
            target_prof.avatar_url AS invitee_avatar,
            COALESCE(
            (SELECT json_object_agg(n.type, n.cnt) 
            FROM (SELECT type, COUNT(*) as cnt FROM notifications WHERE user_id = target_prof.user_id GROUP BY type) n), 
            '{}'::json
            ) AS notification_counts
        FROM invitations i
        JOIN profiles inviter_prof ON i.inviter_id = inviter_prof.user_id
        LEFT JOIN profiles target_prof ON i.invitee_user_id = target_prof.user_id
        ORDER BY i.created_at DESC
        `;

    const { rows: allInvites } = await pool.query(invitesQuery);

    // 3. Aplica as regras de visibilidade e capacidade de ação por item
    const managedItems = allInvites.map(item => {
      let canRevoke = false;

      const targetRole = item.current_target_role || item.role_to_grant;
      const isSelfInvited = (item.inviter_id === parseInt(userId));

      if (isRootOwner) {
        // Dono raiz (não convidado por ninguém) pode revogar qualquer convite/usuário (exceto ele mesmo)
        canRevoke = (item.invitee_user_id !== parseInt(userId));
      } else if (requesterRole === 'owner') {
        // Dono convidado:
        // - Revoga qualquer convite/membro Admin e Publicador
        // - Revoga Donos apenas se ele mesmo tiver convidado
        if (targetRole === 'admin' || targetRole === 'publisher' || targetRole === 'consumer') {
          canRevoke = true;
        } else if (targetRole === 'owner' && isSelfInvited) {
          canRevoke = true;
        }
      } else if (requesterRole === 'admin') {
        // Admin: apenas revoga Publicadores que ele mesmo convidou
        if (targetRole === 'publisher' && isSelfInvited) {
          canRevoke = true;
        }
      }

      return {
        ...item,
        canRevoke
      };
    });

    res.json({
      requesterRole,
      isRootOwner,
      invites: managedItems
    });

  } catch (err) {
    console.error('Erro ao listar convites para gestão:', err);
    res.status(500).json({ error: 'Erro interno ao carregar painel de gestão.' });
  }
});
// ROTA: Revogar convite / Rebaixar usuário com fallback histórico
router.post('/revoke', async (req, res) => {
  const { inviteId, requesterUserId } = req.body;

  if (!inviteId || !requesterUserId) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
  }

  // 👈 Objeto de tradução dos rótulos de papéis
  const roleLabels = {
    owner: 'Dono',
    admin: 'Administrador',
    publisher: 'Publicador',
    consumer: 'Consumidor (Visualizador)'
  };

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Busca os dados do solicitante
    const reqRes = await client.query('SELECT role, invited_by FROM profiles WHERE user_id = $1', [requesterUserId]);
    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitante não encontrado.' });
    }
    const { role: reqRole, invited_by: reqInvitedBy } = reqRes.rows[0];
    const isRootOwner = (reqRole === 'owner' && !reqInvitedBy);

    // 2. Busca o convite que será revogado
    const invRes = await client.query('SELECT * FROM invitations WHERE id = $1', [inviteId]);
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    const invite = invRes.rows[0];

    // 3. Validação de segurança das permissões no Backend
    let targetRole = invite.role_to_grant;
    if (invite.invitee_user_id) {
      const targetProf = await client.query('SELECT role FROM profiles WHERE user_id = $1', [invite.invitee_user_id]);
      if (targetProf.rows.length > 0) targetRole = targetProf.rows[0].role;
    }

    const isSelfInvited = (invite.inviter_id === parseInt(requesterUserId));
    let allowed = false;

    if (isRootOwner) {
      allowed = (invite.invitee_user_id !== parseInt(requesterUserId));
    } else if (reqRole === 'owner') {
      if (['admin', 'publisher', 'consumer'].includes(targetRole)) allowed = true;
      else if (targetRole === 'owner' && isSelfInvited) allowed = true;
    } else if (reqRole === 'admin') {
      if (targetRole === 'publisher' && isSelfInvited) allowed = true;
    }

    if (!allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Você não tem permissão para revogar este convite ou rebaixar este usuário.' });
    }

    // 4. Marca o convite alvo como 'revoked'
    await client.query("UPDATE invitations SET status = 'revoked' WHERE id = $1", [inviteId]);

    // 5. Se o convite já havia sido aceito (usuário existente vinculado), aplica o REBAIXAMENTO HISTÓRICO
    let newRoleApplied = null;
    if (invite.invitee_user_id) {
      const targetUserId = invite.invitee_user_id;

      // Busca o ÚLTIMO convite aceito por este usuário que NÃO SEJA o que acabou de ser revogado
      const previousInviteRes = await client.query(
        `SELECT role_to_grant, inviter_id FROM invitations 
         WHERE invitee_user_id = $1 
           AND status = 'accepted' 
           AND id != $2 
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [targetUserId, inviteId]
      );

      if (previousInviteRes.rows.length > 0) {
        newRoleApplied = previousInviteRes.rows[0].role_to_grant;
        const previousInviter = previousInviteRes.rows[0].inviter_id;

        await client.query(
          'UPDATE profiles SET role = $1, invited_by = $2 WHERE user_id = $3',
          [newRoleApplied, previousInviter, targetUserId]
        );
      } else {
        newRoleApplied = 'consumer';
        await client.query(
          'UPDATE profiles SET role = $1, invited_by = NULL WHERE user_id = $2',
          ['consumer', targetUserId]
        );
      }

      // 🔔 Cria a notificação de revogação/rebaixamento
      const newRoleName = roleLabels[newRoleApplied] || newRoleApplied;
      await createNotification(
        targetUserId,
        'role_revoked',
        'Aviso de Alteração de Acesso',
        `Seu acesso foi revogado ou rebaixado. Seu nível atual passou a ser: ${newRoleName}.`,
        { newRole: newRoleApplied },
        client
      );
    }

    await client.query('COMMIT');

    res.json({
      message: newRoleApplied 
        ? `Convite revogado! O usuário foi rebaixado para: ${newRoleApplied}`
        : 'Convite pendente revogado com sucesso!'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao revogar convite:', err);
    res.status(500).json({ error: 'Erro interno ao revogar convite.' });
  } finally {
    client.release();
  }
});
module.exports = router;