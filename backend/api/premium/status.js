const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { sendSuccess, notFound } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAuth(async (req, res) => {
  if (req.user.role === ROLES.ADMIN) {
    return sendSuccess(res, { isPremium: true, role: ROLES.ADMIN, daysLeft: 9999 });
  }

  const result = await query('SELECT premium_until FROM users WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return notFound(res, 'User tidak ditemukan');

  const premiumUntil = result.rows[0].premium_until;
  const now          = new Date();
  const isPremium    = premiumUntil && new Date(premiumUntil) > now;

  let daysLeft  = 0;
  let hoursLeft = 0;

  if (isPremium) {
    const diff = new Date(premiumUntil) - now;
    daysLeft   = Math.floor(diff / (1000 * 60 * 60 * 24));
    hoursLeft  = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  }

  return sendSuccess(res, {
    isPremium,
    premium_until: premiumUntil,
    daysLeft,
    hoursLeft
  });
}));