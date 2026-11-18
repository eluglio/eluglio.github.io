# Ágora Vermelha – Front end

Abra o sistema por um servidor HTTP (ex.: `python3 -m http.server 8080` nesta pasta,
ou a extensão Live Server do VS Code). Abrir o `index.html` direto pelo arquivo (file://)
impede o carregamento das telas em `frontend/partials/`.

## Estrutura

index.html                  Estrutura fixa (menu, cabeçalho, feed) + ordem dos scripts
frontend/css/                        theme (variáveis), base, tokens, typography, feed, toast
frontend/partials/                   Uma tela (modal/painel) por arquivo, inserida ao ser acionada
frontend/js/core/                    config, state, utils, view-loader (ensureView)
frontend/js/features/                Um arquivo por funcionalidade (auth, feed, profile, avatar,
                            share, invites, pending-invite, manage-invites,
                            notifications, admin-notifications, theme, layout)
frontend/js/main.js                  Inicialização

## Como uma tela é carregada

    if (!(await ensureView('login-modal'))) return;   // busca frontend/partials/login-modal.html (1x) e insere em #modalRoot

## Nova funcionalidade

1. Crie `frontend/partials/minha-tela.html` e `frontend/js/features/minha-funcao.js`.
2. No JS, chame `await ensureView('minha-tela')` antes de usar os elementos.
3. Inclua o script em `index.html`, antes de `frontend/js/main.js`.
