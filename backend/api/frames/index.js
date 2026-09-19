const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { validators } = require('../_lib/validator');
const { sendSuccess, badRequest, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { FRAME_TYPES, FRAME_SIZES } = require('../_lib/constants');

module.exports = withAllMethods(async (req, res) => {
  if (req.method === 'GET') {
    const { size, type } = req.query;
    const conditions = ['is_active = TRUE'];
    const params = [];

    if (size) {
      params.push(size);
      conditions.push(`size = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const result = await query(
      `SELECT * FROM frames WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );

    return sendSuccess(res, result.rows);
  }

  if (req.method === 'POST') {
    return requireAdmin(async (req, res) => {
      const { name, size, type, image_url } = req.body;

      if (!name || !name.trim()) return badRequest(res, 'Nama bingkai wajib diisi');

      const sizeError = validators.oneOf(size, Object.values(FRAME_SIZES), 'Size');
      if (sizeError) return badRequest(res, sizeError);

      const typeError = validators.oneOf(type, Object.values(FRAME_TYPES), 'Type');
      if (typeError) return badRequest(res, typeError);

      if (!image_url) return badRequest(res, 'Gambar wajib diupload');

      const result = await query(
        'INSERT INTO frames (name, size, type, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [name.trim(), size, type, image_url]
      );

      return sendSuccess(res, result.rows[0], 201);
    })(req, res);
  }

  return methodNotAllowed(res);
});