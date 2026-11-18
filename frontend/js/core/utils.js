/* Utilitários compartilhados por todas as funcionalidades. */

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  toast.classList.remove('translate-y-16', 'opacity-0', 'pointer-events-none');

  setTimeout(() => {
    toast.classList.add('translate-y-16', 'opacity-0', 'pointer-events-none');
  }, 3500);
}

function sanitizeGoogleAvatarUrl(url) {
  if (!url) return '';
  const equalIndex = url.indexOf('=');
  if (equalIndex !== -1 && url.includes('googleusercontent.com')) {
    return url.substring(0, equalIndex);
  }
  return url;
}

// Escapa texto antes de inseri-lo em HTML (conteúdo vindo de usuários ou de links externos)
function escapeHTML(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, c => map[c]);
}

// Retorna a URL normalizada se for http(s); caso contrário, string vazia
function safeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  } catch (e) {
    return '';
  }
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
