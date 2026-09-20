module.exports = {
  JWT_EXPIRY: '7d',
  BCRYPT_ROUNDS: 10,

  MIN_USERNAME_LENGTH: 3,
  MIN_PASSWORD_LENGTH: 4,

  CODE_PREFIX: 'SNAP-',
  CODE_LENGTH: 6,
  MIN_CODES_PER_REQUEST: 1,
  MAX_CODES_PER_REQUEST: 500,
  MAX_DURATION_DAYS: 3650,

  MAX_QUERY_LIMIT: 500,
  PHOTO_EXPIRY_DAYS: 3,

  ROLES: {
    ADMIN: 'admin',
    CUSTOMER: 'customer'
  },

  FRAME_TYPES: {
    FREE: 'free',
    PREMIUM: 'premium'
  },

  FRAME_SIZES: {
    SMALL: '5x15',
    LARGE: '10x15'
  },

  CODE_STATUS: {
    ACTIVE: 'active',
    USED: 'used',
    EXPIRED: 'expired'
  }
};