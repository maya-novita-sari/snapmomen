const { query } = require('./_lib/db');
const { sendSuccess, serverError, methodNotAllowed } = require('./_lib/response');
const { CODE_STATUS } = require('./_lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res);

  try {
    const [codes, users, photos] = await Promise.all([
      query(
        `UPDATE premium_codes SET status = $1
         WHERE expires_at < NOW() AND status = $2
         RETURNING id`,
        [CODE_STATUS.EXPIRED, CODE_STATUS.USED]
      ),
      query(
        `UPDATE users SET premium_until = NULL
         WHERE premium_until IS NOT NULL AND premium_until < NOW()
         RETURNING id`
      ),
      query('DELETE FROM photos WHERE expires_at < NOW() RETURNING id')
    ]);

    return sendSuccess(res, {
      expiredCodes : codes.rowCount,
      expiredUsers : users.rowCount,
      deletedPhotos: photos.rowCount
    });
  } catch (err) {
    return serverError(res, err);
  }
};