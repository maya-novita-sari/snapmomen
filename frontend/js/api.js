const AUTH_TOKEN_KEY = 'snapmomen_token';
const AUTH_USER_KEY = 'snapmomen_user';

function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getStoredUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storeSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// Central fetch helper: attaches the JWT, parses JSON, and normalizes errors.
async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Terjadi kesalahan pada server.');
  }
  return data;
}
