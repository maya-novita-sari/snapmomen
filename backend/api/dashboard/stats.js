const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { sendSuccess } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES, CODE_STATUS } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAdmin(async (req, res) => {
  const [photos, users, premiumUsers, frames, photosToday, codes] = await Promise.all([
    query('SELECT COUNT(*) FROM photos'),
    query('SELECT COUNT(*) FROM users WHERE role = $1', [ROLES.CUSTOMER]),
    query('SELECT COUNT(*) FROM users WHERE role = $1 AND premium_until > NOW()', [ROLES.CUSTOMER]),
    query('SELECT COUNT(*) FROM frames WHERE is_active = TRUE'),
    query("SELECT COUNT(*) FROM photos WHERE created_at::date = NOW()::date"),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = $1) AS active,
        COUNT(*) FILTER (WHERE status = $2) AS used,
        COUNT(*) FILTER (WHERE status = $3) AS expired
      FROM premium_codes
    `, [CODE_STATUS.ACTIVE, CODE_STATUS.USED, CODE_STATUS.EXPIRED])
  ]);

  const totalUsers   = parseInt(users.rows[0].count);
  const premiumCount = parseInt(premiumUsers.rows[0].count);

  return sendSuccess(res, {
    totalPhotos : parseInt(photos.rows[0].count),totalUsers,
    premiumUsers: premiumCount,
    freeUsers   : totalUsers - premiumCount,
    totalFrames : parseInt(frames.rows[0].count),
    photosToday : parseInt(photosToday.rows[0].count),
    codesActive : parseInt(codes.rows[0].active),
    codesUsed   : parseInt(codes.rows[0].used),
    codesExpired: parseInt(codes.rows[0].expired)
  });
}));