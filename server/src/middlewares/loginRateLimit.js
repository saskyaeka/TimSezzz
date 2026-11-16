const rateLimit = require('express-rate-limit');

function createLoginRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
    },
  });
}

module.exports = { createLoginRateLimiter };
