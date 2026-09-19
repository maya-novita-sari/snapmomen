const { query } = require('../_lib/db');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { sendSuccess, notFound, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withAllMethods(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await query('SELECT * FROM photos WHERE id = $1', [id]);
    if (result.rows.length === 0) return notFound(res, 'Foto tidak ditemukan');
    return sendSuccess(res, result.rows[0]);
  }

  if (req.method === 'DELETE') {
    return requireAdmin(async (req, res) => {
      await query('DELETE FROM photos WHERE id = $1', [id]);
      return sendSuccess(res, { ok: true });
    })(req, res);
  }

  return methodNotAllowed(res);
});