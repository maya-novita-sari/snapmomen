const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { sendSuccess } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { MAX_QUERY_LIMIT } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAdmin(async (req, res) => {
  const result = await query(`
    SELECT c.id, c.code, c.duration_days, c.used_at, c.expires_at, c.status,
           u.username AS used_by_username, u.email AS used_by_email
    FROM premium_codes c
    LEFT JOIN users u ON c.used_by = u.id
    WHERE c.status IN ('used', 'expired')
    ORDER BY c.used_at DESC
    LIMIT ${MAX_QUERY_LIMIT}
  `);

  return sendSuccess(res, {
    total: result.rows.length,
    history: result.rows
  });
}));