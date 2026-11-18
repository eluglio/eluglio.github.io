/* Notificações do usuário logado (polling e aviso). Tela: partials/revoke-notice-modal.html */

let currentUnreadNotifications = [];

// Função para verificar notificações não lidas
async function checkUserNotifications() {
  if (!currentUser || !currentUser.id) return;

  try {
    const response = await fetch(`${API_BASE_URL}/notifications/unread/${currentUser.id}`);
    const data = await response.json();

    if (response.ok && data.notifications && data.notifications.length > 0) {
      currentUnreadNotifications = data.notifications;

      const notificacoes = data.notifications[0];
      console.log(notificacoes);
      console.log(notificacoes.title);
      console.log(notificacoes.message);

      if (notificacoes) {
        if (!(await ensureView('revoke-notice-modal'))) return;

        document.getElementById('noticeModalTitle').textContent = notificacoes.title;
        document.getElementById('noticeModalText').innerHTML = notificacoes.message;
        document.getElementById('revokeNoticeModal').classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro ao consultar notificações:', err);
  }
}

// Ação do botão "Entendido": marca como lida e recarrega a tela
async function confirmRevokeNotice() {
  if (currentUser && currentUser.id) {
    const revokeIds = currentUnreadNotifications
      .filter(n => n.type === 'role_revoked')
      .map(n => n.id);

    try {
      await fetch(`${API_BASE_URL}/notifications/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          notificationIds: revokeIds
        })
      });
    } catch (e) {
      console.error('Erro ao marcar notificação como lida:', e);
    }
  }

  window.location.reload();
}

let notificationInterval = null;

// Inicia a verificação periódica de notificações (a cada 10 segundos)
function startNotificationPolling() {
  if (notificationInterval) return; // Evita múltiplos intervalos duplicados

  // Executa uma vez logo ao iniciar
  checkUserNotifications();

  // Configura o timer para rodar a cada 10 segundos
  notificationInterval = setInterval(() => {
    checkUserNotifications();
  }, 10000);
}

// Para a verificação ao sair da conta
function stopNotificationPolling() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
}
