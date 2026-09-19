const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { sendSuccess } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAdmin(async (req, res) => {
  const [total, premium, newToday, newWeek, newMonth] = await Promise.all([
    query('SELECT COUNT(*) FROM users WHERE role = $1', [ROLES.CUSTOMER]),
    query('SELECT COUNT(*) FROM users WHERE role = $1 AND premium_until > NOW()', [ROLES.CUSTOMER]),
    query("SELECT COUNT(*) FROM users WHERE role = $1 AND created_at::date = NOW()::date", [ROLES.CUSTOMER]),
    query("SELECT COUNT(*) FROM users WHERE role = $1 AND created_at > NOW() - INTERVAL '7 days'", [ROLES.CUSTOMER]),
    query("SELECT COUNT(*) FROM users WHERE role = $1 AND created_at > NOW() - INTERVAL '30 days'", [ROLES.CUSTOMER])
  ]);

  const totalN   = parseInt(total.rows[0].count);
  const premiumN = parseInt(premium.rows[0].count);

  return sendSuccess(res, {
    total            : totalN,
    premium          : premiumN,
    free             : totalN - premiumN,
    premiumPercentage: totalN > 0 ? ((premiumN / totalN) * 100).toFixed(1) : 0,
    newUsersToday    : parseInt(newToday.rows[0].count),
    newUsersThisWeek : parseInt(newWeek.rows[0].count),
    newUsersThisMonth: parseInt(newMonth.rows[0].count)
  });
}));