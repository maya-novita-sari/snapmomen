import nodemailer from 'nodemailer';
import { requireAdmin } from './_lib/auth-middleware.js';
import { handlePreflight, sendOk, sendError } from './_lib/response.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const MAX_IMAGE_DATA_CHARS = 1500000;
const MAX_VIDEO_DATA_CHARS = 3000000;
const MAX_EMAIL_LENGTH     = 254;
const EMAIL_PATTERN        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_URL_PATTERN     = /^data:([\w/+.-]+)(?:;[^,;]+)*;base64,([A-Za-z0-9+/=]+)$/;
const IMAGE_MIME_TYPES     = ['image/jpeg', 'image/png'];
const VIDEO_MIME_TYPES     = ['video/webm', 'video/mp4'];

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method tidak diizinkan.');
  if (!requireAdmin(req, res)) return;

  const { email, image_data, video_data } = req.body || {};
  const input = validateInput(email, image_data, video_data);
  if (input.error) return sendError(res, 400, input.error);

  const credentials = readMailCredentials();
  if (!credentials) return sendError(res, 500, 'Layanan email belum dikonfigurasi di server.');

  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: credentials });
    const info = await transporter.sendMail(buildMailMessage(credentials.user, input));
    console.log('send-email result:', { accepted: info.accepted, rejected: info.rejected, response: info.response });
    if (!info.accepted?.length) return sendError(res, 502, 'Email ditolak oleh server pengirim. Cek alamat email tujuan.');
    return sendOk(res);
  } catch (err) {
    console.error('send-email error:', err);
    return sendError(res, 500, 'Gagal mengirim email. Coba lagi sebentar lagi.');
  }
}

function readMailCredentials() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  return user && pass ? { user, pass } : null;
}

function parseDataUrl(dataUrl, allowedMimeTypes, maxChars) {
  if (typeof dataUrl !== 'string' || dataUrl.length > maxChars) return null;
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match || !allowedMimeTypes.includes(match[1])) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function validateInput(email, imageData, videoData) {
  const cleanEmail = String(email || '').trim();
  if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > MAX_EMAIL_LENGTH) {
    return { error: 'Alamat email tidak valid.' };
  }
  const image = parseDataUrl(imageData, IMAGE_MIME_TYPES, MAX_IMAGE_DATA_CHARS);
  if (!image) return { error: 'Data foto tidak valid.' };

  const video = videoData ? parseDataUrl(videoData, VIDEO_MIME_TYPES, MAX_VIDEO_DATA_CHARS) : null;
  if (videoData && !video) return { error: 'Data video tidak valid.' };

  return { email: cleanEmail, image, video };
}

function fileExtension(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'video/mp4') return 'mp4';
  return mimeType === 'video/webm' ? 'webm' : 'jpg';
}

function buildAttachment(baseName, media) {
  return {
    filename: `${baseName}.${fileExtension(media.mimeType)}`,
    content: media.buffer,
    contentType: media.mimeType,
  };
}

export function buildMailMessage(senderAddress, { email, image, video }) {
  const attachments = [buildAttachment('snapmomen-foto', image)];
  if (video) attachments.push(buildAttachment('snapmomen-video', video));

  return {
    from: `Snapmomen <${senderAddress}>`,
    to: email,
    subject: 'Foto dan video Snapmomen kamu sudah siap',
    text: 'Terima kasih sudah menggunakan Snapmomen. Foto dan video kamu ada di lampiran email ini.',
    html: '<p>Halo!</p><p>Terima kasih sudah menggunakan <b>Snapmomen</b>. Foto dan video kamu ada di lampiran email ini.</p><p>Sampai jumpa di momen berikutnya.</p>',
    attachments,
  };
}
