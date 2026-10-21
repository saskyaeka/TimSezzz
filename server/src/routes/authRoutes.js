const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const { authenticateToken } = require('../middlewares/authMiddleware');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nama, email, dan password wajib diisi.',
      });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email sudah terdaftar.',
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await UserModel.createUser({
      name,
      email,
      passwordHash,
      phone,
    });

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil.',
      data: newUser,
    });
  } catch (error) {
    console.error('Error register:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
      error: error.message,
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan kata sandi wajib diisi.',
      });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi salah.',
      });
    }

    // Pastikan akun aktif (jika ada kolom is_active)
    if (user.is_active !== undefined && !user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda dinonaktifkan.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi salah.',
      });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'staff',
    };

    // Gunakan fallback jika JWT_SECRET di .env kosong
    const secretKey = process.env.JWT_SECRET || 'secret_key_default_paolotory_2026';
    const token = jwt.sign(payload, secretKey, { expiresIn: '1d' });

    return res.status(200).json({
      success: true,
      message: 'Login berhasil.',
      token,
      user: payload,
    });
  } catch (error) {
    console.error('Error detail pada endpoint login:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat login.',
      error: error.message,
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userProfile = await UserModel.findById(req.user.id);
    return res.status(200).json({
      success: true,
      data: userProfile,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data profil.',
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;