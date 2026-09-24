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

// Renders Login/Register, or the logged-in nav (username + premium/dashboard + logout).
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

// Admin sees a Dashboard link. Customers see "Join Premium", or a countdown
// once they already have an active subscription.
async function buildNavMiddleButton(user) {
  if (user.role === 'admin') {
    return '<a href="dashboard-admin.html" class="btn btn-outline btn-sm">Dashboard</a>';
  }

  try {
    const data = await apiRequest('/premium?action=status');
    if (data.premium && data.premium_until) {
      const { days, hours } = getRemainingDaysHours(data.premium_until);
      return `<span class="nav-premium-badge">⏱️ ${days} hari ${hours} jam</span>`;
    }
  } catch {
    // ignore, fall back to the default Join Premium button below
  }
  return '<a href="premium.html" class="btn btn-primary btn-sm">Join Premium</a>';
}

function getRemainingDaysHours(untilIso) {
  const diffMs = new Date(untilIso).getTime() - Date.now();
  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
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