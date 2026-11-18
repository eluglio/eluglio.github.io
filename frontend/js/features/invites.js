/* Envio de convites e leitura de convite pela URL. Tela: partials/invite-modal.html */

// Função para carregar dinamicamente os níveis permitidos do backend
async function loadAllowedInviteRoles() {
  if (!currentUser || !currentUser.id) return;

  const roleSelect = document.getElementById('inviteRole');
  if (!roleSelect) return;

  try {
    const response = await fetch(`${API_BASE_URL}/invitations/allowed-roles/${currentUser.id}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erro ao carregar níveis.');

    // Preenche o select com os papéis retornados pela API
    roleSelect.innerHTML = data.roles.map(r => `
      <option value="${r.value}">${r.label}</option>
    `).join('');

  } catch (err) {
    console.error('Erro ao buscar papéis de convite:', err);
    roleSelect.innerHTML = `<option value="" disabled>Erro ao carregar opções</option>`;
  }
}

async function openInviteModal() {
  const userRole = currentUser?.profile?.role;
  
  // Garante que apenas owners e admins conseguem abrir pela interface
  if (!currentUser || !currentUser.profile || (userRole !== 'owner' && userRole !== 'admin')) {
    showToast('Você não tem permissão para enviar convites.');
    return;
  }
  
  if (!(await ensureView('invite-modal'))) return;

  const modal = document.getElementById('inviteModal');
  if (modal) {
    modal.classList.remove('hidden');
    loadAllowedInviteRoles(); // 👈 Busca os papéis permitidos no backend ao abrir
    setInviteMethod('email'); // Reseta para o padrão e-mail
  }
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// ==================== LÓGICA DE CONVITES ====================
let currentInviteMethod = 'email';

function setInviteMethod(method) {
  currentInviteMethod = method;
  
  const emailBtn = document.getElementById('methodEmailBtn');
  const codeBtn = document.getElementById('methodCodeBtn');
  const directBtn = document.getElementById('methodDirectBtn');

  const emailGroup = document.getElementById('fieldEmailGroup');
  const codeGroup = document.getElementById('fieldCodeGroup');
  const directGroup = document.getElementById('fieldDirectGroup');
  const linkContainer = document.getElementById('generatedLinkContainer');

  // Reseta classes dos botões
  [emailBtn, codeBtn, directBtn].forEach(btn => {
    btn.className = 'py-2 text-xs font-medium rounded-xl border border-token text-secondary-token hover:text-primary-token transition-all';
  });

  // Esconde todos os grupos de inputs
  emailGroup.classList.add('hidden');
  codeGroup.classList.add('hidden');
  directGroup.classList.add('hidden');
  if (linkContainer) linkContainer.classList.add('hidden');

  // Ativa o botão selecionado e mostra o campo correspondente
  if (method === 'email') {
    emailBtn.className = 'py-2 text-xs font-semibold rounded-xl border border-brand bg-brand text-white transition-all';
    emailGroup.classList.remove('hidden');
  } else if (method === 'code') {
    codeBtn.className = 'py-2 text-xs font-semibold rounded-xl border border-brand bg-brand text-white transition-all';
    codeGroup.classList.remove('hidden');
  } else if (method === 'direct') {
    directBtn.className = 'py-2 text-xs font-semibold rounded-xl border border-brand bg-brand text-white transition-all';
    directGroup.classList.remove('hidden');
  }
}

async function handleSendInvite(event) {
  event.preventDefault();

  if (!currentUser || !currentUser.id) {
    showToast('Sessão expirada. Faça login novamente.');
    return;
  }

  const roleToGrant = document.getElementById('inviteRole').value;
  const inviteEmailInput = document.getElementById('inviteEmailInput');
  const inviteUserSearchInput = document.getElementById('inviteUserSearchInput');

  let inviteeEmail = null;
  let inviteeUserId = null;

  if (currentInviteMethod === 'email') {
    inviteeEmail = inviteEmailInput ? inviteEmailInput.value.trim() : null;
    if (!inviteeEmail) {
      showToast('Por favor, informe o e-mail do convidado.');
      return;
    }
  } else if (currentInviteMethod === 'direct') {
    // Se usar busca de usuário direto, ajuste conforme a sua implementação de busca
    inviteeUserId = inviteUserSearchInput ? inviteUserSearchInput.value.trim() : null;
  }

  const payload = {
    userId: currentUser.id,
    roleToGrant: roleToGrant,
    inviteType: currentInviteMethod,
    inviteeEmail: inviteeEmail,
    inviteeUserId: inviteeUserId ? parseInt(inviteeUserId) : null
  };

  try {
    showToast('Gerando e enviando convite...');
    
    const response = await fetch(`${API_BASE_URL}/invitations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao criar convite.');

    showToast(data.message || 'Convite processado com sucesso!');

    // Se houver um link gerado (por e-mail ou código), exibe na interface para cópia
    if (data.invite && data.invite.inviteLink) {
      const linkContainer = document.getElementById('generatedLinkContainer');
      const linkInput = document.getElementById('generatedLinkInput');
      if (linkContainer && linkInput) {
        linkInput.value = data.invite.inviteLink;
        linkContainer.classList.remove('hidden');
      }
    } else {
      closeInviteModal();
    }

    // Limpa os campos
    if (inviteEmailInput) inviteEmailInput.value = '';
    if (inviteUserSearchInput) inviteUserSearchInput.value = '';

  } catch (err) {
    console.error('Erro ao enviar convite:', err);
    showToast(err.message || 'Erro ao processar convite.');
  }
}

function copyGeneratedLink() {
  const linkInput = document.getElementById('generatedLinkInput');
  if (!linkInput || !linkInput.value) return;

  copyToClipboard(linkInput.value);
  showToast('Link de convite copiado para a área de transferência!');
}

// Função para verificar se o usuário abriu a página através de um link de convite
async function checkUrlForInvite() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('invite');

  if (!inviteCode) return;

  const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
  window.history.replaceState({ path: cleanUrl }, '', cleanUrl);

  try {
    showToast('Validando convite...');
    const response = await fetch(`${API_BASE_URL}/invitations/details/${inviteCode}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Convite inválido.');

    // Salva o código temporariamente para usar no registro
    window.pendingInviteCode = inviteCode;

    // Abre o modal de login/cadastro
    if (await showLoginModal()) {
      
      // Força o modo de cadastro
      if (!isRegisterMode) {
        toggleAuthMode();
      }

      // Preenche o e-mail e bloqueia o input para garantir que use o e-mail convidado
      const emailInput = document.getElementById('authEmail');
      if (emailInput) {
        emailInput.value = data.email;
        emailInput.setAttribute('readonly', 'true');
        emailInput.classList.add('bg-slate-100', 'dark:bg-zinc-800', 'cursor-not-allowed');
      }

      showToast(`Convite identificado para ${data.email}. Crie sua senha para concluir!`);
    }

  } catch (err) {
    console.error('Erro ao processar link de convite:', err);
    showToast(err.message || 'Link de convite inválido ou expirado.');
  }
}
