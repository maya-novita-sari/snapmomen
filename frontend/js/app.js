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

async function renderNavActions(selector) {
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

  const middleButton = await buildNavMiddleButton(user);
  container.innerHTML = `
    <span class="nav-username">👋 ${escapeHtml(user.username)}</span>
    ${middleButton}
    <button class="btn btn-primary btn-sm" id="navLogoutBtn">Keluar</button>
  `;
  document.getElementById('navLogoutBtn').addEventListener('click', () => {
    clearSession();
    location.href = 'index.html';
  });
}

async function buildNavMiddleButton(user) {
  if (user.role === 'admin') {
    return '<a href="dashboard-admin.html" class="btn btn-outline btn-sm">Dashboard</a>';
  }

  try {
    const data = await apiRequest('/premium?action=status');
    if (data.premium && data.premium_until) {
      return `<span class="nav-premium-badge">👑 s.d. ${formatIndonesianDate(data.premium_until)}</span>`;
    }
  } catch {
  }

  return '<a href="premium.html" class="btn btn-primary btn-sm">Join Premium</a>';
}

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