const AUTH_TOKEN_KEY = 'snapmomen_token';
const AUTH_USER_KEY = 'snapmomen_user';
const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

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

function buildRequestHeaders(auth) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth ? getStoredToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    console.error('Request gagal:', url, err);
    if (err.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
  } finally {
    clearTimeout(timerId);
  }
}

function describeFailedResponse(response, data) {
  if (data.message) return data.message;
  if (response.status === 401) return 'Sesi kamu habis. Silakan login ulang.';
  if (response.status === 413) return 'Ukuran data terlalu besar untuk dikirim ke server.';
  return `Terjadi kesalahan pada server (kode ${response.status}).`;
}

// Central fetch helper: attaches the JWT, applies a timeout, parses JSON and normalizes errors.
async function apiRequest(path, { method = 'GET', body, auth = true, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method,
    headers: buildRequestHeaders(auth),
    body: body ? JSON.stringify(body) : undefined,
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    console.error('API error:', method, path, response.status, data);
    throw new Error(describeFailedResponse(response, data));
  }
  return data;
}

// ---------- Small localStorage cache with expiry (for public, rarely changing data) ----------

function readCache(key) {
  try {
    const entry = JSON.parse(localStorage.getItem(key));
    return entry && entry.expiresAt > Date.now() ? entry.data : null;
  } catch {
    return null;
  }
}

function writeCache(key, data, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt: Date.now() + ttlMs }));
  } catch {
    // storage full or blocked: caching is optional
  }
}

function clearCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function cachedApiRequest(path, { cacheKey, ttlMs, ...requestOptions }) {
  const cached = readCache(cacheKey);
  if (cached) return cached;
  const data = await apiRequest(path, requestOptions);
  writeCache(cacheKey, data, ttlMs);
  return data;
}