import { handlePreflight, sendOk, sendError } from '../_lib/response.js';
import { findPaymentByOrderId, updatePaymentStatus } from '../_lib/payment-store.js';
import { isValidNotificationSignature, mapTransactionStatus } from '../_lib/midtrans.js';

// Endpoint ini dipanggil oleh Midtrans (bukan browser), jadi keamanannya lewat signature_key.
export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');

  const notification = req.body || {};

  try {
    if (!isValidNotificationSignature(notification)) {
      return sendError(res, 403, 'Signature tidak valid.');
    }

    const payment = await findPaymentByOrderId(notification.order_id);
    if (!payment) return sendOk(res, { ignored: true });

    if (Number(notification.gross_amount) !== payment.amount) {
      return sendError(res, 400, 'Nominal tidak cocok.');
    }

    const status = mapTransactionStatus(notification.transaction_status, notification.fraud_status);
    if (status === 'paid' && ['canceled', 'expired', 'failed'].includes(payment.status)) {
      console.warn('payment paid pada order yang sudah tidak aktif, perlu dicek manual:', payment.order_id);
    }
    await updatePaymentStatus({
      orderId: payment.order_id, status, transactionId: notification.transaction_id,
    });
    return sendOk(res);
  } catch (err) {
    console.error('payment webhook error:', err);
    return sendError(res, 500, 'Gagal memproses notifikasi.');
  }
}
