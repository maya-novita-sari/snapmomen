const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { sendSuccess, badRequest, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withAllMethods(requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    if (req.user.role === ROLES.ADMIN) {
      const result = await query(`
        SELECT p.id, p.user_id, p.frame_id, p.printed, p.expires_at, p.created_at,
               u.username
        FROM photos p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
      `);
      return sendSuccess(res, result.rows);
    }

    const result = await query(
      `SELECT id, frame_id, printed, expires_at, created_at
       FROM photos WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  }

  if (req.method === 'POST') {
    const { frame_id, image_data } = req.body;

    if (!image_data) return badRequest(res, 'Data foto kosong');

    const result = await query(
      `INSERT INTO photos (user_id, frame_id, image_data)
       VALUES ($1, $2, $3) RETURNING id, expires_at`,
      [req.user.id, frame_id || null, image_data]
    );

    return sendSuccess(res, result.rows[0], 201);
  }

  return methodNotAllowed(res);
}));