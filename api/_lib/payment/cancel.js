import { requireAdmin } from '../auth-middleware.js';
import { handlePreflight, sendOk, sendError } from '../response.js';
import { findPaymentByOrderId, updatePaymentStatus } from '../payment-store.js';
import { cancelTransaction } from '../doku.js';
import { syncPaymentWithGateway } from '../payment-sync.js';

// Membatalkan QR yang ditinggalkan (jumlah cetak diubah atau sesi direset) supaya tidak bisa dibayar lagi.
export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');
  if (!requireAdmin(req, res)) return;

  const orderId = String((req.body || {}).order_id || '');
  if (!orderId) return sendError(res, 400, 'order_id wajib diisi.');

  try {
    let payment = await findPaymentByOrderId(orderId);
    if (!payment) return sendError(res, 404, 'Transaksi tidak ditemukan.');
    if (payment.status !== 'pending') return sendOk(res, { order_id: orderId, status: payment.status });

    // Kalau DOKU menolak pembatalan, kemungkinan QR baru saja dibayar. Cek status sebenarnya.
    const isCanceled = await cancelTransaction({ orderId, transactionId: payment.transaction_id });
    payment = isCanceled
      ? await updatePaymentStatus({ orderId, status: 'canceled' })
      : await syncPaymentWithGateway(payment);
    return sendOk(res, { order_id: orderId, status: payment.status });
  } catch (err) {
    console.error('payment cancel error:', err);
    return sendError(res, 500, 'Gagal membatalkan pembayaran.');
  }
}
