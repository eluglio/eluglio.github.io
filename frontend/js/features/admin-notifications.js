/* Notificações enviadas por administradores e histórico. Telas: frontend/partials/send-notification-modal.html e frontend/partials/user-notifications-modal.html */

// Abrir o modal de envio de notificação manual
async function openSendNotificationModal(userId, userNameEncoded) {
  if (!(await ensureView('send-notification-modal'))) return;
  const userName = decodeURIComponent(userNameEncoded);
  document.getElementById('targetNotificationUserId').value = userId;
  document.getElementById('targetUserNameLabel').textContent = `Destinatário: ${userName}`;
  document.getElementById('notificationMessageInput').value = '';
  document.getElementById('notificationTypeSelect').selectedIndex = 0;
  updateCustomNotifCounter();

  document.getElementById('sendNotificationModal').classList.remove('hidden');
}

function closeSendNotificationModal() {
  document.getElementById('sendNotificationModal').classList.add('hidden');
}

// Contador de caracteres (até 255)
function updateCustomNotifCounter() {
  const textarea = document.getElementById('notificationMessageInput');
  const counter = document.getElementById('customNotifCounter');
  if (textarea && counter) {
    counter.textContent = `${textarea.value.length}/255`;
  }
}

// Enviar a notificação customizada para o backend
async function handleSendCustomNotification(e) {
  e.preventDefault();

  const targetUserId = document.getElementById('targetNotificationUserId').value;
  const type = document.getElementById('notificationTypeSelect').value;
  const message = document.getElementById('notificationMessageInput').value.trim();

  if (!targetUserId || !message) return;

  // Define títulos padrão com base no tipo selecionado
  const titles = {
    'Notificação': 'Notificação da Administração',
    'Alerta': 'Alerta Importante',
    'Advertência': 'Advertência do Sistema'
  };

  try {
    showToast('Enviando notificação...');

    const response = await fetch(`${API_BASE_URL}/notifications/send-custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderUserId: currentUser.id,
        targetUserId: parseInt(targetUserId),
        type: type,
        title: titles[type] || 'Aviso',
        message: message
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao enviar notificação.');

    showToast(data.message);
    closeSendNotificationModal();

  } catch (err) {
    console.error('Erro ao enviar notificação customizada:', err);
    showToast(err.message || 'Erro ao processar envio.');
  }
}

// Abrir modal de histórico de notificações de um usuário específico
async function openUserNotificationsModal(targetUserId, userNameEncoded) {
  if (!targetUserId) {
    showToast('Este usuário ainda não possui cadastro ativo.');
    return;
  }

  const userName = decodeURIComponent(userNameEncoded);
  if (!(await ensureView('user-notifications-modal'))) return;

  document.getElementById('userNotifModalTitle').textContent = `Notificações de ${userName}`;
  
  const tbody = document.getElementById('userNotificationsTableBody');
  tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-secondary-token">Carregando notificações...</td></tr>`;

  document.getElementById('userNotificationsModal').classList.remove('hidden');

  try {
    const response = await fetch(`${API_BASE_URL}/notifications/user/${targetUserId}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erro ao carregar notificações.');

    if (!data.notifications || data.notifications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-secondary-token">Nenhuma notificação encontrada para este usuário.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.notifications.map(n => {
      const dateObj = new Date(n.created_at);
      const dateStr = dateObj.toLocaleDateString('pt-BR');
      const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const statusBadge = n.is_read 
        ? '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800">Lida</span>'
        : '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-600 border border-amber-200 dark:border-amber-800">Não lida</span>';

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
          <!-- Tipo / Título -->
          <td class="p-3.5 align-top">
            <div class="font-semibold text-primary-token">${n.type}</div>
            <div class="font-caption text-secondary-token text-[11px] leading-tight">${n.title}</div>
          </td>

          <!-- Mensagem com quebra de linha e largura ajustada -->
          <td class="p-3.5 align-top text-secondary-token leading-relaxed whitespace-normal break-words">
            ${n.message}
          </td>

          <!-- Data em cima / Hora embaixo -->
          <td class="p-3.5 align-top text-center text-secondary-token whitespace-nowrap">
            <div class="font-medium text-primary-token">${dateStr}</div>
            <div class="text-[11px] opacity-75">${timeStr}</div>
          </td>

          <!-- Status -->
          <td class="p-3.5 align-top text-center">
            ${statusBadge}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500">Erro ao carregar histórico de notificações.</td></tr>`;
  }
}

function closeUserNotificationsModal() {
  document.getElementById('userNotificationsModal').classList.add('hidden');
}
