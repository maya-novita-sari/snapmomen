const { MIN_USERNAME_LENGTH, MIN_PASSWORD_LENGTH } = require('./constants');

const validators = {
  username: (value) => {
    if (!value || typeof value !== 'string') return 'Username wajib diisi';
    const trimmed = value.trim();
    if (trimmed.length < MIN_USERNAME_LENGTH) return `Username minimal ${MIN_USERNAME_LENGTH} karakter`;
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Username hanya boleh huruf, angka, underscore';
    return null;
  },

  email: (value) => {
    if (!value || typeof value !== 'string') return 'Email wajib diisi';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Format email tidak valid';
    return null;
  },

  password: (value) => {
    if (!value || typeof value !== 'string') return 'Password wajib diisi';
    if (value.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter`;
    return null;
  },

  oneOf: (value, allowed, fieldName) => {
    if (!allowed.includes(value)) return `${fieldName} harus salah satu dari: ${allowed.join(', ')}`;
    return null;
  }
};

function validate(data, schema) {
  for (const [field, rules] of Object.entries(schema)) {
    for (const rule of rules) {
      const error = rule(data[field]);
      if (error) return { field, message: error };
    }
  }
  return null;
}

module.exports = { validators, validate };