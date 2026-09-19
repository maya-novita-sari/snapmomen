const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { sendSuccess, notFound } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAuth(async (req, res) => {
  if (req.user.role === ROLES.ADMIN) {
    return sendSuccess(res, { id: 0, username: req.user.username, role: ROLES.ADMIN });
  }

  const result = await query(
    'SELECT id, username, email, role, premium_until FROM users WHERE id = $1',
    [req.user.id]
  );

  if (result.rows.length === 0) return notFound(res, 'User tidak ditemukan');

  return sendSuccess(res, result.rows[0]);
}));