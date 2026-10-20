import { sql } from './db.js';

const UNIQUE_VIOLATION_CODE = '23505';

let tableReady = null;

async function createPaymentsSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      client_ref TEXT,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      qr_string TEXT,
      qr_url TEXT,
      transaction_id TEXT,
      paid_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_ref TEXT`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ`;
  // Satu sesi studio hanya boleh punya satu order pending, jadi QR ganda tidak bisa terbentuk.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_pending_client_ref
    ON payments (client_ref) WHERE status = 'pending' AND client_ref IS NOT NULL
  `;
}

// Membuat tabel kalau belum ada, jadi API tetap jalan walau schema.sql belum dijalankan.
export function ensurePaymentsTable() {
  if (!tableReady) {
    tableReady = createPaymentsSchema().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export function isUniqueViolation(err) {
  return err?.code === UNIQUE_VIOLATION_CODE;
}

export async function insertPayment({ orderId, clientRef, amount, status, qrString, qrUrl, transactionId }) {
  await ensurePaymentsTable();
  const [payment] = await sql`
    INSERT INTO payments (order_id, client_ref, amount, status, qr_string, qr_url, transaction_id, paid_at)
    VALUES (
      ${orderId}, ${clientRef}, ${amount}, ${status}, ${qrString || null}, ${qrUrl || null}, ${transactionId || null},
      ${status === 'paid' ? new Date().toISOString() : null}
    )
    RETURNING *
  `;
  return payment;
}

export async function findPaymentByOrderId(orderId) {
  await ensurePaymentsTable();
  const [payment] = await sql`SELECT * FROM payments WHERE order_id = ${orderId}`;
  return payment || null;
}

// Order aktif milik satu sesi studio. Order paid yang sudah dipakai tidak dihitung lagi.
// Order yang sudah paid (dan belum dipakai) selalu diprioritaskan.
export async function findActivePaymentByClientRef(clientRef) {
  await ensurePaymentsTable();
  const [payment] = await sql`
    SELECT * FROM payments
    WHERE client_ref = ${clientRef} AND status IN ('pending', 'paid') AND consumed_at IS NULL
    ORDER BY CASE WHEN status = 'paid' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `;
  return payment || null;
}

// Pembayaran yang sudah paid tidak pernah diturunkan lagi (misalnya oleh notifikasi yang telat).
export async function updatePaymentStatus({ orderId, status, transactionId }) {
  await ensurePaymentsTable();
  const [payment] = await sql`
    UPDATE payments SET
      status = ${status},
      transaction_id = COALESCE(${transactionId || null}, transaction_id),
      paid_at = CASE WHEN ${status} = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
    WHERE order_id = ${orderId} AND status <> 'paid'
    RETURNING *
  `;
  return payment || findPaymentByOrderId(orderId);
}

// Hanya order yang masih pending yang bisa dibatalkan. Mengembalikan null kalau statusnya sudah berubah.
export async function cancelPendingPayment(orderId) {
  await ensurePaymentsTable();
  const [payment] = await sql`
    UPDATE payments SET status = 'canceled'
    WHERE order_id = ${orderId} AND status = 'pending'
    RETURNING *
  `;
  return payment || null;
}

// Menandai pembayaran sudah dipakai untuk membuka satu sesi. Hanya berhasil sekali:
// mengembalikan null kalau belum paid atau sudah pernah dipakai.
export async function consumePayment(orderId) {
  await ensurePaymentsTable();
  const [payment] = await sql`
    UPDATE payments SET consumed_at = NOW()
    WHERE order_id = ${orderId} AND status = 'paid' AND consumed_at IS NULL
    RETURNING *
  `;
  return payment || null;
}
