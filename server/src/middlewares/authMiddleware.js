const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <TOKEN>

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      message: 'Akses ditolak. Token otentikasi tidak ditemukan.'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        status: 'fail',
        message: 'Sesi kedaluwarsa atau token tidak valid.'
      });
    }
    req.user = user;
    next();
  });
};

// Middleware untuk membatasi endpoint berdasarkan role
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Anda tidak memiliki hak akses untuk tindakan ini.'
      });
    }
    next();
  };
};

module.exports = { authenticateToken, authorizeRoles };