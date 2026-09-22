async function registerUser(username, email, password) {
  const data = await apiRequest('/auth?action=register', {
    method: 'POST',
    auth: false,
    body: { username, email, password },
  });
  storeSession(data.token, data.user);
  return data.user;
}

async function loginUser(username, password) {
  const data = await apiRequest('/auth?action=login', {
    method: 'POST',
    auth: false,
    body: { username, password },
  });
  storeSession(data.token, data.user);
  return data.user;
}

function logoutUser() {
  clearSession();
}
