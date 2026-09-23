import { sql } from './_lib/db.js';
import { requireAuth, requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

const PHOTO_LIFETIME_DAYS = 3;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET' && req.query.gallery) return handleGalleryPublic(req, res);
  if (req.method === 'GET' && req.query.id) return handleGetOne(req, res);
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleSave(req, res);
  if (req.method === 'PUT') return handleToggleFeatured(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}

const GALLERY_LIMIT = 12;

async function handleGalleryPublic(req, res) {
  try {
    const photos = await sql`
      SELECT id, image_data
      FROM photos
      WHERE featured = TRUE AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT ${GALLERY_LIMIT}
    `;
    return sendOk(res, { photos });
  } catch (err) {
    console.error('photos gallery error:', err);
    return sendError(res, 500, 'Gagal mengambil galeri foto.');
  }
}

async function handleList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const photos = user.role === 'admin'
      ? await sql`
          SELECT p.id, p.user_id, p.frame_id, p.image_data, p.printed, p.featured, p.expires_at, p.created_at,
                 u.username
          FROM photos p
          LEFT JOIN users u ON u.id = p.user_id
          ORDER BY p.created_at DESC
        `
      : await sql`
          SELECT id, user_id, frame_id, image_data, printed, featured, expires_at, created_at
          FROM photos
          WHERE user_id = ${user.id}
          ORDER BY created_at DESC
        `;
    return sendOk(res, { photos });
  } catch (err) {
    console.error('photos list error:', err);
    return sendError(res, 500, 'Gagal mengambil daftar foto.');
  }
}

async function handleGetOne(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  try {
    const [photo] = await sql`SELECT * FROM photos WHERE id = ${id}`;
    if (!photo) return sendError(res, 404, 'Foto tidak ditemukan.');
    if (user.role !== 'admin' && photo.user_id !== user.id) {
      return sendError(res, 403, 'Tidak boleh mengakses foto ini.');
    }
    return sendOk(res, { photo });
  } catch (err) {
    console.error('photo fetch error:', err);
    return sendError(res, 500, 'Gagal mengambil foto.');
  }
}

async function handleSave(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { image_data, frame_id } = req.body || {};
  if (!image_data) return sendError(res, 400, 'Data foto wajib diisi.');

  try {
    const [photo] = await sql`
      INSERT INTO photos (user_id, frame_id, image_data, expires_at)
      VALUES (${user.id}, ${frame_id || null}, ${image_data}, NOW() + make_interval(days => ${PHOTO_LIFETIME_DAYS}))
      RETURNING id, user_id, frame_id, printed, expires_at, created_at
    `;
    return sendOk(res, { photo });
  } catch (err) {
    console.error('photo save error:', err);
    return sendError(res, 500, 'Gagal menyimpan foto.');
  }
}

async function handleToggleFeatured(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID foto wajib diisi.');

  const { featured } = req.body || {};

  try {
    const [photo] = await sql`
      UPDATE photos SET featured = ${Boolean(featured)} WHERE id = ${id}
      RETURNING id, featured
    `;
    if (!photo) return sendError(res, 404, 'Foto tidak ditemukan.');
    return sendOk(res, { photo });
  } catch (err) {
    console.error('photo toggle featured error:', err);
    return sendError(res, 500, 'Gagal memperbarui foto.');
  }
}

async function handleDelete(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID foto wajib diisi.');

  try {
    await sql`DELETE FROM photos WHERE id = ${id}`;
    return sendOk(res);
  } catch (err) {
    console.error('photo delete error:', err);
    return sendError(res, 500, 'Gagal menghapus foto.');
  }
}