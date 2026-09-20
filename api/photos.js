const { query } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { handlePreflight, sendSuccess, badRequest, notFound, methodNotAllowed } = require('./_lib/response');
const { ROLES, MAX_QUERY_LIMIT } = require('./_lib/constants');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  const { id } = req.query;

  if (id && req.method === 'GET') {
    const result = await query('SELECT * FROM photos WHERE id = $1', [id]);
    if (result.rows.length === 0) return notFound(res, 'Foto tidak ditemukan');
    return sendSuccess(res, result.rows[0]);
  }

  if (req.method === 'GET') {
    return requireAuth(async (req, res) => {
      if (req.user.role === ROLES.ADMIN) {
        const result = await query(`
          SELECT p.id, p.user_id, p.frame_id, p.printed, p.expires_at, p.created_at,
                 p.image_data, u.username
          FROM photos p
          LEFT JOIN users u ON p.user_id = u.id
          ORDER BY p.created_at DESC
          LIMIT ${MAX_QUERY_LIMIT}
        `);
        return sendSuccess(res, result.rows);
      }
      const result = await query(
        `SELECT id, frame_id, printed, expires_at, created_at
         FROM photos WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${MAX_QUERY_LIMIT}`,
        [req.user.id]
      );
      return sendSuccess(res, result.rows);
    })(req, res);
  }

  if (req.method === 'POST') {
    return requireAuth(async (req, res) => {
      const { frame_id, image_data } = req.body;
      if (!image_data) return badRequest(res, 'Data foto kosong');
      const result = await query(
        `INSERT INTO photos (user_id, frame_id, image_data)
         VALUES ($1, $2, $3) RETURNING id, expires_at`,
        [req.user.id, frame_id || null, image_data]
      );
      return sendSuccess(res, result.rows[0], 201);
    })(req, res);
  }

  return methodNotAllowed(res);
};