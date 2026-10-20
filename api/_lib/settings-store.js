import { sql } from './db.js';

const DEFAULT_SESSION_PRICE = 40000;
const DEFAULT_EXTRA_PRINT_PRICE = 20000;

let tableReady = null;

// Membuat tabel kalau belum ada, jadi API tetap jalan walau schema.sql belum dijalankan.
export function ensureSettingsTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `.catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

function readPrice(rowMap, key, fallback) {
  const parsed = Number(rowMap[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildSettings(rows) {
  const rowMap = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    harga_sesi: readPrice(rowMap, 'harga_sesi', DEFAULT_SESSION_PRICE),
    harga_tambah_cetak: readPrice(rowMap, 'harga_tambah_cetak', DEFAULT_EXTRA_PRINT_PRICE),
  };
}

export async function loadPriceSettings() {
  await ensureSettingsTable();
  const rows = await sql`SELECT key, value FROM settings`;
  return buildSettings(rows);
}

export async function saveSetting({ key, value }) {
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}
