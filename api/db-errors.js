const UNDEFINED_COLUMN = '42703';
const UNDEFINED_TABLE  = '42P01';
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err) {
  return err?.code === UNIQUE_VIOLATION;
}

export function describeDbError(err, fallbackMessage) {
  if (err?.code === UNDEFINED_COLUMN || err?.code === UNDEFINED_TABLE) {
    return 'Database belum dimigrasi. Jalankan bagian MIGRASI di database/schema.sql.';
  }
  return fallbackMessage;
}