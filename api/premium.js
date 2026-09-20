const { query } = require('./_lib/db');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { generateUniqueCode } = require('./_lib/code-generator');
const { handlePreflight, sendSuccess, badRequest, notFound, methodNotAllowed } = require('./_lib/response');
const {
  ROLES, CODE_STATUS, MAX_CODES_PER_REQUEST, MIN_CODES_PER_REQUEST,
  MAX_DURATION_DAYS, MAX_QUERY_LIMIT
} = require('./_lib/constants');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  const { action } = req.query;

  if (action === 'status' && req.method === 'GET') {
    return requireAuth(async (req, res) => {
      if (req.user.role === ROLES.ADMIN) {
        return sendSuccess(res, { isPremium: true, role: ROLES.ADMIN, daysLeft: 9999 });
      }
      const result = await query('SELECT premium_until FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0) return notFound(res, 'User tidak ditemukan');

      const premiumUntil = result.rows[0].premium_until;
      const now = new Date();
      const isPremium = premiumUntil && new Date(premiumUntil) > now;

      let daysLeft = 0, hoursLeft = 0;
      if (isPremium) {
        const diff = new Date(premiumUntil) - now;
        daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24));
        hoursLeft = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      }

      return sendSuccess(res, { isPremium, premium_until: premiumUntil, daysLeft, hoursLeft });
    })(req, res);
  }

  if (action === 'codes' && req.method === 'GET') {
    return requireAdmin(async (req, res) => {
      const { status, search } = req.query;
      const cond = ['1=1'];
      const params = [];
      if (status) { params.push(status); cond.push(`c.status = $${params.length}`); }
      if (search) { params.push(`%${search}%`); cond.push(`c.code ILIKE $${params.length}`); }

      const codes = await query(`
        SELECT c.*, u.username AS used_by_username
        FROM premium_codes c
        LEFT JOIN users u ON c.used_by = u.id
        WHERE ${cond.join(' AND ')}
        ORDER BY c.created_at DESC
        LIMIT ${MAX_QUERY_LIMIT}
      `, params);

      const stats = await query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'used') AS used,
          COUNT(*) FILTER (WHERE status = 'expired') AS expired
        FROM premium_codes
      `);
      const s = stats.rows[0];

      return sendSuccess(res, {
        total: codes.rows.length,
        active: parseInt(s.active),
        used: parseInt(s.used),
        expired: parseInt(s.expired),
        codes: codes.rows
      });
    })(req, res);
  }

  if (action === 'codes' && req.method === 'POST') {
    return requireAdmin(async (req, res) => {
      const { count = 1, duration_days } = req.body;
      if (!duration_days || duration_days < 1) return badRequest(res, 'Durasi wajib diisi minimal 1 hari');
      if (duration_days > MAX_DURATION_DAYS) return badRequest(res, `Durasi maksimal ${MAX_DURATION_DAYS} hari`);
      if (count < MIN_CODES_PER_REQUEST || count > MAX_CODES_PER_REQUEST) {
        return badRequest(res, `Jumlah kode ${MIN_CODES_PER_REQUEST}-${MAX_CODES_PER_REQUEST}`);
      }

      const codes = [];
      for (let i = 0; i < count; i++) {
        const code = await generateUniqueCode();
        await query('INSERT INTO premium_codes (code, duration_days) VALUES ($1, $2)', [code, duration_days]);
        codes.push(code);
      }

      return sendSuccess(res, { count: codes.length, duration_days, codes }, 201);
    })(req, res);
  }

  if (action === 'codes-delete' && req.method === 'DELETE') {
    return requireAdmin(async (req, res) => {
      const { id } = req.query;
      if (!id) return badRequest(res, 'ID wajib diisi');
      await query('DELETE FROM premium_codes WHERE id = $1', [id]);
      return sendSuccess(res, { ok: true });
    })(req, res);
  }

  if (action === 'history' && req.method === 'GET') {
    return requireAdmin(async (req, res) => {
      const result = await query(`
        SELECT c.id, c.code, c.duration_days, c.used_at, c.expires_at, c.status,
               u.username AS used_by_username, u.email AS used_by_email
        FROM premium_codes c
        LEFT JOIN users u ON c.used_by = u.id
        WHERE c.status IN ('used', 'expired')
        ORDER BY c.used_at DESC
        LIMIT ${MAX_QUERY_LIMIT}
      `);
      return sendSuccess(res, { total: result.rows.length, history: result.rows });
    })(req, res);
  }

  if (action === 'redeem' && req.method === 'POST') {
    return requireAuth(async (req, res) => {
      if (req.user.role === ROLES.ADMIN) return badRequest(res, 'Admin tidak perlu redeem');

      const { code } = req.body;
      if (!code) return badRequest(res, 'Kode wajib diisi');

      const cek = await query('SELECT * FROM premium_codes WHERE code = $1', [code.toUpperCase().trim()]);
      if (cek.rows.length === 0) return badRequest(res, 'Kode tidak valid');

      const kode = cek.rows[0];
      if (kode.status !== CODE_STATUS.ACTIVE) return badRequest(res, 'Kode sudah dipakai atau expired');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + kode.duration_days);

      await query(
        `UPDATE premium_codes SET used_by = $1, used_at = NOW(), expires_at = $2, status = $3 WHERE id = $4`,
        [req.user.id, expiresAt, CODE_STATUS.USED, kode.id]
      );

      await query('UPDATE users SET premium_until = $1 WHERE id = $2', [expiresAt, req.user.id]);

      return sendSuccess(res, { ok: true, premium_until: expiresAt, daysLeft: kode.duration_days });
    })(req, res);
  }

  return methodNotAllowed(res);
};