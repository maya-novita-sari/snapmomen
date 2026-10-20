import { handlePreflight, sendError } from './_lib/response.js';
import createHandler from './_lib/payment/create.js';
import statusHandler from './_lib/payment/status.js';
import webhookHandler from './_lib/payment/webhook.js';
import cancelHandler from './_lib/payment/cancel.js';
import consumeHandler from './_lib/payment/consume.js';

// Satu function untuk semua endpoint pembayaran, supaya jumlah function di Vercel tetap sedikit.
// URL tetap /api/payment/create, /status, /webhook, /cancel, /consume lewat rewrite di vercel.json.
const ACTION_HANDLERS = {
  create: createHandler,
  status: statusHandler,
  webhook: webhookHandler,
  cancel: cancelHandler,
  consume: consumeHandler,
};

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const action = String((req.query && req.query.action) || '');
  const actionHandler = Object.hasOwn(ACTION_HANDLERS, action) ? ACTION_HANDLERS[action] : null;
  if (!actionHandler) return sendError(res, 404, 'Endpoint pembayaran tidak ditemukan.');

  return actionHandler(req, res);
}
