/* Layout: menu lateral (mobile). */

function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  document.getElementById('openSidebarBtn').addEventListener('click', () => {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  });

  const closeSidebar = () => {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  };

  document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);
}
