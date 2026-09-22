import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleUpdate(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}

async function handleGet(req, res) {
  try {
    const [settings] = await sql`SELECT * FROM printer_settings WHERE id = 1`;
    return sendOk(res, { printer: settings || { connected: false, printer_name: null } });
  } catch (err) {
    console.error('printer get error:', err);
    return sendError(res, 500, 'Gagal mengambil status printer.');
  }
}

async function handleUpdate(req, res) {
  if (!requireAdmin(req, res)) return;

  const { printer_name, connected } = req.body || {};

  try {
    const [settings] = await sql`
      UPDATE printer_settings SET
        printer_name = ${printer_name ?? null},
        connected = ${Boolean(connected)},
        updated_at = NOW()
      WHERE id = 1
      RETURNING *
    `;
    return sendOk(res, { printer: settings });
  } catch (err) {
    console.error('printer update error:', err);
    return sendError(res, 500, 'Gagal memperbarui status printer.');
  }
}
