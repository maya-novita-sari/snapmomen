import { requireAdmin } from '../_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from '../_lib/response.js';
import { consumePayment, findPaymentByOrderId } from '../_lib/payment-store.js';

// Satu pembayaran hanya boleh membuka satu sesi. Dipanggil sekali saat admin lanjut setelah bayar.
export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');
  if (!requireAdmin(req, res)) return;

  const orderId = String((req.body || {}).order_id || '');
  if (!orderId) return sendError(res, 400, 'order_id wajib diisi.');

  try {
    const existing = await findPaymentByOrderId(orderId);
    if (!existing) return sendError(res, 404, 'Transaksi tidak ditemukan.');
    if (existing.status !== 'paid') return sendError(res, 409, 'Pembayaran belum diterima.');

    const consumed = await consumePayment(orderId);
    if (!consumed) return sendError(res, 409, 'Pembayaran ini sudah dipakai. Silakan bayar ulang.');
    return sendOk(res, { order_id: orderId, status: 'paid', consumed: true });
  } catch (err) {
    console.error('payment consume error:', err);
    return sendError(res, 500, 'Gagal memproses pembayaran.');
  }
}
