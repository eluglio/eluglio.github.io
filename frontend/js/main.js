/* Ponto de entrada: inicializa as funcionalidades na ordem original. */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebarToggle();
  checkSavedUser();
  checkUserNotifications();
  fetchPosts();
  initGoogleAuth();
  checkUrlForInvite();
  startNotificationPolling();
});
