const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  validateLoginInput,
  validateRegistrationInput,
} = require('../src/utils/authValidation');

test('email dinormalisasi tanpa mengubah kapitalisasi kata sandi', () => {
  assert.equal(normalizeEmail('  User@Example.com '), 'user@example.com');
  assert.equal(validateLoginInput({ email: 'user@example.com', password: 'PaSS1234' }), null);
});

test('login menolak email atau kata sandi yang kosong', () => {
  assert.equal(validateLoginInput({ email: '', password: 'PaSS1234' }), 'Email dan kata sandi wajib diisi.');
  assert.equal(validateLoginInput({ email: 'user@example.com', password: '' }), 'Email dan kata sandi wajib diisi.');
});

test('registrasi menerima input sesuai aturan client', () => {
  assert.equal(
    validateRegistrationInput({ name: 'Rina Wulandari', email: 'RINA@example.com', password: 'Paolotory123' }),
    null
  );
});

test('registrasi menolak nama, email, dan kata sandi yang tidak valid', () => {
  assert.equal(
    validateRegistrationInput({ name: 'A', email: 'rina@example.com', password: 'Paolotory123' }),
    'Nama harus berisi 2 sampai 100 karakter.'
  );
  assert.equal(
    validateRegistrationInput({ name: 'Rina Wulandari', email: 'bukan-email', password: 'Paolotory123' }),
    'Format email tidak valid.'
  );
  assert.equal(
    validateRegistrationInput({ name: 'Rina Wulandari', email: 'rina@example.com', password: 'abc12' }),
    'Kata sandi minimal 8 karakter.'
  );
  assert.equal(
    validateRegistrationInput({ name: 'Rina Wulandari', email: 'rina@example.com', password: 'passwordonly' }),
    'Kata sandi harus mengandung huruf dan angka.'
  );
});

test('registrasi menolak kata sandi yang melampaui batas bcrypt', () => {
  const password = `A1${'x'.repeat(71)}`;
  assert.equal(Buffer.byteLength(password), 73);
  assert.equal(
    validateRegistrationInput({ name: 'Rina Wulandari', email: 'rina@example.com', password }),
    'Kata sandi tidak boleh lebih dari 72 byte.'
  );
});
