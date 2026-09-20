const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('./response');
const { ROLES, JWT_EXPIRY } = require('./constants');

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = verifyToken(req);
    if (!user) return unauthorized(res, 'Token tidak valid atau kadaluarsa');
    req.user = user;
    return handler(req, res);
  };
}

function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    if (req.user.role !== ROLES.ADMIN) return forbidden(res, 'Akses khusus admin');
    return handler(req, res);
  });
}

module.exports = { generateToken, requireAuth, requireAdmin };