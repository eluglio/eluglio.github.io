/* Convite pendente do usuário logado. Tela: partials/pending-invite-modal.html */

const ROLE_LABELS = {
  publisher: 'Publicador',
  admin: 'Administrador',
  owner: 'Dono'
};

let activePendingInvite = null;

// Verificar se o usuário logado possui convite pendente
async function checkPendingInvites() {
  if (!currentUser || !currentUser.id) return;

  try {
    const response = await fetch(`${API_BASE_URL}/invitations/pending/${currentUser.id}`);
    const data = await response.json();

    if (response.ok && data.hasPendingInvite) {
      activePendingInvite = data.invite;

      const roleName = ROLE_LABELS[data.invite.role_to_grant] || data.invite.role_to_grant;
      const inviterName = data.invite.inviter_name || 'Um administrador';

      if (!(await ensureView('pending-invite-modal'))) return;

      document.getElementById('pendingInviteText').innerHTML = `
        <strong>${inviterName}</strong> convidou você para se tornar <strong>${roleName}</strong> no Ágora Vermelha.
      `;

      document.getElementById('pendingInviteModal').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Erro ao verificar convites pendentes:', err);
  }
}

// Responder ao convite (Aceitar/Recusar)
async function respondPendingInvite(action) {
  if (!activePendingInvite || !currentUser) return;

  try {
    const response = await fetch(`${API_BASE_URL}/invitations/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteId: activePendingInvite.id,
        userId: currentUser.id,
        action: action
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao responder convite.');

    document.getElementById('pendingInviteModal').classList.add('hidden');
    showToast(data.message);

    // Se aceitou, atualiza o perfil em memória e a interface
    if (action === 'accept' && data.newRole) {
      currentUser.profile.role = data.newRole;
      localStorage.setItem('agora-user', JSON.stringify(currentUser));
      updateHeaderUserUI();
    }

    activePendingInvite = null;

  } catch (err) {
    console.error('Erro ao processar convite:', err);
    showToast(err.message);
  }
}
