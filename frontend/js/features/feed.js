/* Feed: carregamento, busca, filtros, cards e avaliação de posts. */

let currentPostsData = [];

let activeCategory = 'todos';

let searchQuery = '';

// Fetch Posts
async function fetchPosts() {
  const feedContainer = document.getElementById('postsFeed');
  
  try {
    const response = await fetch(`${API_BASE_URL}/posts`);
    if (!response.ok) throw new Error('Erro ao buscar posts da API');
    
    currentPostsData = await response.json();
    renderFilteredPosts();
  } catch (error) {
    console.error('Erro ao conectar com o backend:', error);
    if (feedContainer) {
      feedContainer.innerHTML = `
        <div class="surface-card rounded-2xl p-8 text-center border border-token">
          <p class="text-secondary-token">Não foi possível carregar o feed no momento.</p>
        </div>
      `;
    }
  }
}

function handleSearch() {
  searchQuery = document.getElementById('searchInput').value.toLowerCase();
  renderFilteredPosts();
}

function filterPosts(category, buttonElement) {
  activeCategory = category;

  document.querySelectorAll('.filter-tab, .nav-item').forEach(el => el.classList.remove('active', 'bg-brand', 'text-white'));
  if (buttonElement) {
    buttonElement.classList.add('active');
    if (buttonElement.classList.contains('filter-tab')) {
      buttonElement.classList.add('bg-brand', 'text-white');
    }
  }

  renderFilteredPosts();
}

function renderFilteredPosts() {
  let filtered = [...currentPostsData];

  if (activeCategory === 'Notícias') {
    filtered = filtered.filter(p => p.category === 'Notícias');
  } else if (activeCategory === 'Debates') {
    filtered = filtered.filter(p => p.category === 'Debates');
  } else if (activeCategory === 'Mais Avaliados') {
    filtered.sort((a, b) => b.ratingAverage - a.ratingAverage);
  }

  if (searchQuery) {
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(searchQuery) || 
      (p.text && p.text.toLowerCase().includes(searchQuery))
    );
  }

  renderFeed(filtered);
}

function renderFeed(posts) {
  const feedContainer = document.getElementById('postsFeed');
  if (!posts || posts.length === 0) {
    feedContainer.innerHTML = `
      <div class="surface-card rounded-2xl p-8 text-center border border-token">
        <p class="text-secondary-token">Nenhum conteúdo encontrado para o filtro selecionado.</p>
      </div>
    `;
    return;
  }

  feedContainer.innerHTML = posts.map(post => createPostCardHTML(post)).join('');
}

function createPostCardHTML(post) {
  return `
    <article class="surface-card rounded-2xl border border-token shadow-sm hover:shadow-md transition-all overflow-hidden" id="post-${post.id}">
      <div class="p-5 flex items-center justify-between border-b border-token">
        <div class="flex items-center gap-3">
          <img src="${escapeHTML(post.avatar || 'https://via.placeholder.com/40')}" alt="${escapeHTML(post.author)}" class="w-10 h-10 rounded-full object-cover">
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-primary-token text-xs sm:text-sm">${escapeHTML(post.author)}</h4>
              <span class="bg-red-50 dark:bg-zinc-800 brand-accent text-[10px] font-semibold px-2 py-0.5 rounded-md border border-red-100 dark:border-zinc-700">${escapeHTML(post.category || 'Geral')}</span>
            </div>
            <p class="font-caption text-secondary-token">${post.createdAt ? new Date(post.createdAt).toLocaleDateString('pt-BR') : ''}</p>
          </div>
        </div>
      </div>

      <div class="p-5 space-y-3">
        <h3 class="font-h1 text-primary-token leading-snug">${escapeHTML(post.title)}</h3>
        <p class="text-secondary-token text-sm leading-relaxed whitespace-pre-line">${escapeHTML(post.text || '')}</p>
        
        ${renderPostMedia(post)}
        ${renderPostSourceLink(post)}
      </div>

      <div class="px-5 py-4 bg-slate-50/50 dark:bg-zinc-900/40 border-t border-token flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <span class="font-caption text-secondary-token font-semibold">Avaliação:</span>
          <div class="star-rating flex items-center gap-1 text-amber-400 text-base cursor-pointer">
            ${[1, 2, 3, 4, 5].map(star => `
              <i class="${star <= Math.round(post.ratingAverage || 0) ? 'fa-solid' : 'fa-regular'} fa-star" 
                 onclick="ratePost(${post.id}, ${star})" 
                 title="Avaliar com ${star} estrela(s)"></i>
            `).join('')}
          </div>
          <span id="rating-avg-${post.id}" class="font-bold text-xs">${post.ratingAverage || '0.0'}</span>
          <span id="rating-count-${post.id}" class="text-xs text-secondary-token">(${post.ratingCount || 0})</span>
        </div>

        <button onclick="openShareMenu(${post.id})" class="inline-flex items-center justify-center gap-2 surface-card border border-token hover:bg-slate-100 dark:hover:bg-zinc-800 text-primary-token font-medium px-4 py-2 rounded-xl text-xs transition-all active:scale-95">
          <i class="fa-solid fa-share-nodes brand-accent"></i>
          <span>Compartilhar</span>
        </button>
      </div>
    </article>
  `;
}

// Mídia da publicação: imagem/GIF ou vídeo (arquivo no S3 ou link externo)
function renderPostMedia(post) {
  const url = safeHttpUrl(post.mediaUrl || post.image);
  if (!url) return '';

  const wrapperClass = 'mt-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-token';

  if (post.mediaType === 'video') {
    return `
      <div class="${wrapperClass}">
        <video src="${escapeHTML(url)}" controls preload="metadata" playsinline class="w-full max-h-96 bg-black"></video>
      </div>`;
  }

  return `
    <div class="${wrapperClass}">
      <img src="${escapeHTML(url)}" alt="${escapeHTML(post.title)}" referrerpolicy="no-referrer" class="w-full max-h-96 object-cover hover:scale-102 transition-transform duration-300" loading="lazy">
    </div>`;
}

// Link para a publicação original (quando veio de outra rede social)
function renderPostSourceLink(post) {
  const url = safeHttpUrl(post.sourceUrl);
  if (!url) return '';

  return `
    <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-caption text-secondary-token hover:text-brand transition-colors">
      <i class="fa-solid fa-arrow-up-right-from-square"></i> Ver publicação original
    </a>`;
}

async function ratePost(postId, rating) {
  try {
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: rating })
    });

    if (!response.ok) throw new Error('Falha ao enviar avaliação');
    const data = await response.json();
    
    const ratingAverageEl = document.getElementById(`rating-avg-${postId}`);
    const ratingCountEl = document.getElementById(`rating-count-${postId}`);

    if (ratingAverageEl) ratingAverageEl.textContent = data.ratingAverage;
    if (ratingCountEl) ratingCountEl.textContent = `(${data.ratingCount})`;

    showToast('Avaliação registrada com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar avaliação:', error);
    showToast('Erro ao enviar avaliação.');
  }
}
