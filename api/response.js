export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(res, status, data) {
  res.status(status).json(data);
}

export function sendError(res, status, message) {
  sendJson(res, status, { ok: false, message });
}

export function sendOk(res, data = {}) {
  sendJson(res, 200, { ok: true, ...data });
}