const jwt = require('jsonwebtoken');

const DEFAULT_JWT_EXPIRES_IN = '1d';

function getJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET wajib diatur dan memiliki minimal 32 byte.');
  }
  return secret;
}

function getJwtExpiresIn(env = process.env) {
  return env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;
}

function validateJwtConfig(env = process.env) {
  const secret = getJwtSecret(env);
  const expiresIn = getJwtExpiresIn(env);

  try {
    jwt.sign(
      { sub: 'configuration-check' },
      secret,
      { expiresIn, algorithm: 'HS256' }
    );
  } catch (error) {
    throw new Error('JWT_EXPIRES_IN tidak valid.', { cause: error });
  }
}

module.exports = { getJwtSecret, getJwtExpiresIn, validateJwtConfig };