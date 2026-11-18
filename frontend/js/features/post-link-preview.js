/* Publicação a partir de link de outra rede social: carregamento assíncrono do conteúdo.
 * Tela: partials/post-composer-modal.html
 *
 * Fluxo: o usuário cola o link -> (debounce) -> GET /posts/link-preview?url=...
 * -> título, descrição e mídia preenchem o formulário -> só então "Publicar" é liberado.
 * Se o link estiver indisponível/inacessível, mostra a mensagem e a publicação não pode ser salva.
 */

let composerLinkState = 'idle'; // idle | loading | ready | error
let composerLinkPreview = null;
let linkPreviewTimer = null;
let linkPreviewController = null;
let linkPreviewSeq = 0;

function setComposerLinkStatus(message, tone = 'neutral') {
  const el = document.getElementById('composerLinkStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'font-caption min-h-[1rem] ' + (tone === 'error' ? 'text-red-500' : tone === 'success' ? 'text-emerald-600' : 'text-secondary-token');
}

// Chamado a cada digitação/colagem no campo de link
function handleComposerLinkInput() {
  const url = document.getElementById('composerLinkInput').value.trim();

  resetLinkPreview({ keepInput: true });

  if (!url) return updateComposerState();

  if (!safeHttpUrl(url)) {
    setComposerLinkStatus('Cole um link completo, começando com http:// ou https://', 'error');
    return updateComposerState();
  }

  // Espera o usuário terminar de colar/digitar antes de consultar o servidor
  linkPreviewTimer = setTimeout(() => fetchLinkPreview(safeHttpUrl(url)), 500);
  updateComposerState();
}

async function fetchLinkPreview(url) {
  if (linkPreviewController) linkPreviewController.abort();
  linkPreviewController = new AbortController();
  const seq = ++linkPreviewSeq;

  composerLinkState = 'loading';
  document.getElementById('composerLinkSpinner')?.classList.remove('hidden');
  setComposerLinkStatus('Carregando o conteúdo do link...');
  updateComposerState();

  try {
    const response = await fetch(`${API_BASE_URL}/posts/link-preview?url=${encodeURIComponent(url)}`, {
      signal: linkPreviewController.signal
    });
    const data = await response.json().catch(() => ({}));

    if (seq !== linkPreviewSeq) return; // resposta de um link antigo: ignora
    if (!response.ok) throw new Error(data.error || 'link inacessível');

    composerLinkPreview = data;
    composerLinkState = 'ready';

    document.getElementById('composerTitle').value = (data.title || '').slice(0, 150);
    document.getElementById('composerText').value = (data.description || '').slice(0, 2000);
    updateComposerTextCounter();

    const mediaUrl = safeHttpUrl(data.mediaUrl);
    if (mediaUrl) {
      showMediaPreview('composerLinkMediaPreview', mediaUrl, data.mediaType === 'video' ? 'video' : 'image', false);
    }

    setComposerLinkStatus(data.siteName ? `Conteúdo carregado de ${data.siteName}.` : 'Conteúdo carregado.', 'success');
  } catch (err) {
    if (err.name === 'AbortError' || seq !== linkPreviewSeq) return;

    console.error('Erro ao carregar o link:', err);
    composerLinkPreview = null;
    composerLinkState = 'error';
    setComposerLinkStatus('Não foi possível acessar este link. Verifique se ele está público e disponível; esta publicação não pode ser salva.', 'error');
  } finally {
    if (seq === linkPreviewSeq) {
      document.getElementById('composerLinkSpinner')?.classList.add('hidden');
      updateComposerState();
    }
  }
}

// Cancela consultas em andamento e limpa o conteúdo carregado do link
function resetLinkPreview({ keepInput = false } = {}) {
  clearTimeout(linkPreviewTimer);
  if (linkPreviewController) linkPreviewController.abort();
  linkPreviewController = null;
  linkPreviewSeq++;

  composerLinkState = 'idle';
  composerLinkPreview = null;

  const input = document.getElementById('composerLinkInput');
  if (input && !keepInput) input.value = '';

  const title = document.getElementById('composerTitle');
  const text = document.getElementById('composerText');
  if (keepInput && title && text) { // novo link: descarta o conteúdo do anterior
    title.value = '';
    text.value = '';
    updateComposerTextCounter();
  }

  const media = document.getElementById('composerLinkMediaPreview');
  if (media) {
    media.innerHTML = '';
    media.classList.add('hidden');
  }
  document.getElementById('composerLinkSpinner')?.classList.add('hidden');
  setComposerLinkStatus('');
}
