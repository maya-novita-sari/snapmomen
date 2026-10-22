import { handlePreflight, sendJson, sendError } from '../response.js';
import { findPaymentByOrderId } from '../payment-store.js';
import { syncPaymentWithGateway } from '../payment-sync.js';

const NOTIFICATION_SUCCESS_BODY = { ok: true, responseCode: '2005200', responseMessage: 'Successful' };

function readOrderId(notification) {
  return String(notification.originalPartnerReferenceNo || notification.partnerReferenceNo || '');
}

// Endpoint ini dipanggil oleh DOKU (bukan browser). Isi notifikasi tidak dipercaya begitu saja:
// kita hanya mengambil nomor order, lalu status sebenarnya ditanyakan langsung ke DOKU.
export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  // GET dan HEAD hanya untuk pengecekan URL (misalnya validasi dari dashboard DOKU). Tidak mengubah apa pun.
  if (req.method === 'GET' || req.method === 'HEAD') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');

  const orderId = readOrderId(req.body || {});

  try {
    const payment = orderId ? await findPaymentByOrderId(orderId) : null;
    if (!payment) return sendJson(res, 200, NOTIFICATION_SUCCESS_BODY);

    const synced = await syncPaymentWithGateway(payment);
    if (synced.status === 'paid' && ['canceled', 'expired', 'failed'].includes(payment.status)) {
      console.warn('payment paid pada order yang sudah tidak aktif, perlu dicek manual:', payment.order_id);
    }
    return sendJson(res, 200, NOTIFICATION_SUCCESS_BODY);
  } catch (err) {
    console.error('payment webhook error:', err);
    return sendError(res, 500, 'Gagal memproses notifikasi.');
  }
}