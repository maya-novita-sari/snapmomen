const { query } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { generateUniqueCode } = require('../_lib/code-generator');
const { sendSuccess, badRequest, methodNotAllowed } = require('../_lib/response');
const { withAllMethods } = require('../_lib/handler');
const { MAX_CODES_PER_REQUEST, MIN_CODES_PER_REQUEST, MAX_DURATION_DAYS, MAX_QUERY_LIMIT } = require('../_lib/constants');

module.exports = withAllMethods(requireAdmin(async (req, res) => {
  if (req.method === 'GET') {
    const { status, search } = req.query;

    const conditions = ['1=1'];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c.code ILIKE $${params.length}`);
    }

    const codesResult = await query(`
      SELECT c.*, u.username AS used_by_username
      FROM premium_codes c
      LEFT JOIN users u ON c.used_by = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT ${MAX_QUERY_LIMIT}
    `, params);

    const statsResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'used') AS used,
        COUNT(*) FILTER (WHERE status = 'expired') AS expired
      FROM premium_codes
    `);

    const s = statsResult.rows[0];

    return sendSuccess(res, {
      total  : codesResult.rows.length,
      active : parseInt(s.active),
      used   : parseInt(s.used),
      expired: parseInt(s.expired),
      codes  : codesResult.rows
    });
  }

  if (req.method === 'POST') {
    const { count = 1, duration_days } = req.body;

    if (!duration_days || duration_days < 1) return badRequest(res, 'Durasi wajib diisi minimal 1 hari');
    if (duration_days > MAX_DURATION_DAYS) return badRequest(res, `Durasi maksimal ${MAX_DURATION_DAYS} hari`);
    if (count < MIN_CODES_PER_REQUEST || count > MAX_CODES_PER_REQUEST) {
      return badRequest(res, `Jumlah kode ${MIN_CODES_PER_REQUEST}-${MAX_CODES_PER_REQUEST}`);
    }

    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = await generateUniqueCode();
      await query(
        'INSERT INTO premium_codes (code, duration_days) VALUES ($1, $2)',
        [code, duration_days]
      );
      codes.push(code);
    }

    return sendSuccess(res, { count: codes.length, duration_days, codes }, 201);
  }

  return methodNotAllowed(res);
}));