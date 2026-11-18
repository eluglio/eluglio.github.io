/* Nova publicação: botão "+", modal de composição, mídia, localização e envio.
 * Tela: partials/post-composer-modal.html
 * Depende de: core/location.js, features/post-link-preview.js
 */

let composerMode = 'write'; // write | link
let composerFile = null;
let composerFileUrl = null;
let composerLocation = null;
let composerLocationState = 'idle'; // idle | loading | ready | error
let composerUpload = null; // XMLHttpRequest em andamento

// ---------- Abrir / fechar ----------
async function openPostComposer() {
  if (!currentUser || !currentUser.id) {
    showToast('Entre na sua conta para criar uma publicação.');
    openLoginModal();
    return;
  }

  if (!(await ensureView('post-composer-modal'))) return;

  resetComposer();
  document.getElementById('postComposerModal').classList.remove('hidden');
  requestComposerLocation();
}

function closePostComposer() {
  if (composerUpload) composerUpload.abort();
  resetLinkPreview();
  clearComposerFile();
  document.getElementById('postComposerModal')?.classList.add('hidden');
}

function resetComposer() {
  document.getElementById('postComposerForm').reset();
  clearComposerFile();
  resetLinkPreview();
  setComposerMode('write');
  setComposerError('');
  setComposerProgress(null);
  updateComposerTextCounter();
  updateComposerState();
}

// ---------- Modo: escrever / a partir de link ----------
function switchComposerMode(mode) {
  if (mode === composerMode) return;

  // Cada modo começa limpo para não misturar conteúdo digitado com conteúdo do link
  document.getElementById('composerTitle').value = '';
  document.getElementById('composerText').value = '';
  clearComposerFile();
  resetLinkPreview();
  setComposerError('');
  setComposerMode(mode);
  updateComposerTextCounter();
  updateComposerState();
}

function setComposerMode(mode) {
  composerMode = mode;
  const isLink = mode === 'link';
  const on = 'py-2 text-xs font-semibold rounded-xl border border-brand bg-brand text-white transition-all';
  const off = 'py-2 text-xs font-medium rounded-xl border border-token text-secondary-token hover:text-primary-token transition-all';

  document.getElementById('composerLinkGroup').classList.toggle('hidden', !isLink);
  document.getElementById('composerMediaGroup').classList.toggle('hidden', isLink);
  document.getElementById('composerModeWriteBtn').className = isLink ? off : on;
  document.getElementById('composerModeLinkBtn').className = isLink ? on : off;
}

// ---------- Mídia (arquivo) ----------
function handleComposerFileSelected(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite selecionar o mesmo arquivo de novo
  if (!file) return;

  if (!POST_MEDIA_ACCEPTED_TYPES.includes(file.type)) {
    return setComposerError('Formato não suportado. Use imagem (JPG, PNG, WebP, GIF) ou vídeo (MP4, WebM, MOV).');
  }
  if (file.size > POST_MEDIA_MAX_BYTES) {
    return setComposerError(`O arquivo tem ${formatBytes(file.size)} e o limite é ${formatBytes(POST_MEDIA_MAX_BYTES)}.`);
  }

  setComposerError('');
  clearComposerFile();
  composerFile = file;
  composerFileUrl = URL.createObjectURL(file);

  showMediaPreview('composerMediaPreview', composerFileUrl, file.type.startsWith('video/') ? 'video' : 'image', true);
  document.getElementById('composerDropArea').classList.add('hidden');
  updateComposerState();
}

function clearComposerFile() {
  if (composerFileUrl) URL.revokeObjectURL(composerFileUrl);
  composerFile = null;
  composerFileUrl = null;

  const preview = document.getElementById('composerMediaPreview');
  if (preview) {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
  document.getElementById('composerDropArea')?.classList.remove('hidden');
  updateComposerState();
}

// Pré-visualização de imagem/GIF/vídeo (arquivo local ou mídia vinda de um link)
function showMediaPreview(containerId, url, type, removable) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const media = type === 'video'
    ? `<video src="${escapeHTML(url)}" controls preload="metadata" playsinline class="w-full max-h-64 bg-black"></video>`
    : `<img src="${escapeHTML(url)}" alt="Pré-visualização" referrerpolicy="no-referrer" onerror="this.style.display='none'" class="w-full max-h-64 object-contain">`;

  const removeBtn = removable
    ? `<button type="button" onclick="clearComposerFile()" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black text-white text-xs" title="Remover" aria-label="Remover mídia"><i class="fa-solid fa-xmark"></i></button>`
    : '';

  container.innerHTML = `<div class="relative rounded-xl overflow-hidden border border-token bg-zinc-100 dark:bg-zinc-800">${media}${removeBtn}</div>`;
  container.classList.remove('hidden');
}

// ---------- Localização ----------
async function requestComposerLocation() {
  composerLocationState = 'loading';
  composerLocation = null;
  renderComposerLocation();
  updateComposerState();

  try {
    composerLocation = await getUserLocation();
    composerLocationState = 'ready';
    renderComposerLocation();
  } catch (err) {
    composerLocationState = 'error';
    renderComposerLocation(err.message);
  }
  updateComposerState();
}

function renderComposerLocation(errorMessage) {
  const status = document.getElementById('composerLocationStatus');
  const retry = document.getElementById('composerLocationRetry');
  if (!status) return;

  const states = {
    loading: ['fa-solid fa-circle-notch fa-spin', 'Obtendo sua localização... (autorize no navegador, se solicitado)', ''],
    ready: ['fa-solid fa-location-dot text-emerald-600', 'Sua localização será registrada junto com a publicação.', ''],
    error: ['fa-solid fa-location-crosshairs text-red-500', errorMessage || 'Não foi possível obter sua localização.', 'text-red-500']
  };
  const [icon, message, tone] = states[composerLocationState] || states.loading;

  status.className = `font-caption flex items-start gap-2 ${tone || 'text-secondary-token'}`;
  status.innerHTML = `<i class="${icon} mt-0.5"></i><span>${escapeHTML(message)}</span>`;
  retry.classList.toggle('hidden', composerLocationState !== 'error');
}

// ---------- Estado do formulário ----------
function updateComposerTextCounter() {
  const text = document.getElementById('composerText');
  const counter = document.getElementById('composerTextCounter');
  if (text && counter) counter.textContent = `${text.value.length}/2000`;
}

// Libera "Publicar" somente quando tudo o que é exigido está pronto
function updateComposerState() {
  const btn = document.getElementById('composerSubmitBtn');
  if (!btn) return;

  const hasTitle = document.getElementById('composerTitle').value.trim().length > 0;
  const linkOk = composerMode !== 'link' || composerLinkState === 'ready';
  const locationOk = composerLocationState === 'ready';
  const idle = !composerUpload;

  btn.disabled = !(hasTitle && linkOk && idle);

  let hint = '';
  if (composerUpload) hint = '';
  else if (composerMode === 'link' && composerLinkState === 'loading') hint = 'Carregando o link...';
  else if (!linkOk) hint = 'Cole um link válido para continuar.';
  else if (!hasTitle) hint = 'Informe um título.';
  else if (composerLocationState === 'loading') hint = 'Aguardando localização...';
  else if (!locationOk) hint = 'Localização necessária para publicar.';
  document.getElementById('composerSubmitHint').textContent = hint;
}

function setComposerError(message) {
  const el = document.getElementById('composerError');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

function setComposerProgress(percent, label) {
  const box = document.getElementById('composerProgress');
  if (!box) return;
  box.classList.toggle('hidden', percent === null);
  if (percent === null) return;
  document.getElementById('composerProgressBar').style.width = `${percent}%`;
  document.getElementById('composerProgressLabel').textContent = label || `Enviando... ${percent}%`;
}

// ---------- Envio ----------
async function handlePublishPost(event) {
  event.preventDefault();
  if (document.getElementById('composerSubmitBtn').disabled) return;

  const formData = new FormData();
  formData.append('userId', currentUser.id);
  formData.append('title', document.getElementById('composerTitle').value.trim());
  formData.append('text', document.getElementById('composerText').value.trim());
  formData.append('category', document.getElementById('composerCategory').value);
  if (composerLocation)
  {
    formData.append('latitude', composerLocation.latitude);
    formData.append('longitude', composerLocation.longitude);
    formData.append('locationAccuracy', composerLocation.accuracy);
  }

  if (composerMode === 'link') {
    // O servidor refaz a leitura do link e decide: mídia <= 50 MB vai para o S3; maior, só o link da mídia é salvo
    formData.append('sourceUrl', composerLinkPreview?.sourceUrl || document.getElementById('composerLinkInput').value.trim());
  } else if (composerFile) {
    formData.append('media', composerFile);
  }

  setComposerError('');
  setComposerProgress(0);

  try {
    const request = sendPost(formData);
    updateComposerState(); // trava o botão enquanto envia
    const data = await request;

    closePostComposer();
    showToast(data.message || 'Publicação criada com sucesso!');
    fetchPosts();
  } catch (err) {
    if (err.message !== 'aborted') {
      console.error('Erro ao publicar:', err);
      setComposerError(err.message || 'Erro ao publicar.');
    }
  } finally {
    composerUpload = null;
    setComposerProgress(null);
    updateComposerState();
  }
}

// XMLHttpRequest (e não fetch) para acompanhar o progresso do envio de arquivos grandes
function sendPost(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    composerUpload = xhr;

    xhr.open('POST', `${API_BASE_URL}/posts`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.round((e.loaded / e.total) * 100);
      setComposerProgress(percent, percent >= 100 ? 'Processando publicação...' : undefined);
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new Error(data.error || `Erro ${xhr.status} ao publicar.`));
    };
    xhr.onerror = () => reject(new Error('Falha de conexão ao publicar. Tente novamente.'));
    xhr.onabort = () => reject(new Error('aborted'));

    xhr.send(formData);
  });
}
