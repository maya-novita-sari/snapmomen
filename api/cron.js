import { sql } from './_lib/db.js';
import { sendOk, sendError } from './_lib/response.js';

// Called once a day by Vercel Cron (see vercel.json). Protects against
// accidental public triggering by checking Vercel's cron secret header.
export default async function handler(req, res) {
  if (!isAuthorizedCronCall(req)) {
    return sendError(res, 401, 'Unauthorized.');
  }

  try {
    const deletedPhotos = await sql`DELETE FROM photos WHERE expires_at < NOW() RETURNING id`;
    const expiredCodes = await sql`
      UPDATE premium_codes SET status = 'expired'
      WHERE status = 'used' AND expires_at < NOW()
      RETURNING id
    `;
    const clearedPremium = await sql`
      UPDATE users SET premium_until = NULL
      WHERE premium_until IS NOT NULL AND premium_until < NOW()
      RETURNING id
    `;

    return sendOk(res, {
      deleted_photos: deletedPhotos.length,
      expired_codes: expiredCodes.length,
      cleared_premium_users: clearedPremium.length,
    });
  } catch (err) {
    console.error('cron error:', err);
    return sendError(res, 500, 'Gagal menjalankan cleanup.');
  }
}

function isAuthorizedCronCall(req) {
  if (process.env.NODE_ENV !== 'production') return true;
  const authHeader = req.headers.authorization || '';
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
