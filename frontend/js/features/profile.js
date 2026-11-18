/* Perfil do usuário: nome, biografia e redes sociais. Tela: partials/profile-sidebar.html */

let currentProfileData = { name: '', bio: '', avatar_url: '', social_links: [] };

// Abrir e Fechar o Sidebar de Perfil
async function openProfileSidebar() {
  if (!(await ensureView('profile-sidebar'))) return;
  const sidebar = document.getElementById('profileSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const panel = document.getElementById('sidebarPanel');

  sidebar.classList.remove('hidden');
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    panel.classList.remove('translate-x-full');
  }, 10);

  loadProfileDataIntoSidebar();
}

function closeProfileSidebar() {
  const sidebar = document.getElementById('profileSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const panel = document.getElementById('sidebarPanel');

  overlay.classList.add('opacity-0');
  panel.classList.add('translate-x-full');
  setTimeout(() => {
    sidebar.classList.add('hidden');
  }, 300);
}

function loadProfileDataIntoSidebar() {
  if (!currentUser || !currentUser.profile) return;
  currentProfileData = JSON.parse(JSON.stringify(currentUser.profile));

  document.getElementById('sidebarAvatarImg').src = sanitizeGoogleAvatarUrl(currentProfileData.avatar_url) || 'https://via.placeholder.com/150';
  document.getElementById('profileNameText').textContent = currentProfileData.name || 'Sem nome';
  document.getElementById('profileNameInput').value = currentProfileData.name || '';

  const bioTextarea = document.getElementById('profileBioTextarea');
  bioTextarea.value = currentProfileData.bio || '';
  updateBioCounter();

  if (!Array.isArray(currentProfileData.social_links)) {
    if (typeof currentProfileData.social_links === 'string') {
      try {
        currentProfileData.social_links = JSON.parse(currentProfileData.social_links);
      } catch (e) {
        currentProfileData.social_links = [];
      }
    } else {
      currentProfileData.social_links = [];
    }
  }

  renderSocialLinks();
}

// Edição Inline de Nome
function enableNameEdit() {
  document.getElementById('nameDisplayContainer').classList.add('hidden');
  const input = document.getElementById('profileNameInput');
  input.classList.remove('hidden');
  input.focus();
}

function handleNameKeydown(event) {
  if (event.key === 'Enter') {
    event.target.blur();
  }
}

async function saveNameEdit() {
  const input = document.getElementById('profileNameInput');
  const newName = input.value.trim();

  document.getElementById('profileNameInput').classList.add('hidden');
  document.getElementById('nameDisplayContainer').classList.remove('hidden');

  if (!newName) {
    showToast('O nome não pode ficar em branco.');
    input.value = currentProfileData.name;
    return;
  }

  if (newName === currentProfileData.name) return;

  currentProfileData.name = newName;
  document.getElementById('profileNameText').textContent = newName;
  await persistProfileUpdate({ name: newName });
}

// Biografia
function updateBioCounter() {
  const textarea = document.getElementById('profileBioTextarea');
  const counter = document.getElementById('bioCounter');
  counter.textContent = `${textarea.value.length}/255`;
}

async function saveBioEdit() {
  const textarea = document.getElementById('profileBioTextarea');
  const newBio = textarea.value.trim();

  if (newBio === currentProfileData.bio) return;
  currentProfileData.bio = newBio;
  await persistProfileUpdate({ bio: newBio });
}

// Redes Sociais
function renderSocialLinks() {
  const container = document.getElementById('socialLinksList');
  container.innerHTML = '';
  const links = currentProfileData.social_links || [];

  if (links.length === 0) {
    container.innerHTML = `<p class="font-caption text-xs text-secondary-token italic">Nenhuma rede social cadastrada.</p>`;
    return;
  }

  links.forEach((url, index) => {
    const parsed = parseSocialUrl(url);
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2.5 rounded-xl border border-token surface-card text-xs';
    item.innerHTML = `
      <div class="flex items-center space-x-2.5 overflow-hidden">
        <i class="${parsed.icon} text-sm text-brand"></i>
        <a href="${url}" target="_blank" class="text-primary-token font-medium truncate hover:underline">${parsed.label}</a>
      </div>
      <button onclick="removeSocialLink(${index})" class="text-secondary-token hover:text-red-500 p-1 transition-colors">
        <i class="fa-solid fa-trash-can text-xs"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

function parseSocialUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;

    if (hostname.includes('github.com')) {
      const username = pathname.split('/')[1];
      return { icon: 'fa-brands fa-github', label: username ? `@${username}` : hostname };
    } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      const username = pathname.split('/')[1];
      return { icon: 'fa-brands fa-x-twitter', label: username ? `@${username}` : hostname };
    } else if (hostname.includes('instagram.com')) {
      const username = pathname.split('/')[1];
      return { icon: 'fa-brands fa-instagram', label: username ? `@${username}` : hostname };
    } else if (hostname.includes('linkedin.com')) {
      return { icon: 'fa-brands fa-linkedin', label: 'Perfil LinkedIn' };
    } else if (hostname.includes('youtube.com')) {
      return { icon: 'fa-brands fa-youtube', label: 'Canal YouTube' };
    } else if (hostname.includes('facebook.com')) {
      const username = pathname.split('/')[1];
      return { icon: 'fa-brands fa-facebook', label: username ? `@${username}` : hostname };
    }
  } catch (e) {}
  return { icon: 'fa-solid fa-link', label: url };
}

async function addSocialLink() {
  const input = document.getElementById('newSocialInput');
  const url = input.value.trim();
  if (!url) return;

  if (!Array.isArray(currentProfileData.social_links)) {
    currentProfileData.social_links = [];
  }

  currentProfileData.social_links.push(url);
  input.value = '';

  renderSocialLinks();
  await persistProfileUpdate({ social_links: currentProfileData.social_links });
}

async function removeSocialLink(index) {
  currentProfileData.social_links.splice(index, 1);
  renderSocialLinks();
  await persistProfileUpdate({ social_links: currentProfileData.social_links });
}

async function persistProfileUpdate(updatedFields) {
  try {
    if (!currentUser || !currentUser.id) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const payload = { userId: currentUser.id, ...updatedFields };

    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao salvar alterações.');

    currentUser.profile = { ...currentUser.profile, ...updatedFields };
    localStorage.setItem('agora-user', JSON.stringify(currentUser));
    updateHeaderUserUI();

    showToast('Alterações salvas!');
  } catch (err) {
    console.error('Erro em persistProfileUpdate:', err);
    showToast(err.message);
  }
}
