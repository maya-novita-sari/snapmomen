const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl                    : { rejectUnauthorized: false },
  max                    : 10,
  idleTimeoutMillis      : 30000,
  connectionTimeoutMillis: 5000
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) console.warn(`Slow query (${duration}ms):`, text);
    return result;
  } catch (err) {
    console.error('Query error:', { text, err: err.message });
    throw err;
  }
}

module.exports = { query, pool };