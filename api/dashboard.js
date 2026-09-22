import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const action = req.query.action;

  if (action === 'stats' && req.method === 'GET') return handleStats(req, res);
  if (action === 'users' && req.method === 'GET') return handleUsers(req, res);
  if (action === 'users' && req.method === 'DELETE') return handleDeleteUser(req, res);

  return sendError(res, 404, 'Endpoint tidak ditemukan.');
}

async function handleStats(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const [totalPhotos] = await sql`SELECT COUNT(*)::int AS count FROM photos`;
    const [totalUsers] = await sql`SELECT COUNT(*)::int AS count FROM users`;
    const [premiumUsers] = await sql`
      SELECT COUNT(*)::int AS count FROM users WHERE premium_until > NOW()
    `;
    const [totalFrames] = await sql`SELECT COUNT(*)::int AS count FROM frames`;
    const [activeCodes] = await sql`
      SELECT COUNT(*)::int AS count FROM premium_codes WHERE status = 'active'
    `;
    const [usedCodes] = await sql`
      SELECT COUNT(*)::int AS count FROM premium_codes WHERE status = 'used'
    `;

    return sendOk(res, {
      stats: {
        total_photos: totalPhotos.count,
        total_users: totalUsers.count,
        premium_users: premiumUsers.count,
        free_users: totalUsers.count - premiumUsers.count,
        total_frames: totalFrames.count,
        active_codes: activeCodes.count,
        used_codes: usedCodes.count,
      },
    });
  } catch (err) {
    console.error('dashboard stats error:', err);
    return sendError(res, 500, 'Gagal mengambil statistik.');
  }
}

async function handleUsers(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await sql`
      SELECT id, username, email, premium_until, created_at FROM users ORDER BY created_at DESC
    `;
    return sendOk(res, { users });
  } catch (err) {
    console.error('dashboard users error:', err);
    return sendError(res, 500, 'Gagal mengambil daftar user.');
  }
}

async function handleDeleteUser(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID user wajib diisi.');

  try {
    await sql`DELETE FROM users WHERE id = ${id}`;
    return sendOk(res);
  } catch (err) {
    console.error('dashboard delete user error:', err);
    return sendError(res, 500, 'Gagal menghapus user.');
  }
}
