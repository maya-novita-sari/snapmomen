import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';
import { ensureSettingsTable, loadPriceSettings, saveSetting } from './_lib/settings-store.js';

const MAX_PRICE = 100000000;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleUpdate(req, res);

  return sendError(res, 405, 'Method tidak diizinkan.');
}

async function handleGet(req, res) {
  try {
    return sendOk(res, { settings: await loadPriceSettings() });
  } catch (err) {
    console.error('settings get error:', err);
    return sendError(res, 500, 'Gagal mengambil pengaturan.');
  }
}

function parsePrice(value, label) {
  const price = Number(value);
  if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
    throw new Error(`${label} harus berupa angka bulat 0 atau lebih.`);
  }
  return String(price);
}

// Mengubah body request menjadi daftar { key, value } yang valid. Hanya key yang dikirim yang diproses.
function buildSettingUpdates(body) {
  const updates = [];
  if (body.harga_sesi !== undefined) {
    updates.push({ key: 'harga_sesi', value: parsePrice(body.harga_sesi, 'Harga per sesi') });
  }
  if (body.harga_tambah_cetak !== undefined) {
    updates.push({ key: 'harga_tambah_cetak', value: parsePrice(body.harga_tambah_cetak, 'Harga tambah cetak') });
  }
  return updates;
}

async function handleUpdate(req, res) {
  if (!requireAdmin(req, res)) return;

  let updates;
  try {
    updates = buildSettingUpdates(req.body || {});
  } catch (err) {
    return sendError(res, 400, err.message);
  }
  if (!updates.length) return sendError(res, 400, 'Tidak ada pengaturan yang dikirim.');

  try {
    await ensureSettingsTable();
    for (const update of updates) await saveSetting(update);
    return sendOk(res, { settings: await loadPriceSettings() });
  } catch (err) {
    console.error('settings update error:', err);
    return sendError(res, 500, 'Gagal menyimpan pengaturan.');
  }
}
