const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getJwtSecret,
  getJwtExpiresIn,
  validateJwtConfig,
} = require('../src/config/jwt');

const secret = 'a-valid-test-secret-that-is-long-enough';

test('konfigurasi JWT memakai masa berlaku default satu hari', () => {
  assert.equal(getJwtSecret({ JWT_SECRET: secret }), secret);
  assert.equal(getJwtExpiresIn({}), '1d');
  assert.doesNotThrow(() => validateJwtConfig({ JWT_SECRET: secret }));
});

test('konfigurasi JWT menolak secret yang kurang dari 32 byte', () => {
  assert.throws(
    () => validateJwtConfig({ JWT_SECRET: 'too-short' }),
    /JWT_SECRET.*32 byte/
  );
});

test('konfigurasi JWT menolak format masa berlaku yang tidak didukung', () => {
  assert.throws(
    () => validateJwtConfig({ JWT_SECRET: secret, JWT_EXPIRES_IN: 'not-a-duration' }),
    /JWT_EXPIRES_IN tidak valid/
  );
});

test('konfigurasi JWT menerima masa berlaku eksplisit yang didukung', () => {
  assert.equal(getJwtExpiresIn({ JWT_EXPIRES_IN: '12h' }), '12h');
  assert.doesNotThrow(() => validateJwtConfig({
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: '12h',
  }));
});
