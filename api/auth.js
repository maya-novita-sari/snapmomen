import bcrypt from 'bcryptjs';
import { sql } from './_lib/db.js';
import { signToken, getAuthUser } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

const USERNAME_MIN_LENGTH = 3;
const PASSWORD_MIN_LENGTH = 4;
const BCRYPT_ROUNDS = 10;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const action = req.query.action;

  if (action === 'register' && req.method === 'POST') return handleRegister(req, res);
  if (action === 'login' && req.method === 'POST') return handleLogin(req, res);
  if (action === 'me' && req.method === 'GET') return handleMe(req, res);

  return sendError(res, 404, 'Endpoint tidak ditemukan.');
}

async function handleRegister(req, res) {
  const { username, email, password } = req.body || {};

  if (!username || username.length < USERNAME_MIN_LENGTH) {
    return sendError(res, 400, `Username minimal ${USERNAME_MIN_LENGTH} karakter.`);
  }
  if (!email || !email.includes('@')) {
    return sendError(res, 400, 'Email tidak valid.');
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return sendError(res, 400, `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }

  try {
    const existing = await sql`
      SELECT id FROM users WHERE username = ${username} OR email = ${email}
    `;
    if (existing.length > 0) {
      return sendError(res, 409, 'Username atau email sudah terdaftar.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [user] = await sql`
      INSERT INTO users (username, email, password, role)
      VALUES (${username}, ${email}, ${passwordHash}, 'customer')
      RETURNING id, username, email, role, premium_until
    `;

    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return sendOk(res, { token, user });
  } catch (err) {
    console.error('register error:', err);
    return sendError(res, 500, 'Gagal mendaftarkan akun.');
  }
}

async function handleLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return sendError(res, 400, 'Username dan password wajib diisi.');
  }

  try {
    if (isAdminCredential(username, password)) {
      const token = signToken({ id: 0, username, role: 'admin' });
      return sendOk(res, {
        token,
        user: { id: 0, username, email: null, role: 'admin', premium_until: null },
      });
    }

    const [user] = await sql`SELECT * FROM users WHERE username = ${username}`;
    if (!user) return sendError(res, 401, 'Username atau password salah.');

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) return sendError(res, 401, 'Username atau password salah.');

    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return sendOk(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        premium_until: user.premium_until,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    return sendError(res, 500, 'Gagal login.');
  }
}

async function handleMe(req, res) {
  const payload = getAuthUser(req);
  if (!payload) return sendError(res, 401, 'Belum login.');

  if (payload.role === 'admin' && payload.id === 0) {
    return sendOk(res, {
      user: { id: 0, username: payload.username, email: null, role: 'admin', premium_until: null },
    });
  }

  try {
    const [user] = await sql`
      SELECT id, username, email, role, premium_until FROM users WHERE id = ${payload.id}
    `;
    if (!user) return sendError(res, 404, 'User tidak ditemukan.');
    return sendOk(res, { user });
  } catch (err) {
    console.error('me error:', err);
    return sendError(res, 500, 'Gagal mengambil data user.');
  }
}

function isAdminCredential(username, password) {
  return username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD;
}
