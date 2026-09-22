import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

const VALID_SIZES = ['5x15', '10x15'];
const VALID_TYPES = ['free', 'premium'];

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PUT') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}

// Public: anyone can browse active frames (studio + landing page showcase).
async function handleList(req, res) {
  try {
    const frames = await sql`
      SELECT id, name, size, type, image_url, is_active, created_at
      FROM frames
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;
    return sendOk(res, { frames });
  } catch (err) {
    console.error('frames list error:', err);
    return sendError(res, 500, 'Gagal mengambil daftar bingkai.');
  }
}

async function handleCreate(req, res) {
  if (!requireAdmin(req, res)) return;

  const { name, size, type, image_url } = req.body || {};
  const validationError = validateFrameInput({ name, size, type, image_url });
  if (validationError) return sendError(res, 400, validationError);

  try {
    const [frame] = await sql`
      INSERT INTO frames (name, size, type, image_url)
      VALUES (${name}, ${size}, ${type}, ${image_url})
      RETURNING id, name, size, type, image_url, is_active, created_at
    `;
    return sendOk(res, { frame });
  } catch (err) {
    console.error('frame create error:', err);
    return sendError(res, 500, 'Gagal menambah bingkai.');
  }
}

async function handleUpdate(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID bingkai wajib diisi.');

  const { name, size, type, image_url, is_active } = req.body || {};

  try {
    const [frame] = await sql`
      UPDATE frames SET
        name = COALESCE(${name}, name),
        size = COALESCE(${size}, size),
        type = COALESCE(${type}, type),
        image_url = COALESCE(${image_url}, image_url),
        is_active = COALESCE(${is_active}, is_active)
      WHERE id = ${id}
      RETURNING id, name, size, type, image_url, is_active, created_at
    `;
    if (!frame) return sendError(res, 404, 'Bingkai tidak ditemukan.');
    return sendOk(res, { frame });
  } catch (err) {
    console.error('frame update error:', err);
    return sendError(res, 500, 'Gagal memperbarui bingkai.');
  }
}

async function handleDelete(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID bingkai wajib diisi.');

  try {
    await sql`DELETE FROM frames WHERE id = ${id}`;
    return sendOk(res);
  } catch (err) {
    console.error('frame delete error:', err);
    return sendError(res, 500, 'Gagal menghapus bingkai.');
  }
}

function validateFrameInput({ name, size, type, image_url }) {
  if (!name || !name.trim()) return 'Nama bingkai wajib diisi.';
  if (!VALID_SIZES.includes(size)) return 'Ukuran bingkai tidak valid.';
  if (!VALID_TYPES.includes(type)) return 'Tipe bingkai tidak valid.';
  if (!image_url) return 'Gambar bingkai wajib diunggah.';
  return null;
}
