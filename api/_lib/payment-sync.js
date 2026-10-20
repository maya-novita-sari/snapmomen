import { fetchTransactionStatus, mapTransactionStatus } from './midtrans.js';
import { updatePaymentStatus } from './payment-store.js';

// Kalau masih pending, tanya langsung ke Midtrans supaya tetap akurat walau webhook telat atau tidak sampai.
export async function syncPaymentWithMidtrans(payment) {
  try {
    const remote = await fetchTransactionStatus(payment.order_id);
    if (!remote) return payment;
    const mappedStatus = mapTransactionStatus(remote.transaction_status, remote.fraud_status);
    if (mappedStatus === 'pending') return payment;
    return await updatePaymentStatus({
      orderId: payment.order_id, status: mappedStatus, transactionId: remote.transaction_id,
    });
  } catch (err) {
    console.error('payment sync error:', err);
    return payment;
  }
}
