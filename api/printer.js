const { query } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const { handlePreflight, sendSuccess, badRequest, methodNotAllowed } = require('./_lib/response');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    return requireAdmin(async (req, res) => {
      const result = await query('SELECT * FROM printer_settings WHERE id = 1');
      return sendSuccess(res, result.rows[0] || { printer_name: null, connected: false });
    })(req, res);
  }

  if (req.method === 'POST') {
    return requireAdmin(async (req, res) => {
      const { printer_name, connected } = req.body;

      await query(
        `UPDATE printer_settings
         SET printer_name = $1, connected = $2, updated_at = NOW()
         WHERE id = 1`,
        [printer_name || null, connected ? true : false]
      );

      const result = await query('SELECT * FROM printer_settings WHERE id = 1');
      return sendSuccess(res, result.rows[0]);
    })(req, res);
  }

  return methodNotAllowed(res);
};