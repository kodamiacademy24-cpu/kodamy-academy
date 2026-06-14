// KODAMI AUTH — Login/logout docente
const AUTH_TOKEN_KEY = 'kodami_token';
const AUTH_USER_KEY = 'kodami_user';

async function login(email, password) {
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.data.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ nombre: data.data.nombre, email: data.data.email }));
      return { success: true };
    }
    return { success: false, error: data.error || 'Error de autenticación' };
  } catch {
    return { success: false, error: 'Error de conexión' };
  }
}

function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.location.href = '/admin/login.html';
}

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getUser() {
  try {
    const u = localStorage.getItem(AUTH_USER_KEY);
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

function isAuthenticated() {
  return !!getToken();
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

async function uploadResource(formData) {
  const token = getToken();
  if (!token) return { success: false, error: 'No autenticado' };
  try {
    const res = await fetch(`${API}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Error de conexión' };
  }
}
