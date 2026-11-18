/* Compartilhamento de posts. Tela: partials/share-modal.html */

async function openShareMenu(postId) {
  if (!(await ensureView('share-modal'))) return;
  const post = currentPostsData.find(p => p.id === postId);
  if (!post) return;

  const shareModal = document.getElementById('shareModal');
  const shareList = document.getElementById('shareOptionsList');
  const textToShare = `${post.title} - Ágora Vermelha`;
  const currentUrl = window.location.href;

  const sharePlatforms = [
    {
      name: 'WhatsApp',
      icon: 'fa-brands fa-whatsapp',
      color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800',
      action: () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textToShare + ' ' + currentUrl)}`, '_blank')
    },
    {
      name: 'X (Twitter)',
      icon: 'fa-brands fa-x-twitter',
      color: 'bg-zinc-100 dark:bg-zinc-800 text-primary-token border-token',
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(textToShare)}&url=${encodeURIComponent(currentUrl)}`, '_blank')
    },
    {
      name: 'Copiar Link',
      icon: 'fa-solid fa-link',
      color: 'bg-slate-50 dark:bg-zinc-800 text-secondary-token border-token',
      action: () => {
        copyToClipboard(currentUrl);
        showToast('Link copiado!');
      }
    }
  ];

  shareList.innerHTML = sharePlatforms.map(p => `
    <button onclick="executeShare('${p.name}')" class="flex items-center gap-2.5 p-3 rounded-2xl border text-xs font-semibold transition-all ${p.color}">
      <i class="${p.icon} text-base"></i>
      <span>${p.name}</span>
    </button>
  `).join('');

  window.activeSharePlatforms = sharePlatforms;
  shareModal.classList.remove('hidden');
}

function executeShare(name) {
  const platform = window.activeSharePlatforms.find(p => p.name === name);
  if (platform) platform.action();
  document.getElementById('shareModal').classList.add('hidden');
}

function closeShareModal() {
  document.getElementById('shareModal')?.classList.add('hidden');
}
