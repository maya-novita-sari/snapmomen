function goToScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'screen-result') processResult();
  if (screenId === 'screen-theme') FrameManager.refreshThemeVisibility();
}

function startApp() {
  goToScreen('screen-frame');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;
  await FrameManager.loadAllFrames();
  startWelcomeCamera();
});