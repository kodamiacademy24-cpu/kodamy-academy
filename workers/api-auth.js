// KODAMI API AUTH — JWT Login para docentes
// Usa jose para JWT ligero (sin dependencias externas, implementación manual)
const JWT_SECRET = 'kodami-secret-2026-change-in-production';

async function base64url(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createJWT(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 }));
  const signature = base64url(JSON.stringify([header, body, JWT_SECRET]));
  return `${header}.${body}.${signature}`;
}

async function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      // POST /api/auth/login
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Email y contraseña requeridos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        const docente = await env.DB.prepare('SELECT * FROM docentes WHERE email = ?').bind(email).first();
        if (!docente) {
          return new Response(JSON.stringify({ success: false, error: 'Credenciales inválidas' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        // Verificar contraseña (texto plano para simplicidad — reemplazar con bcrypt en producción)
        if (docente.password_hash !== password) {
          return new Response(JSON.stringify({ success: false, error: 'Credenciales inválidas' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        const token = await createJWT({ id: docente.id, nombre: docente.nombre, email: docente.email, role: 'docente' });
        return new Response(JSON.stringify({ success: true, data: { token, nombre: docente.nombre, email: docente.email } }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // POST /api/auth/verify — verifica token
      if (url.pathname === '/api/auth/verify' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.replace('Bearer ', '');
        if (!token) {
          return new Response(JSON.stringify({ success: false, error: 'Token requerido' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        const payload = await verifyJWT(token);
        if (!payload) {
          return new Response(JSON.stringify({ success: false, error: 'Token inválido o expirado' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, data: { id: payload.id, nombre: payload.nombre, email: payload.email, role: payload.role } }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
};
