const { query } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const { handlePreflight, sendSuccess, badRequest, methodNotAllowed } = require('./_lib/response');
const { ROLES, CODE_STATUS, MAX_QUERY_LIMIT } = require('./_lib/constants');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed(res);

  const { action } = req.query;

  if (action === 'stats') {
    return requireAdmin(async (req, res) => {
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

      const totalUsers = parseInt(users.rows[0].count);
      const premiumCount = parseInt(premiumUsers.rows[0].count);

      return sendSuccess(res, {
        totalPhotos : parseInt(photos.rows[0].count),
        totalUsers,
        premiumUsers: premiumCount,
        freeUsers   : totalUsers - premiumCount,
        totalFrames : parseInt(frames.rows[0].count),
        photosToday : parseInt(photosToday.rows[0].count),
        codesActive : parseInt(codes.rows[0].active),
        codesUsed   : parseInt(codes.rows[0].used),
        codesExpired: parseInt(codes.rows[0].expired)
      });
    })(req, res);
  }

  if (action === 'users') {
    return requireAdmin(async (req, res) => {
      const { role, premium, search } = req.query;
      const cond = ['role != $1'];
      const params = [ROLES.ADMIN];

      if (role) { params.push(role); cond.push(`role = $${params.length}`); }
      if (premium === 'true') cond.push('premium_until > NOW()');
      else if (premium === 'false') cond.push('(premium_until IS NULL OR premium_until <= NOW())');
      if (search) {
        params.push(`%${search}%`);
        cond.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
      }

      const result = await query(`
        SELECT id, username, email, role, premium_until, created_at,
               CASE WHEN premium_until > NOW() THEN TRUE ELSE FALSE END AS is_premium
        FROM users
        WHERE ${cond.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${MAX_QUERY_LIMIT}
      `, params);

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
    })(req, res);
  }

  if (action === 'user-delete' && req.method === 'DELETE') {
    return requireAdmin(async (req, res) => {
      const { id } = req.query;
      if (!id) return badRequest(res, 'ID wajib diisi');
      await query('DELETE FROM users WHERE id = $1 AND role != $2', [id, ROLES.ADMIN]);
      return sendSuccess(res, { ok: true });
    })(req, res);
  }

  return methodNotAllowed(res);
};