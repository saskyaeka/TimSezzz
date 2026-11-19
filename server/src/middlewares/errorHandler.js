function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Ukuran request terlalu besar.' });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ success: false, message: 'Format JSON tidak valid.' });
  }
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (error.code === '23505') {
    return res.status(409).json({ success: false, message: 'Data sudah terdaftar.' });
  }
  if (['23503', '23514', '22P02', '22001', '22003'].includes(error.code)) {
    return res.status(400).json({ success: false, message: 'Data tidak sesuai dengan relasi atau format yang diminta.' });
  }
  console.error('Kesalahan request tidak tertangani:', error);
  return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
}

module.exports = { errorHandler };
