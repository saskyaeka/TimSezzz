function errorHandler(err, req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Terjadi kesalahan pada server',
  });
}

module.exports = { errorHandler };
