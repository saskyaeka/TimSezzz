const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');

async function authenticateToken(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Token autentikasi wajib dikirim.' });
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string') {
      return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa.' });
    }

    const user = await UserModel.findPublicByEmail(payload.sub.toLowerCase());
    if (!user || user.status !== 'aktif') {
      return res.status(401).json({ success: false, message: 'Sesi tidak valid. Silakan masuk kembali.' });
    }

    req.user = {
      email: user.email,
      name: user.name,
      role: user.role,
      partnerId: user.partner_id,
    };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa.' });
    }
    console.error('Gagal memvalidasi sesi pengguna:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
}

module.exports = { authenticateToken };
