import { neon } from '@neondatabase/serverless';

// Tagged-template query function, e.g. sql`SELECT * FROM users WHERE id = ${id}`
export const sql = neon(process.env.DATABASE_URL);
