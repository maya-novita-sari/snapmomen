const { query } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const { validators } = require('./_lib/validator');
const { handlePreflight, sendSuccess, badRequest, methodNotAllowed } = require('./_lib/response');
const { FRAME_TYPES, FRAME_SIZES } = require('./_lib/constants');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  const { id } = req.query;

  if (id) {
    return requireAdmin(async (req, res) => {
      if (req.method === 'DELETE') {
        await query('DELETE FROM frames WHERE id = $1', [id]);
        return sendSuccess(res, { ok: true });
      }
      if (req.method === 'PUT') {
        const { name, size, type } = req.body;
        if (!name || !name.trim()) return badRequest(res, 'Nama bingkai wajib diisi');
        const sizeErr = validators.oneOf(size, Object.values(FRAME_SIZES), 'Size');
        if (sizeErr) return badRequest(res, sizeErr);
        const typeErr = validators.oneOf(type, Object.values(FRAME_TYPES), 'Type');
        if (typeErr) return badRequest(res, typeErr);
        const result = await query(
          'UPDATE frames SET name = $1, size = $2, type = $3 WHERE id = $4 RETURNING *',
          [name.trim(), size, type, id]
        );
        return sendSuccess(res, result.rows[0]);
      }
      return methodNotAllowed(res);
    })(req, res);
  }

  if (req.method === 'GET') {
    const { size, type } = req.query;
    const cond = ['is_active = TRUE'];
    const params = [];
    if (size) { params.push(size); cond.push(`size = $${params.length}`); }
    if (type) { params.push(type); cond.push(`type = $${params.length}`); }
    const result = await query(
      `SELECT * FROM frames WHERE ${cond.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return sendSuccess(res, result.rows);
  }

  if (req.method === 'POST') {
    return requireAdmin(async (req, res) => {
      const { name, size, type, image_url } = req.body;
      if (!name || !name.trim()) return badRequest(res, 'Nama bingkai wajib diisi');
      const sizeErr = validators.oneOf(size, Object.values(FRAME_SIZES), 'Size');
      if (sizeErr) return badRequest(res, sizeErr);
      const typeErr = validators.oneOf(type, Object.values(FRAME_TYPES), 'Type');
      if (typeErr) return badRequest(res, typeErr);
      if (!image_url) return badRequest(res, 'Gambar wajib diupload');
      const result = await query(
        'INSERT INTO frames (name, size, type, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [name.trim(), size, type, image_url]
      );
      return sendSuccess(res, result.rows[0], 201);
    })(req, res);
  }

  return methodNotAllowed(res);
};