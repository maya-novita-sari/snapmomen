// Timer sesi studio: 8 menit, peringatan di sisa 2 menit, dan layar sesi berakhir.

const SESSION_DURATION_SECONDS = 8 * 60;
const SESSION_WARNING_SECONDS = 2 * 60;
const SESSION_TICK_INTERVAL_MS = 250;

let sessionTimerIntervalId = null;
let sessionEndsAtMs = 0;
let hasShownSessionWarning = false;
let hasSessionEnded = false;

function getSessionSecondsLeft() {
  return Math.max(0, Math.ceil((sessionEndsAtMs - Date.now()) / 1000));
}

function formatSessionTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderSessionTimer(secondsLeft) {
  const text = formatSessionTime(secondsLeft);
  const textElement = document.getElementById('session-timer-text');
  if (textElement.textContent !== text) textElement.textContent = text;
}

function showSessionBadge() {
  const badge = document.getElementById('session-timer');
  badge.style.display = 'block';
  badge.classList.remove('warning');
}

function hideSessionBadge() {
  const badge = document.getElementById('session-timer');
  badge.style.display = 'none';
  badge.classList.remove('warning');
}

function showWarningModal() {
  document.getElementById('modal-warning-time').classList.add('open');
}

function closeWarningModal() {
  document.getElementById('modal-warning-time').classList.remove('open');
}

function showSessionEndModal() {
  document.getElementById('modal-session-end').classList.add('open');
}

function closeSessionEndModal() {
  document.getElementById('modal-session-end').classList.remove('open');
}

function triggerSessionWarning() {
  hasShownSessionWarning = true;
  document.getElementById('session-timer').classList.add('warning');
  showWarningModal();
}

function endSession() {
  hasSessionEnded = true;
  stopSessionInterval();
  closeWarningModal();
  showSessionEndModal();
}

function stopSessionInterval() {
  clearInterval(sessionTimerIntervalId);
  sessionTimerIntervalId = null;
}

function tickSessionTimer() {
  const secondsLeft = getSessionSecondsLeft();
  renderSessionTimer(secondsLeft);

  if (secondsLeft <= SESSION_WARNING_SECONDS && !hasShownSessionWarning && secondsLeft > 0) {
    triggerSessionWarning();
  }
  if (secondsLeft <= 0 && !hasSessionEnded) endSession();
}

function startSessionTimer() {
  stopSessionInterval();
  closeWarningModal();
  closeSessionEndModal();

  sessionEndsAtMs = Date.now() + SESSION_DURATION_SECONDS * 1000;
  hasShownSessionWarning = false;
  hasSessionEnded = false;

  showSessionBadge();
  renderSessionTimer(SESSION_DURATION_SECONDS);
  sessionTimerIntervalId = setInterval(tickSessionTimer, SESSION_TICK_INTERVAL_MS);
}

// Dipanggil saat customer keluar studio sebelum waktu habis.
function clearSessionTimer() {
  stopSessionInterval();
  closeWarningModal();
  closeSessionEndModal();
  hideSessionBadge();
}

function backToHome() {
  clearSessionTimer();
  resetStudioState();
  goToScreen('screen-welcome');
}