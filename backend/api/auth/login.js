const bcrypt = require('bcryptjs');
const { query } = require('../_lib/db');
const { generateToken } = require('../_lib/auth');
const { sendSuccess, unauthorized, badRequest } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withMethods(['POST'], async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return badRequest(res, 'Username dan password wajib diisi');

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = generateToken({ id: 0, username, role: ROLES.ADMIN });
    return sendSuccess(res, {
      token,
      user: { id: 0, username, role: ROLES.ADMIN }
    });
  }

  const result = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  if (result.rows.length === 0) return unauthorized(res, 'Username atau password salah');

  const user = result.rows[0];
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) return unauthorized(res, 'Username atau password salah');

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
});