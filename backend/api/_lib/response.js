function sendSuccess(res, data, status = 200) {
  return res.status(status).json(data);
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

const badRequest       = (res, msg) => sendError(res, 400, 'BAD_REQUEST', msg);
const unauthorized     = (res, msg = 'Unauthorized') => sendError(res, 401, 'UNAUTHORIZED', msg);
const forbidden        = (res, msg = 'Forbidden') => sendError(res, 403, 'FORBIDDEN', msg);
const notFound         = (res, msg = 'Not found') => sendError(res, 404, 'NOT_FOUND', msg);
const methodNotAllowed = (res) => sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
const serverError      = (res, err) => {
  console.error('Server error:', err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan server');
};

module.exports = {
  sendSuccess,
  sendError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  methodNotAllowed,
  serverError
};