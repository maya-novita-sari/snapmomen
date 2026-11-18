import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';
import { ensureSettingsTable, loadPriceSettings, saveSetting } from './_lib/settings-store.js';

const MAX_PRICE = 100000000;
const MAX_TEXT_LENGTH = 300;
const TEXT_SETTING_LABELS = {
  kamera_device_id: 'ID kamera',
  kamera_label: 'Nama kamera',
  printer_name: 'Nama printer',
  printer_vendor_id: 'Vendor ID printer',
  printer_product_id: 'Product ID printer',
};

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

function parseText(value, label) {
  const text = value === null ? '' : String(value);
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`${label} terlalu panjang.`);
  return text;
}

function buildTextUpdates(body) {
  return Object.entries(TEXT_SETTING_LABELS)
    .filter(([key]) => body[key] !== undefined)
    .map(([key, label]) => ({ key, value: parseText(body[key], label) }));
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
  return [...updates, ...buildTextUpdates(body)];
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
