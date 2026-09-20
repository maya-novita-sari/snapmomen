function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(200).end();
    return true;
  }
  setCors(res);
  return false;
}

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
  setCors,
  handlePreflight,
  sendSuccess,
  sendError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  methodNotAllowed,
  serverError
};