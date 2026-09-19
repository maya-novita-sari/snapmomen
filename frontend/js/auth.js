function getCurrentUser() {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } 
  
  catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = 'login.html';
}

function requireLogin() {
  const token = localStorage.getItem('token');
  if (!token) {
    location.href = 'login.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!requireLogin()) return false;
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    location.href = 'login.html';
    return false;
  }
  return true;
}

function isPremium() {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.premium_until && new Date(user.premium_until) > new Date();
}