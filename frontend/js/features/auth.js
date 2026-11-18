/* Autenticação (Google e e-mail), sessão e cabeçalho do usuário. Tela: partials/login-modal.html */

// ---------- Google Identity ----------
let googleAuthReady = false;

// Inicializa o Google Identity Services (aguarda o script carregar)
function initGoogleAuth() {
  if (window.google && google.accounts) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredentialResponse
    });
    googleAuthReady = true;
    renderGoogleButton();
  } else {
    setTimeout(initGoogleAuth, 500);
  }
}

// Renderiza o botão oficial do Google (o container só existe depois que o modal de login é carregado)
function renderGoogleButton() {
  if (!googleAuthReady) return;
  const btnContainer = document.getElementById('googleButtonDiv');
  if (btnContainer && !btnContainer.hasChildNodes()) {
    google.accounts.id.renderButton(
      btnContainer,
      { theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "pt-BR" }
    );
  }
}

// ---------- Modal de login ----------
// Carrega (se preciso) e exibe o modal, sem resetar o formulário
async function showLoginModal() {
  if (!(await ensureView('login-modal'))) return false;
  document.getElementById('loginModal').classList.remove('hidden');
  renderGoogleButton();
  return true;
}

// Abre o modal de login com o formulário limpo
async function openLoginModal() {
  if (!(await ensureView('login-modal'))) return;
  resetAuthModal();
  await showLoginModal();
}

function closeLoginModal() {
  resetAuthModal();
  document.getElementById('loginModal')?.classList.add('hidden');
}

// ---------- Sessão ----------
// Callback executado ao selecionar uma conta no Google
async function handleGoogleCredentialResponse(response) {
  showToast('Autenticando com o Google...');
  document.getElementById('loginModal')?.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE_URL}/users/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha na autenticação com Google.');

    currentUser = data.user;
    localStorage.setItem('agora-user', JSON.stringify(currentUser));
    updateHeaderUserUI();
    checkPendingInvites();
    checkUserNotifications();
    startNotificationPolling();
    showToast(`Bem-vindo(a), ${currentUser.profile.name}!`);

  } catch (error) {
    console.error('Erro no Login Google:', error);
    showToast(error.message || 'Erro ao realizar login.');
  }
}

function checkSavedUser() {
  const saved = localStorage.getItem('agora-user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateHeaderUserUI();
      checkPendingInvites();
    } catch (e) {
      localStorage.removeItem('agora-user');
    }
  }
}

function updateHeaderUserUI() {
  const container = document.getElementById('userHeaderContainer');
  const inviteBtn = document.getElementById('inviteBtn');
  const manageBtn = document.getElementById('manageInvitesBtn');
  if (!container) return;

  if (currentUser && currentUser.profile) {
    const cleanPictureUrl = sanitizeGoogleAvatarUrl(currentUser.profile.avatar_url);
    
    container.innerHTML = `
      <div class="flex items-center gap-2.5">
        <img onclick="openProfileSidebar();" src="${cleanPictureUrl || 'https://via.placeholder.com/40'}" alt="${currentUser.profile.name}" class="w-9 h-9 rounded-full object-cover border border-token shadow-sm cursor-pointer" title="Abrir perfil">
        <span class="hidden md:inline text-xs font-semibold text-primary-token">${currentUser.profile.name}</span>
        <button onclick="handleLogout()" class="text-secondary-token hover:text-brand p-1.5 rounded-lg text-xs" title="Sair">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    `;

    const userRole = currentUser.profile.role;

    // Exibe o botão de convite apenas para 'owner' e 'admin'
    if ((userRole === 'owner' || userRole === 'admin') && inviteBtn) {
      inviteBtn.classList.remove('hidden');
      inviteBtn.classList.add('flex');
    } else if (inviteBtn) {
      inviteBtn.classList.add('hidden');
      inviteBtn.classList.remove('flex');
    }

    // Exibe o botão de gestão apenas para 'owner' e 'admin'
    if ((userRole === 'owner' || userRole === 'admin') && manageBtn) {
      manageBtn.classList.remove('hidden');
      manageBtn.classList.add('flex');
    } else if (manageBtn) {
      manageBtn.classList.add('hidden');
      manageBtn.classList.remove('flex');
    }

  } else {
    container.innerHTML = `
      <button id="loginBtn" onclick="openLoginModal()" class="flex items-center gap-2 bg-brand hover:opacity-90 text-white font-medium px-4 py-2 rounded-xl text-xs sm:text-sm transition-all shadow-sm active:scale-95">
        <i class="fa-solid fa-right-to-bracket"></i>
        <span class="hidden sm:inline">Entrar / Cadastrar</span>
        <span class="sm:hidden">Entrar</span>
      </button>
    `;

    // Oculta os botões administrativos se não houver usuário logado
    if (inviteBtn) {
      inviteBtn.classList.add('hidden');
      inviteBtn.classList.remove('flex');
    }
    if (manageBtn) {
      manageBtn.classList.add('hidden');
      manageBtn.classList.remove('flex');
    }
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('agora-user');
  updateHeaderUserUI();
  resetAuthModal();
  showToast('Sessão encerrada.');
}

let isRegisterMode = false;

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const nameContainer = document.getElementById('nameFieldContainer');
  const submitBtn = document.getElementById('authSubmitBtn');
  const toggleText = document.getElementById('toggleAuthText');

  if (isRegisterMode) {
    nameContainer.classList.remove('hidden');
    document.getElementById('registerName').setAttribute('required', 'true');
    submitBtn.textContent = 'Criar Conta';
    toggleText.textContent = 'Já tem uma conta? Faça login';
  } else {
    nameContainer.classList.add('hidden');
    document.getElementById('registerName').removeAttribute('required');
    submitBtn.textContent = 'Acessar Conta';
    toggleText.textContent = 'Não tem uma conta? Cadastre-se';
  }
}

async function handleEmailAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('registerName').value;

  const endpoint = isRegisterMode ? `${API_BASE_URL}/users/register` : `${API_BASE_URL}/users/login`;
  const payload = isRegisterMode 
    ? { email, password, name, inviteCode: window.pendingInviteCode || null } 
    : { email, password };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro na autenticação.');

    currentUser = data.user;
    localStorage.setItem('agora-user', JSON.stringify(currentUser));
    updateHeaderUserUI();
    checkPendingInvites();
    checkUserNotifications();
    startNotificationPolling();
    resetAuthModal();
    document.getElementById('loginModal')?.classList.add('hidden');
    showToast(data.message || 'Sucesso!');

  } catch (error) {
    console.error('Erro na autenticação por e-mail:', error);
    showToast(error.message || 'Erro ao processar solicitação.');
  }
}

function resetAuthModal() {
  isRegisterMode = false;
  const nameContainer = document.getElementById('nameFieldContainer');
  const submitBtn = document.getElementById('authSubmitBtn');
  const toggleText = document.getElementById('toggleAuthText');
  const authForm = document.getElementById('authForm');

  if (nameContainer) nameContainer.classList.add('hidden');
  const registerName = document.getElementById('registerName');
  if (registerName) registerName.removeAttribute('required');

  if (submitBtn) submitBtn.textContent = 'Acessar Conta';
  if (toggleText) toggleText.textContent = 'Não tem uma conta? Cadastre-se';
  if (authForm) authForm.reset();
}
