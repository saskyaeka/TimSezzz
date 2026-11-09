const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validateLoginInput({ email, password } = {}) {
  if (!normalizeEmail(email) || typeof password !== 'string' || password.length === 0) {
    return 'Email dan kata sandi wajib diisi.';
  }
  if (normalizeEmail(email).length > 100 || !EMAIL_PATTERN.test(normalizeEmail(email))) {
    return 'Format email tidak valid.';
  }
  return null;
}

function validateRegistrationInput({ name, email, password } = {}) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return 'Nama harus berisi 2 sampai 100 karakter.';
  }
  if (!normalizeEmail(email) || normalizeEmail(email).length > 100 || !EMAIL_PATTERN.test(normalizeEmail(email))) {
    return 'Format email tidak valid.';
  }
  if (typeof password !== 'string' || password.length < 8) {
    return 'Kata sandi minimal 8 karakter.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Kata sandi harus mengandung huruf dan angka.';
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Kata sandi tidak boleh lebih dari 72 byte.';
  }
  return null;
}

module.exports = { normalizeEmail, validateLoginInput, validateRegistrationInput };
