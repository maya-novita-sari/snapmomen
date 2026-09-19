const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { validators } = require('../_lib/validator');
const { sendSuccess, badRequest, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { FRAME_TYPES, FRAME_SIZES } = require('../_lib/constants');

module.exports = withAllMethods(requireAdmin(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'DELETE') {
    await query('DELETE FROM frames WHERE id = $1', [id]);
    return sendSuccess(res, { ok: true });
  }

  if (req.method === 'PUT') {
    const { name, size, type } = req.body;

    if (!name || !name.trim()) return badRequest(res, 'Nama bingkai wajib diisi');

    const sizeError = validators.oneOf(size, Object.values(FRAME_SIZES), 'Size');
    if (sizeError) return badRequest(res, sizeError);

    const typeError = validators.oneOf(type, Object.values(FRAME_TYPES), 'Type');
    if (typeError) return badRequest(res, typeError);

    const result = await query(
      'UPDATE frames SET name = $1, size = $2, type = $3 WHERE id = $4 RETURNING *',
      [name.trim(), size, type, id]
    );

    return sendSuccess(res, result.rows[0]);
  }

  return methodNotAllowed(res);
}));