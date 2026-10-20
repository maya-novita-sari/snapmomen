import crypto from 'node:crypto';

const SANDBOX_BASE_URL = 'https://api.sandbox.midtrans.com';
const PRODUCTION_BASE_URL = 'https://api.midtrans.com';
const REQUEST_TIMEOUT_MS = 15000;

function getBaseUrl() {
  return process.env.MIDTRANS_IS_PRODUCTION === 'true' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

function getServerKey() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diatur di environment variable.');
  return serverKey;
}

function buildAuthHeader() {
  return `Basic ${Buffer.from(`${getServerKey()}:`).toString('base64')}`;
}

async function requestMidtrans(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await response.json();
  } finally {
    clearTimeout(timerId);
  }
}

function isSuccessStatusCode(statusCode) {
  return String(statusCode).startsWith('2');
}

function findQrCodeUrl(actions) {
  const action = (actions || []).find((item) => item.name === 'generate-qr-code');
  return action ? action.url : '';
}

// Membuat transaksi QRIS dinamis. Nominal sudah tertanam di QR, customer tidak perlu mengetik.
export async function createQrisCharge({ orderId, amount }) {
  const data = await requestMidtrans('/v2/charge', {
    method: 'POST',
    body: {
      payment_type: 'qris',
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: 'sesi-foto', price: amount, quantity: 1, name: 'Sesi Foto Snapmomen' }],
      qris: { acquirer: 'gopay' },
    },
  });

  if (!isSuccessStatusCode(data.status_code)) {
    throw new Error(data.status_message || 'Midtrans menolak pembuatan transaksi.');
  }
  return {
    transactionId: data.transaction_id || '',
    qrString: data.qr_string || '',
    qrUrl: findQrCodeUrl(data.actions),
  };
}

// Mengembalikan data status transaksi, atau null kalau transaksi tidak ditemukan di Midtrans.
export async function fetchTransactionStatus(orderId) {
  const data = await requestMidtrans(`/v2/${encodeURIComponent(orderId)}/status`);
  return String(data.status_code) === '404' ? null : data;
}

// Membatalkan transaksi yang masih pending supaya QR lama tidak bisa dibayar lagi.
// Mengembalikan true kalau Midtrans mengonfirmasi pembatalan.
export async function cancelTransaction(orderId) {
  const data = await requestMidtrans(`/v2/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' });
  return String(data.status_code) === '200';
}

// Menyederhanakan status Midtrans menjadi: paid, pending, expired, canceled, failed.
export function mapTransactionStatus(transactionStatus, fraudStatus) {
  if (transactionStatus === 'settlement') return 'paid';
  if (transactionStatus === 'capture') return fraudStatus === 'accept' ? 'paid' : 'pending';
  if (transactionStatus === 'pending') return 'pending';
  if (transactionStatus === 'expire') return 'expired';
  if (transactionStatus === 'cancel') return 'canceled';
  return 'failed';
}

// Signature notifikasi = SHA512(order_id + status_code + gross_amount + server_key).
export function isValidNotificationSignature(notification) {
  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signature } = notification;
  if (!orderId || !statusCode || !grossAmount || !signature) return false;

  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${getServerKey()}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
