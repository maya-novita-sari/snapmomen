import { fetchPaymentStatus } from './doku.js';
import { updatePaymentStatus } from './payment-store.js';

// Kalau masih pending, tanya langsung ke DOKU supaya tetap akurat walau notifikasi telat atau tidak sampai.
// Status dari DOKU adalah sumber kebenaran, jadi notifikasi palsu tidak bisa membuat order menjadi lunas.
export async function syncPaymentWithGateway(payment) {
  try {
    const remote = await fetchPaymentStatus(payment);
    if (!remote || remote.status === 'pending') return payment;
    if (remote.status === 'paid' && remote.amount !== null && remote.amount !== payment.amount) {
      console.error('nominal pembayaran tidak cocok, perlu dicek manual:', payment.order_id);
      return payment;
    }
    return await updatePaymentStatus({
      orderId: payment.order_id, status: remote.status, transactionId: remote.transactionId,
    });
  } catch (err) {
    console.error('payment sync error:', err);
    return payment;
  }
}
