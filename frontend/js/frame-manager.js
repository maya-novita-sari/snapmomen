const FRAMES_CACHE_KEY = 'snapmomen_frames_cache';
const FRAMES_CACHE_TTL_MS = 2 * 60 * 1000;
const CUSTOM_TOKENS_KEY_PREFIX = 'snapmomen_custom_tokens';

let _framesCache       = [];
let _customFramesCache = [];
let _isPremiumUser     = false;


function buildFrameImageUrl(frame) {
  const params = new URLSearchParams({ image: frame.id, v: frame.image_size || 0 });
  if (frame.category === 'custom' && frame.access_token) params.set('token', frame.access_token);
  return `${API_BASE_URL}/frames?${params}`;
}

function withImageUrl(frame) {
  return { ...frame, image_url: buildFrameImageUrl(frame) };
}


async function loadFrames() {
  const data = await cachedApiRequest('/frames', {
    cacheKey: FRAMES_CACHE_KEY,
    ttlMs   : FRAMES_CACHE_TTL_MS,
    auth    : false,
  });
  _framesCache = data.frames.map(withImageUrl);
  return _framesCache;
}

async function loadAdminFrames() {
  const data = await apiRequest('/frames?scope=admin');
  _framesCache = data.frames.map(withImageUrl);
  return _framesCache;
}

function invalidateFramesCache() {
  clearCache(FRAMES_CACHE_KEY);
}

function getAllFrames() {
  return _framesCache;
}

function findFrameById(frameId) {
  return _framesCache.find((frame) => frame.id === frameId)
    || _customFramesCache.find((frame) => frame.id === frameId);
}

function getFramesBySize(size) {
  return _framesCache.filter((frame) => frame.size === size);
}

function getCustomTokensStorageKey() {
  const user = getStoredUser();
  return `${CUSTOM_TOKENS_KEY_PREFIX}:${user ? user.id : 'guest'}`;
}

function getStoredCustomTokens() {
  try {
    const tokens = JSON.parse(localStorage.getItem(getCustomTokensStorageKey()));
    return Array.isArray(tokens) ? tokens : [];
  } catch {
    return [];
  }
}

function saveCustomTokens(tokens) {
  try {
    localStorage.setItem(getCustomTokensStorageKey(), JSON.stringify([...new Set(tokens)]));
  } catch {
  }
}

function hasCustomAccess() {
  return getStoredCustomTokens().length > 0;
}

function getCustomFramesBySize(size) {
  return _customFramesCache.filter((frame) => frame.size === size);
}

function mergeCustomFrames(newFrames) {
  const byId = new Map(_customFramesCache.map((frame) => [frame.id, frame]));
  newFrames.forEach((frame) => byId.set(frame.id, withImageUrl(frame)));
  _customFramesCache = [...byId.values()];
}

async function verifyCustomToken(token) {
  const data = await apiRequest('/frames?action=verify-token', { method: 'POST', body: { token } });
  mergeCustomFrames(data.frames);
  saveCustomTokens([...getStoredCustomTokens(), ...data.frames.map((frame) => frame.access_token)]);
  return data.frames;
}

async function restoreCustomFrames() {
  const tokens = getStoredCustomTokens();
  if (!tokens.length) return;
  try {
    const data = await apiRequest('/frames?action=verify-token', { method: 'POST', body: { tokens } });
    mergeCustomFrames(data.frames);
    saveCustomTokens(tokens.filter((token) => !data.invalid_tokens.includes(token)));
  } catch (err) {
    console.warn('Token custom belum bisa diperiksa ulang:', err);
  }
}


async function refreshPremiumStatus() {
  const user = getStoredUser();
  if (!user) {
    _isPremiumUser = false;
    return false;
  }
  try {
    const data = await apiRequest('/premium?action=status');
    _isPremiumUser = data.premium;
  } catch {
    _isPremiumUser = false;
  }
  return _isPremiumUser;
}

function checkFrameAccess(frame) {
  if (frame.category !== 'premium') return { allowed: true, reason: null };

  const user = getStoredUser();
  if (!user) return { allowed: false, reason: 'need-login' };
  if (!_isPremiumUser) return { allowed: false, reason: 'need-premium' };
  return { allowed: true, reason: null };
}