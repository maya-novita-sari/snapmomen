const bcrypt = require('bcryptjs');
const { query } = require('./_lib/db');
const { generateToken, requireAuth } = require('./_lib/auth');
const { validators, validate } = require('./_lib/validator');
const { handlePreflight, sendSuccess, badRequest, unauthorized, notFound, methodNotAllowed } = require('./_lib/response');
const { BCRYPT_ROUNDS, ROLES } = require('./_lib/constants');

const registerSchema = {
  username: [validators.username],
  email   : [validators.email],
  password: [validators.password]
};

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  const { action } = req.query;

  if (action === 'register' && req.method === 'POST') {
    const { username, email, password } = req.body;
    const err = validate({ username, email, password }, registerSchema);
    if (err) return badRequest(res, err.message);

    const existing = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.trim(), email.trim()]
    );
    if (existing.rows.length > 0) return badRequest(res, 'Username atau email sudah dipakai');

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, role',
      [username.trim(), email.trim(), hashed]
    );
    const user = result.rows[0];
    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    return sendSuccess(res, { token, user }, 201);
  }

  if (action === 'login' && req.method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return badRequest(res, 'Username dan password wajib diisi');

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const token = generateToken({ id: 0, username, role: ROLES.ADMIN });
      return sendSuccess(res, { token, user: { id: 0, username, role: ROLES.ADMIN } });
    }

    const result = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) return unauthorized(res, 'Username atau password salah');

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return unauthorized(res, 'Username atau password salah');

    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    return sendSuccess(res, {
      token,
      user: {
        id           : user.id,
        username     : user.username,
        email        : user.email,
        role         : user.role,
        premium_until: user.premium_until
      }
    });
  }

  if (action === 'me' && req.method === 'GET') {
    return requireAuth(async (req, res) => {
      if (req.user.role === ROLES.ADMIN) {
        return sendSuccess(res, { id: 0, username: req.user.username, role: ROLES.ADMIN });
      }
      const result = await query(
        'SELECT id, username, email, role, premium_until FROM users WHERE id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0) return notFound(res, 'User tidak ditemukan');
      return sendSuccess(res, result.rows[0]);
    })(req, res);
  }

  return methodNotAllowed(res);
};