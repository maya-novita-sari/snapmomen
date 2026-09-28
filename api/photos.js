import { sql } from './_lib/db.js';
import { requireAuth, requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';
import { describeDbError } from './_lib/db-errors.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const PHOTO_LIFETIME_DAYS  = 3;
const MAX_IMAGE_DATA_CHARS = 1500000;
const MAX_THUMB_DATA_CHARS = 200000;
const MAX_CAPTION_LENGTH   = 120;
const DEFAULT_PAGE_SIZE    = 12;
const MAX_PAGE_SIZE        = 48;
const IMAGE_DATA_PREFIX    = 'data:image/';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const { type, id, gallery } = req.query;

  if (req.method === 'GET' && (type === 'galeri' || gallery)) return handleGalleryList(req, res);
  if (req.method === 'GET' && id) return handleGetOne(req, res);
  if (req.method === 'GET') return handleResultList(req, res);
  if (req.method === 'POST') return handleSave(req, res);
  if (req.method === 'PATCH' || req.method === 'PUT') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}

function readPagination(query) {
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

function splitPage(rows, limit) {
  return { photos: rows.slice(0, limit), has_more: rows.length > limit };
}

function validateImageData(imageData, maxChars, label) {
  if (typeof imageData !== 'string' || !imageData.startsWith(IMAGE_DATA_PREFIX)) {
    return `Data ${label} tidak valid.`;
  }
  if (imageData.length > maxChars) {
    return `Ukuran ${label} terlalu besar (maks sekitar 1 MB). Kompres dulu sebelum dikirim.`;
  }
  return null;
}

function cleanCaption(caption) {
  if (caption === undefined || caption === null) return null;
  return String(caption).trim().slice(0, MAX_CAPTION_LENGTH);
}

async function handleGalleryList(req, res) {
  const { limit, offset } = readPagination(req.query);
  try {
    const rows = await sql`
      SELECT id, COALESCE(thumb_data, image_data) AS thumb_data, caption, created_at
      FROM photos
      WHERE is_galeri = TRUE
      ORDER BY created_at DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
    return sendOk(res, splitPage(rows, limit));
  } catch (err) {
    console.error('photos gallery error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal mengambil galeri foto.'));
  }
}

async function handleResultList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { limit, offset } = readPagination(req.query);
  try {
    const rows = user.role === 'admin'
      ? await sql`
          SELECT p.id, p.user_id, p.frame_id, COALESCE(p.thumb_data, p.image_data) AS thumb_data,
                 p.printed, p.is_galeri, p.is_hasil, p.is_permanent, p.caption, p.expires_at, p.created_at,
                 u.username
          FROM photos p
          LEFT JOIN users u ON u.id = p.user_id
          WHERE p.is_galeri = FALSE
          ORDER BY p.created_at DESC
          LIMIT ${limit + 1} OFFSET ${offset}
        `
      : await sql`
          SELECT id, user_id, frame_id, COALESCE(thumb_data, image_data) AS thumb_data,
                 printed, is_galeri, is_hasil, is_permanent, caption, expires_at, created_at
          FROM photos
          WHERE user_id = ${user.id} AND is_galeri = FALSE
          ORDER BY created_at DESC
          LIMIT ${limit + 1} OFFSET ${offset}
        `;
    return sendOk(res, splitPage(rows, limit));
  } catch (err) {
    console.error('photos list error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal mengambil daftar foto.'));
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
  const user = requireAdmin(req, res);
  if (!user) return;

  const { image_data, thumb_data, frame_id, caption, is_galeri } = req.body || {};
  const imageError = validateImageData(image_data, MAX_IMAGE_DATA_CHARS, 'foto');
  if (imageError) return sendError(res, 400, imageError);

  const thumbError = thumb_data ? validateImageData(thumb_data, MAX_THUMB_DATA_CHARS, 'thumbnail') : null;
  if (thumbError) return sendError(res, 400, thumbError);

  const isGallery = Boolean(is_galeri);
  try {
    const [photo] = await sql`
      INSERT INTO photos (user_id, frame_id, image_data, thumb_data, caption,
                          is_galeri, is_hasil, is_permanent, expires_at)
      VALUES (${user.id}, ${frame_id || null}, ${image_data}, ${thumb_data || null}, ${cleanCaption(caption)},
              ${isGallery}, FALSE, ${isGallery},
              NOW() + make_interval(days => ${PHOTO_LIFETIME_DAYS}))
      RETURNING id, user_id, frame_id, is_galeri, is_permanent, caption, expires_at, created_at
    `;
    return sendOk(res, { photo });
  } catch (err) {
    console.error('photo save error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal menyimpan foto ke database.'));
  }
}

function buildUpdateValues(body) {
  const movesToGallery = body.is_galeri === true;
  return {
    isGaleri   : body.is_galeri ?? null,
    isHasil    : movesToGallery ? false : (body.is_hasil ?? null),
    isPermanent: movesToGallery ? true : (body.is_permanent ?? null),
    caption    : cleanCaption(body.caption),
    imageData  : body.image_data ?? null,
    thumbData  : body.thumb_data ?? null,
  };
}

async function handleUpdate(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID foto wajib diisi.');

  const body = req.body || {};
  const imageError = body.image_data ? validateImageData(body.image_data, MAX_IMAGE_DATA_CHARS, 'foto') : null;
  if (imageError) return sendError(res, 400, imageError);

  const values = buildUpdateValues(body);
  try {
    const [photo] = await sql`
      UPDATE photos SET
        is_galeri    = COALESCE(${values.isGaleri}, is_galeri),
        is_hasil     = COALESCE(${values.isHasil}, is_hasil),
        is_permanent = COALESCE(${values.isPermanent}, is_permanent),
        caption      = COALESCE(${values.caption}, caption),
        image_data   = COALESCE(${values.imageData}, image_data),
        thumb_data   = COALESCE(${values.thumbData}, thumb_data)
      WHERE id = ${id}
      RETURNING id, is_galeri, is_hasil, is_permanent, caption
    `;
    if (!photo) return sendError(res, 404, 'Foto tidak ditemukan.');
    return sendOk(res, { photo });
  } catch (err) {
    console.error('photo update error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal memperbarui foto.'));
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