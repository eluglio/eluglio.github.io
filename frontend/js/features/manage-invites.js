/* Gestão de convites e membros. Tela: partials/manage-invites-modal.html */

// Abrir o Modal de Gestão
async function openManageInvitesModal() {
  if (!currentUser || !currentUser.id) return;

  if (!(await ensureView('manage-invites-modal'))) return;

  const modal = document.getElementById('manageInvitesModal');
  modal.classList.remove('hidden');

  await loadManageInvitesTable();
}

function closeManageInvitesModal() {
  document.getElementById('manageInvitesModal').classList.add('hidden');
}

// Carregar os dados na tabela do Modal
async function loadManageInvitesTable() {
  const tbody = document.getElementById('manageInvitesTableBody');
  tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-secondary-token">Carregando convites...</td></tr>`;

  try {
    const response = await fetch(`${API_BASE_URL}/invitations/manage/${currentUser.id}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erro ao carregar dados.');

    if (!data.invites || data.invites.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-secondary-token">Nenhum convite encontrado.</td></tr>`;
      return;
    }

    const showRevoked = document.getElementById('showRevokedToggle')?.checked || false;

    const filteredInvites = showRevoked 
      ? data.invites 
      : data.invites.filter(item => item.status !== 'revoked');

    if (filteredInvites.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-secondary-token">Nenhum convite encontrado com os filtros atuais.</td></tr>`;
      return;
    }

    // Mapeamento de Badges de Letra Única
    const roleLetterBadges = {
      owner: { letter: 'D', style: 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 border-purple-200 dark:border-purple-800', title: 'Dono' },
      admin: { letter: 'A', style: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 border-blue-200 dark:border-blue-800', title: 'Administrador' },
      publisher: { letter: 'P', style: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 border-emerald-200 dark:border-emerald-800', title: 'Publicador' },
      consumer: { letter: 'C', style: 'bg-zinc-100 dark:bg-zinc-800 text-secondary-token border-token', title: 'Consumidor' }
    };

    const statusBadges = {
      pending: '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-600 border border-amber-200 dark:border-amber-800">Pendente</span>',
      accepted: '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800">Aceito</span>',
      declined: '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-token">Recusado</span>',
      revoked: '<span class="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-red-50 dark:bg-red-950/30 text-red-600 border border-red-200 dark:border-red-800">Revogado</span>'
    };

    tbody.innerHTML = filteredInvites.map(item => {
      const avatarSrc = item.invitee_avatar ? sanitizeGoogleAvatarUrl(item.invitee_avatar) : 'https://via.placeholder.com/40';
      
      const roleConfig = roleLetterBadges[item.role_to_grant] || roleLetterBadges.consumer;

      // Célula de notificações agregadas
      const counts = item.notification_counts || {};
      const countEntries = Object.entries(counts);
      
      let notificationsCellHTML = `<span class="text-secondary-token text-[11px] italic">-</span>`;
      if (countEntries.length > 0) {
        notificationsCellHTML = `
          <div class="flex flex-wrap justify-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" title="Clique para ver o histórico" onclick="openUserNotificationsModal(${item.invitee_user_id}, '${encodeURIComponent(item.invitee_name || item.invitee_email)}')">
            ${countEntries.map(([type, qty]) => `
              <span class="px-1.5 py-0.5 text-[10px] rounded font-medium bg-slate-100 dark:bg-zinc-800 text-primary-token border border-token">
                ${type}: <b>${qty}</b>
              </span>
            `).join('')}
          </div>
        `;
      }

      const actionTooltip = item.status === 'accepted' ? 'Revogar acesso (Rebaixar)' : 'Revogar convite';

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
          <!-- Convidado + Letra do Nível + E-mail e Convidador abaixo -->
          <td class="p-3">
            <div class="flex items-center gap-2.5">
              <img src="${avatarSrc}" alt="Avatar" class="w-8 h-8 rounded-full object-cover border border-token shadow-sm">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="font-semibold text-primary-token text-xs">${item.invitee_name || item.invitee_email || 'Link Genérico'}</span>
                  <span class="w-4 h-4 rounded-md ${roleConfig.style} flex items-center justify-center font-bold text-[9px]" title="Nível concedido: ${roleConfig.title}">
                    ${roleConfig.letter}
                  </span>
                </div>
                <div class="font-caption text-secondary-token text-[11px] leading-tight">
                  ${item.invitee_email ? `${item.invitee_email} • ` : ''} <span class="opacity-75">Convidado por: ${item.inviter_name}</span>
                </div>
              </div>
            </div>
          </td>

          <!-- Status -->
          <td class="p-3 text-center">${statusBadges[item.status] || item.status}</td>

          <!-- Notificações -->
          <td class="p-3 text-center">${notificationsCellHTML}</td>

          <!-- Ações (Apenas ícones) -->
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              ${item.status !== 'revoked' && item.invitee_user_id ? `
                <button onclick="openSendNotificationModal(${item.invitee_user_id}, '${encodeURIComponent(item.invitee_name || item.invitee_email)}')" class="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 transition-all shadow-sm active:scale-95" title="Enviar Notificação / Alerta">
                  <i class="fa-solid fa-triangle-exclamation text-xs"></i>
                </button>
              ` : ''}

              ${item.status !== 'revoked' && item.canRevoke ? `
                <button onclick="handleRevokeInvite(${item.id})" class="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-red-600 border border-red-200 dark:border-red-800 transition-all shadow-sm active:scale-95" title="${actionTooltip}">
                  <i class="fa-solid fa-user-minus text-xs"></i>
                </button>
              ` : (!item.canRevoke && item.status !== 'revoked' ? `
                <span class="text-secondary-token text-[10px] italic">Sem permissão</span>
              ` : '')}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500">Erro ao carregar tabela.</td></tr>`;
  }
}

// Ação de revogar ou rebaixar
async function handleRevokeInvite(inviteId) {
  if (!confirm('Tem certeza que deseja revogar este convite/rebaixar este membro?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/invitations/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteId: inviteId,
        requesterUserId: currentUser.id
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao revogar.');

    showToast(data.message);
    await loadManageInvitesTable();

  } catch (err) {
    console.error('Erro ao revogar convite:', err);
    showToast(err.message);
  }
}
