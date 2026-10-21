const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel.js');

const register = async (req, res) => {
  try {
    const { name, email, password, role = 'mitra', phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Nama, email, dan password wajib diisi.'
      });
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        status: 'fail',
        message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.'
      });
    }

    // Cek role valid
    const roleId = await UserModel.findRoleIdByName(role);
    if (!roleId) {
      return res.status(400).json({
        status: 'fail',
        message: `Role '${role}' tidak valid. Role yang diizinkan: owner, kasir, mitra, pengantar.`
      });
    }

    // Enkripsi password menggunakan bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await UserModel.create({
      name,
      email,
      passwordHash,
      roleId,
      phone
    });

    return res.status(201).json({
      status: 'success',
      message: 'Registrasi berhasil.',
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: role
        }
      }
    });
  } catch (error) {
    console.error('Error saat registrasi:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan pada server saat registrasi.'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email dan password wajib diisi.'
      });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Email atau password salah.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: 'fail',
        message: 'Akun Anda sedang dinonaktifkan. Hubungi admin/owner.'
      });
    }

    // Verifikasi password hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'fail',
        message: 'Email atau password salah.'
      });
    }

    // Generate JWT Token
    const payload = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role_name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    });

    return res.status(200).json({
      status: 'success',
      message: 'Login berhasil.',
      data: {
        token,
        user: payload
      }
    });
  } catch (error) {
    console.error('Error saat login:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan pada server saat login.'
    });
  }
};

const getProfile = async (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
};

module.exports = { register, login, getProfile };