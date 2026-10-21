import crypto from 'node:crypto';
import QRCode from 'qrcode';

const SANDBOX_BASE_URL = 'https://api-sandbox.doku.com';
const PRODUCTION_BASE_URL = 'https://api.doku.com';
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_REFRESH_MARGIN_MS = 60000;
const DEFAULT_POSTAL_CODE = '10110';
const QRIS_SERVICE_CODE = '47';
const QR_IMAGE_WIDTH_PX = 320;

const TOKEN_PATH = '/authorization/v1/access-token/b2b';
const GENERATE_PATH = '/snap-adapter/b2b/v1.0/qr/qr-mpm-generate';
const QUERY_PATH = '/snap-adapter/b2b/v1.0/qr/qr-mpm-query';
const EXPIRE_PATH = '/snap-adapter/b2b/v1.0/qr/qr-expire';

// Masa berlaku QR. Dipakai juga oleh server dan frontend untuk hitung mundur dan membuat QR baru.
export const QR_LIFETIME_MINUTES = 10;

let cachedToken = null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diatur di environment variable.`);
  return value;
}

function getBaseUrl() {
  return process.env.DOKU_IS_PRODUCTION === 'true' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

// Private key boleh ditulis satu baris dengan \n di environment variable Vercel.
function getPrivateKey() {
  return getRequiredEnv('DOKU_PRIVATE_KEY').replace(/\\n/g, '\n');
}

function formatTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function isSuccessResponse(data) {
  return String(data?.responseCode || '').startsWith('200');
}

async function postJson(path, headers, bodyText) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: bodyText,
      signal: controller.signal,
    });
    return await response.json();
  } finally {
    clearTimeout(timerId);
  }
}

// Token B2B. Ditandatangani RSA-SHA256 atas "clientId|timestamp" memakai private key kita.
async function requestAccessToken() {
  const clientId = getRequiredEnv('DOKU_CLIENT_ID');
  const timestamp = formatTimestamp(new Date());
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${clientId}|${timestamp}`)
    .sign(getPrivateKey(), 'base64');

  const data = await postJson(
    TOKEN_PATH,
    { 'X-CLIENT-KEY': clientId, 'X-TIMESTAMP': timestamp, 'X-SIGNATURE': signature },
    JSON.stringify({ grantType: 'client_credentials' }),
  );
  if (!isSuccessResponse(data) || !data.accessToken) {
    throw new Error(data?.responseMessage || 'DOKU menolak permintaan token.');
  }
  return { token: data.accessToken, expiresAtMs: Date.now() + Number(data.expiresIn || 0) * 1000 };
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) return cachedToken.token;
  cachedToken = await requestAccessToken();
  return cachedToken.token;
}

// Signature transaksi = Base64(HMAC-SHA512(secret, "POST:path:token:sha256Hex(body):timestamp")).
function buildTransactionSignature({ path, token, bodyText, timestamp }) {
  const stringToSign = `POST:${path}:${token}:${sha256Hex(bodyText)}:${timestamp}`;
  return crypto.createHmac('sha512', getRequiredEnv('DOKU_SECRET_KEY')).update(stringToSign).digest('base64');
}

function generateExternalId() {
  return `${Date.now()}${crypto.randomInt(100, 1000)}`;
}

async function sendSignedRequest(path, body) {
  const token = await getAccessToken();
  const bodyText = JSON.stringify(body);
  const timestamp = formatTimestamp(new Date());
  return postJson(
    path,
    {
      Authorization: `Bearer ${token}`,
      'X-PARTNER-ID': getRequiredEnv('DOKU_CLIENT_ID'),
      'X-EXTERNAL-ID': generateExternalId(),
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': buildTransactionSignature({ path, token, bodyText, timestamp }),
      'CHANNEL-ID': 'H2H',
    },
    bodyText,
  );
}

// Kalau token ditolak (misalnya kedaluwarsa lebih cepat), minta token baru sekali lalu ulangi.
async function requestDoku(path, body) {
  const data = await sendSignedRequest(path, body);
  if (!String(data?.responseCode || '').startsWith('401')) return data;
  cachedToken = null;
  return sendSignedRequest(path, body);
}

function formatAmount(amount) {
  return { value: `${amount}.00`, currency: 'IDR' };
}

function buildValidityPeriod() {
  return formatTimestamp(new Date(Date.now() + QR_LIFETIME_MINUTES * 60 * 1000));
}

// Membuat QRIS dinamis. Nominal sudah tertanam di QR. DOKU hanya memberi teks QR, jadi kita gambar sendiri.
export async function createQrisCharge({ orderId, amount }) {
  const data = await requestDoku(GENERATE_PATH, {
    partnerReferenceNo: orderId,
    amount: formatAmount(amount),
    merchantId: getRequiredEnv('DOKU_MERCHANT_ID'),
    terminalId: getRequiredEnv('DOKU_TERMINAL_ID'),
    validityPeriod: buildValidityPeriod(),
    additionalInfo: { postalCode: process.env.DOKU_POSTAL_CODE || DEFAULT_POSTAL_CODE, feeType: '1' },
  });

  if (!isSuccessResponse(data) || !data.qrContent) {
    throw new Error(data?.responseMessage || 'DOKU menolak pembuatan QRIS.');
  }
  const qrUrl = await QRCode.toDataURL(data.qrContent, {
    errorCorrectionLevel: 'M', margin: 2, width: QR_IMAGE_WIDTH_PX,
  });
  return { transactionId: data.referenceNo || '', qrString: data.qrContent, qrUrl };
}

// Status transaksi QRIS (standar SNAP): 00 sukses, 01 s.d. 03 menunggu, 04 dan 05 batal, 06 gagal, 07 tidak ditemukan.
export function mapQrisStatus(latestTransactionStatus) {
  const code = String(latestTransactionStatus);
  if (code === '00') return 'paid';
  if (code === '04' || code === '05') return 'canceled';
  if (code === '06') return 'failed';
  return 'pending';
}

function readPaidAmount(data) {
  const value = Number(data?.amount?.value);
  return Number.isFinite(value) ? Math.round(value) : null;
}

// Mengembalikan { status, transactionId, amount }, atau null kalau transaksi tidak ditemukan di DOKU.
export async function fetchPaymentStatus(payment) {
  const data = await requestDoku(QUERY_PATH, {
    originalReferenceNo: payment.transaction_id || '',
    originalPartnerReferenceNo: payment.order_id,
    serviceCode: QRIS_SERVICE_CODE,
    merchantId: getRequiredEnv('DOKU_MERCHANT_ID'),
  });

  if (String(data?.responseCode || '').startsWith('404') || String(data?.latestTransactionStatus) === '07') return null;
  if (!isSuccessResponse(data)) throw new Error(data?.responseMessage || 'DOKU menolak pengecekan status.');
  return {
    status: mapQrisStatus(data.latestTransactionStatus),
    transactionId: data.originalReferenceNo || payment.transaction_id || '',
    amount: readPaidAmount(data),
  };
}

// Membatalkan QR supaya tidak bisa dibayar lagi. Mengembalikan true kalau DOKU mengonfirmasi.
export async function cancelTransaction({ orderId, transactionId }) {
  const data = await requestDoku(EXPIRE_PATH, {
    partnerReferenceNo: orderId,
    referenceNo: transactionId || '',
    merchantId: getRequiredEnv('DOKU_MERCHANT_ID'),
    reason: 'QR diganti atau ditinggalkan',
  });
  return isSuccessResponse(data);
}
