const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { sendSuccess, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withAllMethods(requireAdmin(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'DELETE') {
    await query('DELETE FROM users WHERE id = $1 AND role != $2', [id, ROLES.ADMIN]);
    return sendSuccess(res, { ok: true });
  }

  return methodNotAllowed(res);
}));