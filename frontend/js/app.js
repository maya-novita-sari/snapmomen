function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// Renders Login/Register or Dashboard/Logout links into the given container selector.
function renderNavActions(selector) {
  const container = document.querySelector(selector);
  if (!container) return;

  const user = getStoredUser();
  if (!user) {
    container.innerHTML = `
      <a href="login.html" class="btn btn-outline btn-sm">Masuk</a>
      <a href="register.html" class="btn btn-primary btn-sm">Daftar</a>
    `;
    return;
  }

  const dashboardHref = user.role === 'admin' ? 'dashboard-admin.html' : 'studio.html';
  container.innerHTML = `
    <span class="nav-username">👋 ${escapeHtml(user.username)}</span>
    <a href="${dashboardHref}" class="btn btn-outline btn-sm">Dashboard</a>
    <button class="btn btn-primary btn-sm" id="navLogoutBtn">Keluar</button>
  `;
  document.getElementById('navLogoutBtn').addEventListener('click', () => {
    clearSession();
    location.href = 'index.html';
  });
}

// Redirects to login.html if not authenticated. Returns the current user, or null.
function requireLoggedIn(redirectTarget) {
  const user = getStoredUser();
  if (!user) {
    location.href = `login.html?redirect=${encodeURIComponent(redirectTarget)}`;
    return null;
  }
  return user;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatIndonesianDate(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
