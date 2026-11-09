const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const {
  normalizeEmail,
  validateLoginInput,
  validateRegistrationInput,
} = require('../utils/authValidation');

const publicUser = (user) => ({
  email: user.email,
  name: user.name,
  role: user.role,
  partnerId: user.partner_id,
});

async function register(req, res) {
  const input = req.body || {};
  const validationError = validateRegistrationInput(input);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const email = normalizeEmail(input.email);
  try {
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await UserModel.createPendingPartner({
      name: input.name.trim(),
      email,
      passwordHash,
    });

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran diterima. Akun menunggu persetujuan dan penautan gerai oleh pemilik.',
      data: { user: publicUser(user) },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }
    console.error('Gagal mendaftarkan akun:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
}

async function login(req, res) {
  const input = req.body || {};
  const validationError = validateLoginInput(input);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  try {
    const user = await UserModel.findByEmail(normalizeEmail(input.email));
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Email atau kata sandi salah.' });
    }

    if (user.status !== 'aktif') {
      const message = user.status === 'pending'
        ? 'Akun menunggu persetujuan pemilik dan penautan ke gerai.'
        : 'Akun Anda tidak aktif. Hubungi pemilik usaha.';
      return res.status(403).json({ success: false, message });
    }

    const secret = process.env.JWT_SECRET;
    const token = jwt.sign(
      { sub: user.email },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d', algorithm: 'HS256' }
    );
    const profile = publicUser(user);

    return res.status(200).json({
      success: true,
      message: 'Login berhasil.',
      token,
      user: profile,
    });
  } catch (error) {
    console.error('Gagal memproses login:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
}

function getProfile(req, res) {
  return res.status(200).json({ success: true, data: { user: req.user } });
}

module.exports = { register, login, getProfile };
