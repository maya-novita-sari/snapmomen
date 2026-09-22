import jwt from 'jsonwebtoken';
import { sendError } from './response.js';

const TOKEN_TTL = '7d';

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' ? token : null;
}

// Returns the decoded token payload, or null if missing/invalid. Never throws.
export function getAuthUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Sends a 401 and returns null when the request is not authenticated.
export function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    sendError(res, 401, 'Silakan login terlebih dahulu.');
    return null;
  }
  return user;
}

// Sends a 403 and returns null when the request is not an admin.
export function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    sendError(res, 403, 'Akses khusus admin.');
    return null;
  }
  return user;
}
