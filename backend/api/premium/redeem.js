const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { sendSuccess, badRequest } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { ROLES, CODE_STATUS } = require('../_lib/constants');

module.exports = withMethods(['POST'], requireAuth(async (req, res) => {
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
    `UPDATE premium_codes
     SET used_by = $1, used_at = NOW(), expires_at = $2, status = $3
     WHERE id = $4`,
    [req.user.id, expiresAt, CODE_STATUS.USED, kode.id]
  );

  await query('UPDATE users SET premium_until = $1 WHERE id = $2', [expiresAt, req.user.id]);

  return sendSuccess(res, {
    ok: true,
    premium_until: expiresAt,
    daysLeft: kode.duration_days
  });
}));