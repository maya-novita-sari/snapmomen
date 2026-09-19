const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { sendSuccess } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { MAX_QUERY_LIMIT, ROLES } = require('../_lib/constants');

module.exports = withMethods(['GET'], requireAdmin(async (req, res) => {
  const { role, premium, search } = req.query;

  const conditions = ['role != $1'];
  const params = [ROLES.ADMIN];

  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }

  if (premium === 'true') {
    conditions.push('premium_until > NOW()');
  } else if (premium === 'false') {
    conditions.push('(premium_until IS NULL OR premium_until <= NOW())');
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const sql = `
    SELECT id, username, email, role, premium_until, created_at,
           CASE WHEN premium_until > NOW() THEN TRUE ELSE FALSE END AS is_premium
    FROM users
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ${MAX_QUERY_LIMIT}
  `;

  const result = await query(sql, params);

  const users = result.rows.map(u => ({
    id           : u.id,
    username     : u.username,
    email        : u.email,
    role         : u.role,
    isPremium    : u.is_premium,
    premium_until: u.premium_until,
    daysLeft     : u.premium_until
      ? Math.max(0, Math.ceil((new Date(u.premium_until) - new Date()) / (1000 * 60 * 60 * 24)))
      : 0,
    created_at: u.created_at
  }));

  const premiumCount = users.filter(u => u.isPremium).length;

  return sendSuccess(res, {
    total  : users.length,
    premium: premiumCount,
    free   : users.length - premiumCount,
    users
  });
}));