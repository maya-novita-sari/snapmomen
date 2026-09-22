import { sql } from './_lib/db.js';
import { requireAuth, requireAdmin } from './_lib/auth-middleware.js';
import { generatePremiumCode } from './_lib/premium-code.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

const MAX_CODES_PER_BATCH = 500;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const action = req.query.action;

  if (action === 'status' && req.method === 'GET') return handleStatus(req, res);
  if (action === 'redeem' && req.method === 'POST') return handleRedeem(req, res);
  if (action === 'codes' && req.method === 'POST') return handleGenerateCodes(req, res);
  if (action === 'codes' && req.method === 'GET') return handleListCodes(req, res);
  if (action === 'history' && req.method === 'GET') return handleHistory(req, res);
  if (action === 'codes' && req.method === 'DELETE') return handleDeleteCode(req, res);

  return sendError(res, 404, 'Endpoint tidak ditemukan.');
}

async function handleStatus(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role === 'admin') {
    return sendOk(res, { premium: true, premium_until: null, is_admin: true });
  }

  try {
    const [row] = await sql`SELECT premium_until FROM users WHERE id = ${user.id}`;
    const premiumUntil = row?.premium_until || null;
    const isPremium = premiumUntil && new Date(premiumUntil) > new Date();
    return sendOk(res, { premium: Boolean(isPremium), premium_until: premiumUntil });
  } catch (err) {
    console.error('premium status error:', err);
    return sendError(res, 500, 'Gagal mengambil status premium.');
  }
}

async function handleRedeem(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (user.role === 'admin') return sendError(res, 400, 'Akun admin sudah punya akses penuh.');

  const { code } = req.body || {};
  if (!code) return sendError(res, 400, 'Kode premium wajib diisi.');

  try {
    const [premiumCode] = await sql`
      SELECT * FROM premium_codes WHERE code = ${code.trim().toUpperCase()}
    `;
    if (!premiumCode) return sendError(res, 404, 'Kode premium tidak ditemukan.');
    if (premiumCode.status !== 'active') return sendError(res, 400, 'Kode premium sudah dipakai atau kedaluwarsa.');

    const [userRow] = await sql`SELECT premium_until FROM users WHERE id = ${user.id}`;
    const currentUntil = userRow?.premium_until && new Date(userRow.premium_until) > new Date()
      ? new Date(userRow.premium_until)
      : new Date();

    const newUntil = await extendDate(currentUntil, premiumCode.duration_days);

    await sql`UPDATE users SET premium_until = ${newUntil.toISOString()} WHERE id = ${user.id}`;
    await sql`
      UPDATE premium_codes SET
        status = 'used', used_by = ${user.id}, used_at = NOW(), expires_at = ${newUntil.toISOString()}
      WHERE id = ${premiumCode.id}
    `;

    return sendOk(res, { premium_until: newUntil.toISOString() });
  } catch (err) {
    console.error('premium redeem error:', err);
    return sendError(res, 500, 'Gagal redeem kode premium.');
  }
}

async function extendDate(baseDate, days) {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

async function handleGenerateCodes(req, res) {
  if (!requireAdmin(req, res)) return;

  const { amount, duration_days } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDuration = Number(duration_days);

  if (!parsedAmount || parsedAmount < 1 || parsedAmount > MAX_CODES_PER_BATCH) {
    return sendError(res, 400, `Jumlah kode harus antara 1-${MAX_CODES_PER_BATCH}.`);
  }
  if (!parsedDuration || parsedDuration < 1) {
    return sendError(res, 400, 'Durasi kode tidak valid.');
  }

  try {
    const generatedCodes = [];
    for (let i = 0; i < parsedAmount; i++) {
      generatedCodes.push(await insertUniqueCode(parsedDuration));
    }
    return sendOk(res, { codes: generatedCodes });
  } catch (err) {
    console.error('code generate error:', err);
    return sendError(res, 500, 'Gagal generate kode premium.');
  }
}

async function insertUniqueCode(durationDays, attempt = 0) {
  const code = generatePremiumCode();
  try {
    const [row] = await sql`
      INSERT INTO premium_codes (code, duration_days)
      VALUES (${code}, ${durationDays})
      RETURNING id, code, duration_days, status, created_at
    `;
    return row;
  } catch (err) {
    if (attempt < 3) return insertUniqueCode(durationDays, attempt + 1); // retry on rare collision
    throw err;
  }
}

async function handleListCodes(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const codes = await sql`
      SELECT id, code, duration_days, status, used_at, expires_at, created_at
      FROM premium_codes
      ORDER BY created_at DESC
    `;
    return sendOk(res, { codes });
  } catch (err) {
    console.error('code list error:', err);
    return sendError(res, 500, 'Gagal mengambil daftar kode.');
  }
}

async function handleDeleteCode(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID kode wajib diisi.');

  try {
    await sql`DELETE FROM premium_codes WHERE id = ${id}`;
    return sendOk(res);
  } catch (err) {
    console.error('code delete error:', err);
    return sendError(res, 500, 'Gagal menghapus kode.');
  }
}

async function handleHistory(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const history = await sql`
      SELECT pc.code, pc.duration_days, pc.expires_at, u.username
      FROM premium_codes pc
      JOIN users u ON u.id = pc.used_by
      WHERE pc.status = 'used'
      ORDER BY pc.used_at DESC
    `;
    return sendOk(res, { history });
  } catch (err) {
    console.error('code history error:', err);
    return sendError(res, 500, 'Gagal mengambil history kode.');
  }
}
