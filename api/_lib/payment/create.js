import crypto from 'node:crypto';
import { requireAdmin } from '../auth-middleware.js';
import { handlePreflight, sendOk, sendError } from '../response.js';
import { loadPriceSettings } from '../settings-store.js';
import {
  insertPayment, findActivePaymentByClientRef, cancelPendingPayment, isUniqueViolation,
} from '../payment-store.js';
import { createQrisCharge, cancelTransaction, QR_LIFETIME_MINUTES } from '../doku.js';
import { syncPaymentWithGateway } from '../payment-sync.js';

const MIN_PRINT_COPIES = 1;
const MAX_PRINT_COPIES = 99;
const CLIENT_REF_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
const MAX_RESOLVE_ATTEMPTS = 3;

const QR_LIFETIME_MS = QR_LIFETIME_MINUTES * 60 * 1000;

class PaymentConflictError extends Error {}

function parsePrintCopies(value) {
  const copies = Number(value);
  if (!Number.isInteger(copies) || copies < MIN_PRINT_COPIES || copies > MAX_PRINT_COPIES) {
    throw new Error(`Jumlah cetak harus antara ${MIN_PRINT_COPIES} dan ${MAX_PRINT_COPIES}.`);
  }
  return copies;
}

function parseClientRef(value) {
  if (typeof value !== 'string' || !CLIENT_REF_PATTERN.test(value)) {
    throw new Error('client_ref tidak valid.');
  }
  return value;
}

function generateOrderId() {
  return `SNAP-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
}

// Total dihitung di server dari pengaturan harga, jadi nominal tidak bisa diubah dari browser.
function calculateTotalPrice(settings, copies) {
  return settings.harga_sesi + (copies - 1) * settings.harga_tambah_cetak;
}

// Best effort: kalau pembatalan di DOKU gagal, transaksi akan kedaluwarsa sendiri.
async function cancelTransactionSafely({ orderId, transactionId }) {
  try {
    await cancelTransaction({ orderId, transactionId });
  } catch (err) {
    console.error('doku cancel error:', err);
  }
}

function getRemainingLifetimeMs(payment) {
  return new Date(payment.created_at).getTime() + QR_LIFETIME_MS - Date.now();
}

// Order lama yang nominalnya sudah tidak sesuai dibatalkan supaya QR-nya tidak bisa dibayar lagi.
// Mengembalikan false kalau order itu ternyata sudah berubah status (misalnya baru saja dibayar).
async function supersedePendingPayment(payment) {
  await cancelTransactionSafely({ orderId: payment.order_id, transactionId: payment.transaction_id });
  return Boolean(await cancelPendingPayment(payment.order_id));
}

// Mencari order yang sudah ada untuk sesi ini. Mengembalikan null kalau perlu membuat order baru.
async function findReusablePayment(clientRef, amount) {
  for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt += 1) {
    let existing = await findActivePaymentByClientRef(clientRef);
    if (!existing) return null;
    if (existing.status === 'pending') existing = await syncPaymentWithGateway(existing);

    if (existing.status === 'paid') {
      if (existing.amount === amount) return existing;
      throw new PaymentConflictError('Pembayaran untuk sesi ini sudah diterima. Jumlah cetak tidak bisa diubah.');
    }
    if (existing.status !== 'pending') return null;
    // QR yang nominalnya tidak cocok atau sudah lewat masa berlakunya diganti dengan QR baru.
    if (existing.amount === amount && getRemainingLifetimeMs(existing) > 0) return existing;
    if (await supersedePendingPayment(existing)) return null;
  }
  throw new PaymentConflictError('Status pembayaran berubah. Coba lagi.');
}

async function insertPendingPayment({ clientRef, amount }) {
  const orderId = generateOrderId();
  const charge = await createQrisCharge({ orderId, amount });
  try {
    return await insertPayment({
      orderId, clientRef, amount, status: 'pending',
      qrString: charge.qrString, qrUrl: charge.qrUrl, transactionId: charge.transactionId,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Request paralel sudah membuat order untuk sesi ini. Order yang baru dibatalkan, order lama dipakai.
    await cancelTransactionSafely({ orderId, transactionId: charge.transactionId });
    return findActivePaymentByClientRef(clientRef);
  }
}

async function createPayment({ clientRef, amount }) {
  // Total 0 berarti gratis, tidak perlu transaksi ke payment gateway.
  if (amount === 0) return insertPayment({ orderId: generateOrderId(), clientRef, amount, status: 'paid' });
  return insertPendingPayment({ clientRef, amount });
}

function buildPaymentResponse(payment) {
  return {
    order_id: payment.order_id,
    amount: payment.amount,
    status: payment.status,
    qr_url: payment.qr_url || '',
    qr_string: payment.qr_string || '',
    expires_in: Math.max(0, Math.round(getRemainingLifetimeMs(payment) / 1000)),
  };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');
  if (!requireAdmin(req, res)) return;

  let copies;
  let clientRef;
  try {
    const body = req.body || {};
    copies = parsePrintCopies(body.print_copies);
    clientRef = parseClientRef(body.client_ref);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  try {
    const amount = calculateTotalPrice(await loadPriceSettings(), copies);
    const payment = (await findReusablePayment(clientRef, amount)) || (await createPayment({ clientRef, amount }));
    return sendOk(res, buildPaymentResponse(payment));
  } catch (err) {
    if (err instanceof PaymentConflictError) return sendError(res, 409, err.message);
    console.error('payment create error:', err);
    return sendError(res, 502, 'Gagal membuat QRIS. Periksa pengaturan DOKU.');
  }
}
