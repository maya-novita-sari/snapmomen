import { randomInt } from 'crypto';
import { sql } from './_lib/db.js';
import { requireAdmin, getAuthUser } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';
import { describeDbError } from './_lib/db-errors.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const VALID_SIZES = ['5x15', '10x15'];
const VALID_CATEGORIES       = ['free', 'premium', 'custom'];
const TOKEN_ALPHABET         = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH           = 8;
const TOKEN_MAX_ATTEMPTS     = 5;
const MAX_TOKENS_PER_REQUEST = 20;
const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is;
const PUBLIC_CACHE_SECONDS   = 86400;
const CUSTOM_CACHE_SECONDS   = 3600;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const { action, image, scope } = req.query;

  if (req.method === 'GET' && image) return handleImage(req, res);
  if (req.method === 'GET' && scope === 'admin') return handleAdminList(req, res);
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST' && action === 'verify-token') return handleVerifyToken(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PUT') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}


function generateRandomToken() {
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return token;
}

async function generateUniqueToken() {
  for (let attempt = 0; attempt < TOKEN_MAX_ATTEMPTS; attempt++) {
    const token = generateRandomToken();
    const existing = await sql`SELECT 1 FROM frames WHERE access_token = ${token}`;
    if (!existing.length) return token;
  }
  throw new Error('Gagal membuat token unik.');
}

async function resolveOwnerId(username) {
  const cleanName = String(username || '').trim();
  if (!cleanName) return null;
  const [user] = await sql`SELECT id FROM users WHERE username = ${cleanName}`;
  return user ? user.id : undefined;
}

function toDatabaseType(category) {
  return category === 'custom' ? 'premium' : category;
}

function validateFrameInput({ name, size, category, image_url }, { requireImage }) {
  if (!name || !name.trim()) return 'Nama bingkai wajib diisi.';
  if (!VALID_SIZES.includes(size)) return 'Ukuran bingkai tidak valid.';
  if (!VALID_CATEGORIES.includes(category)) return 'Kategori bingkai tidak valid.';
  if (requireImage && !image_url) return 'Gambar bingkai wajib diunggah.';
  return null;
}


async function handleList(req, res) {
  try {
    const frames = await sql`
      SELECT id, name, size, type, CASE WHEN category = 'custom' THEN 'custom' ELSE type END AS category, is_active, created_at,
             LENGTH(image_url) AS image_size
      FROM frames
      WHERE is_active = TRUE AND category <> 'custom'
      ORDER BY created_at DESC
    `;
    return sendOk(res, { frames });
  } catch (err) {
    console.error('frames list error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal mengambil daftar bingkai.'));
  }
}

async function handleAdminList(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const frames = await sql`
      SELECT f.id, f.name, f.size, f.type, CASE WHEN f.category = 'custom' THEN 'custom' ELSE f.type END AS category, f.is_active, f.created_at,
             f.access_token, f.owner_id, u.username AS owner_username,
             LENGTH(f.image_url) AS image_size
      FROM frames f
      LEFT JOIN users u ON u.id = f.owner_id
      ORDER BY f.created_at DESC
    `;
    return sendOk(res, { frames });
  } catch (err) {
    console.error('frames admin list error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal mengambil daftar bingkai.'));
  }
}


async function handleImage(req, res) {
  const id = Number(req.query.image);
  if (!id) return sendError(res, 400, 'ID bingkai wajib diisi.');

  try {
    const [frame] = await sql`
      SELECT image_url, CASE WHEN category = 'custom' THEN 'custom' ELSE type END AS category, access_token
      FROM frames WHERE id = ${id} AND is_active = TRUE
    `;
    if (!frame) return sendError(res, 404, 'Bingkai tidak ditemukan.');
    if (frame.category === 'custom' && req.query.token !== frame.access_token) {
      return sendError(res, 403, 'Token bingkai tidak valid.');
    }
    return sendFrameImage(res, frame);
  } catch (err) {
    console.error('frame image error:', err);
    return sendError(res, 500, 'Gagal memuat gambar bingkai.');
  }
}

function sendFrameImage(res, frame) {
  const match = IMAGE_DATA_URL_PATTERN.exec(frame.image_url || '');
  if (!match) {
    res.setHeader('Location', frame.image_url);
    return res.status(302).end();
  }

  const isCustom = frame.category === 'custom';
  const cacheScope = isCustom ? 'private' : 'public';
  const cacheSeconds = isCustom ? CUSTOM_CACHE_SECONDS : PUBLIC_CACHE_SECONDS;
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Cache-Control', `${cacheScope}, max-age=${cacheSeconds}`);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.status(200).send(Buffer.from(match[2], 'base64'));
}


function readRequestedTokens(body) {
  const rawTokens = Array.isArray(body?.tokens) ? body.tokens : [body?.token];
  const cleanTokens = rawTokens
    .filter(Boolean)
    .map((token) => String(token).trim().toUpperCase());
  return [...new Set(cleanTokens)].slice(0, MAX_TOKENS_PER_REQUEST);
}

function canUseFrame(frame, user) {
  if (!frame.owner_id) return true;
  if (!user) return false;
  return user.role === 'admin' || user.id === frame.owner_id;
}

async function handleVerifyToken(req, res) {
  const tokens = readRequestedTokens(req.body);
  if (!tokens.length) return sendError(res, 400, 'Token wajib diisi.');

  try {
    const rows = await sql`
      SELECT id, name, size, owner_id, access_token, LENGTH(image_url) AS image_size
      FROM frames
      WHERE access_token = ANY(${tokens}::text[]) AND category = 'custom' AND is_active = TRUE
    `;
    const user = getAuthUser(req);
    const frames = rows
      .filter((frame) => canUseFrame(frame, user))
      .map(({ owner_id, ...frame }) => ({ ...frame, category: 'custom' }));
    const validTokens = frames.map((frame) => frame.access_token);
    const invalidTokens = tokens.filter((token) => !validTokens.includes(token));

    if (!frames.length && tokens.length === 1) {
      return sendError(res, 404, 'Token tidak valid atau bukan untuk akun kamu.');
    }
    return sendOk(res, { frames, invalid_tokens: invalidTokens });
  } catch (err) {
    console.error('frames verify-token error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal memeriksa token.'));
  }
}


async function handleCreate(req, res) {
  if (!requireAdmin(req, res)) return;

  const { name, size, image_url, owner_username } = req.body || {};
  const category = req.body?.category || req.body?.type;
  const validationError = validateFrameInput({ name, size, category, image_url }, { requireImage: true });
  if (validationError) return sendError(res, 400, validationError);

  try {
    const isCustom = category === 'custom';
    const ownerId = isCustom ? await resolveOwnerId(owner_username) : null;
    if (ownerId === undefined) return sendError(res, 400, 'Username pemilik tidak ditemukan.');

    const accessToken = isCustom ? await generateUniqueToken() : null;
    const [frame] = await sql`
      INSERT INTO frames (name, size, type, category, image_url, owner_id, access_token)
      VALUES (${name.trim()}, ${size}, ${toDatabaseType(category)}, ${category}, ${image_url}, ${ownerId}, ${accessToken})
      RETURNING id, name, size, type, category, is_active, access_token, owner_id, created_at
    `;
    return sendOk(res, { frame });
  } catch (err) {
    console.error('frame create error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal menambah bingkai.'));
  }
}

async function handleUpdate(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!id) return sendError(res, 400, 'ID bingkai wajib diisi.');

  try {
    const [existing] = await sql`SELECT * FROM frames WHERE id = ${id}`;
    if (!existing) return sendError(res, 404, 'Bingkai tidak ditemukan.');

    const body = req.body || {};
    const merged = {
      name     : body.name ?? existing.name,
      size     : body.size ?? existing.size,
      category : body.category ?? body.type ?? (existing.category === 'custom' ? 'custom' : existing.type),
      image_url: body.image_url ?? existing.image_url,
    };
    const validationError = validateFrameInput(merged, { requireImage: false });
    if (validationError) return sendError(res, 400, validationError);

    const isCustom = merged.category === 'custom';
    const ownerId = await pickOwnerId(isCustom, body.owner_username, existing.owner_id);
    if (ownerId === undefined) return sendError(res, 400, 'Username pemilik tidak ditemukan.');

    const accessToken = isCustom ? (existing.access_token || await generateUniqueToken()) : null;
    const isActive = body.is_active ?? existing.is_active;

    const [frame] = await sql`
      UPDATE frames SET
        name         = ${merged.name.trim()},
        size         = ${merged.size},
        type         = ${toDatabaseType(merged.category)},
        category     = ${merged.category},
        image_url    = ${merged.image_url},
        owner_id     = ${ownerId},
        access_token = ${accessToken},
        is_active    = ${isActive}
      WHERE id = ${id}
      RETURNING id, name, size, type, category, is_active, access_token, owner_id, created_at
    `;
    return sendOk(res, { frame });
  } catch (err) {
    console.error('frame update error:', err);
    return sendError(res, 500, describeDbError(err, 'Gagal memperbarui bingkai.'));
  }
}

async function pickOwnerId(isCustom, ownerUsername, currentOwnerId) {
  if (!isCustom) return null;
  if (ownerUsername === undefined) return currentOwnerId;
  return resolveOwnerId(ownerUsername);
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