import { requireAdmin } from '../auth-middleware.js';
import { handlePreflight, sendOk, sendError } from '../response.js';
import { findPaymentByOrderId } from '../payment-store.js';
import { syncPaymentWithGateway } from '../payment-sync.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method tidak diizinkan.');
  if (!requireAdmin(req, res)) return;

  const orderId = String(req.query?.order_id || '');
  if (!orderId) return sendError(res, 400, 'order_id wajib diisi.');

  try {
    let payment = await findPaymentByOrderId(orderId);
    if (!payment) return sendError(res, 404, 'Transaksi tidak ditemukan.');
    if (payment.status === 'pending') payment = await syncPaymentWithGateway(payment);
    return sendOk(res, {
      order_id: payment.order_id,
      amount: payment.amount,
      status: payment.status,
      consumed: Boolean(payment.consumed_at),
    });
  } catch (err) {
    console.error('payment status error:', err);
    return sendError(res, 500, 'Gagal mengecek status pembayaran.');
  }
}
