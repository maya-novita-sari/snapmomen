const bcrypt = require('bcryptjs');
const { query } = require('../_lib/db');
const { generateToken } = require('../_lib/auth');
const { validators, validate } = require('../_lib/validator');
const { sendSuccess, badRequest } = require('../_lib/response');
const { withMethods } = require('../_lib/handler');
const { BCRYPT_ROUNDS } = require('../_lib/constants');

const schema = {
  username: [validators.username],
  email   : [validators.email],
  password: [validators.password]
};

module.exports = withMethods(['POST'], async (req, res) => {
  const { username, email, password } = req.body;

  const validationError = validate({ username, email, password }, schema);
  if (validationError) return badRequest(res, validationError.message);

  const existing = await query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username.trim(), email.trim()]
  );
  if (existing.rows.length > 0) return badRequest(res, 'Username atau email sudah dipakai');

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result         = await query(
    `INSERT INTO users (username, email, password)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, role`,
    [username.trim(), email.trim(), hashedPassword]
  );

  const user  = result.rows[0];
  const token = generateToken({ id: user.id, username: user.username, role: user.role });

  return sendSuccess(res, { token, user }, 201);
});