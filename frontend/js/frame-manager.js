let _framesCache = [];
let _isPremiumUser = false;

async function loadFrames() {
  const data = await apiRequest('/frames', { auth: false });
  _framesCache = data.frames;
  return _framesCache;
}

function getAllFrames() {
  return _framesCache;
}

function getFramesBySize(size) {
  return _framesCache.filter((frame) => frame.size === size);
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

// Returns { allowed, reason } where reason is 'need-login' | 'need-premium' | null.
function checkFrameAccess(frame) {
  if (frame.type === 'free') return { allowed: true, reason: null };

  const user = getStoredUser();
  if (!user) return { allowed: false, reason: 'need-login' };
  if (!_isPremiumUser) return { allowed: false, reason: 'need-premium' };
  return { allowed: true, reason: null };
}
