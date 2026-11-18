/* Carregador de telas (modais/painéis) sob demanda.
 *
 * Cada tela vive em frontend/partials/<nome>.html e só é buscada e inserida no DOM
 * na primeira vez que a funcionalidade correspondente é acionada.
 *
 * Uso: if (!(await ensureView('login-modal'))) return;
 */

const VIEWS_PATH = 'frontend/partials/';
const viewPromises = {};

function ensureView(name) {
  if (viewPromises[name]) return viewPromises[name];

  viewPromises[name] = (async () => {
    try {
      const response = await fetch(`${VIEWS_PATH}${name}.html`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      document.getElementById('modalRoot').insertAdjacentHTML('beforeend', html);
      return true;
    } catch (err) {
      console.error(`Erro ao carregar a tela "${name}":`, err);
      delete viewPromises[name]; // permite tentar novamente depois
      showToast('Não foi possível carregar esta tela. Abra o sistema por um servidor (http://), não direto pelo arquivo.');
      return false;
    }
  })();

  return viewPromises[name];
}
