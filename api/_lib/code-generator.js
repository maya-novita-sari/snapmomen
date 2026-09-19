const { CODE_PREFIX, CODE_LENGTH } = require('./constants');
const { query } = require('./db');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const exists = await query('SELECT id FROM premium_codes WHERE code = $1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new Error('Gagal generate kode unik setelah 10 percobaan');
}

module.exports = { generateCode, generateUniqueCode };