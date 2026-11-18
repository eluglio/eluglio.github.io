/* Tema claro/escuro. */

// Gerenciamento de Tema
function initTheme() {
  const savedTheme = localStorage.getItem('agora-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const html = document.documentElement;
  const themeIcon = document.getElementById('themeIcon');

  const themeToApply = savedTheme ? savedTheme : (prefersDark ? 'dark' : 'light');

  if (themeToApply === 'dark') {
    html.classList.remove('light');
    html.classList.add('dark');
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun text-base';
  } else {
    html.classList.remove('dark');
    html.classList.add('light');
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon text-base';
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const themeIcon = document.getElementById('themeIcon');
  
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    html.classList.add('light');
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon text-base';
    localStorage.setItem('agora-theme', 'light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun text-base';
    localStorage.setItem('agora-theme', 'dark');
  }
}
