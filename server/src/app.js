const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET wajib diatur dan memiliki minimal 32 karakter.');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const operationsRoutes = require('./routes/operationsRoutes');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  })
);
app.use(express.json({ limit: '16kb' }));

app.use('/api/auth', authRoutes);
app.use('/api', operationsRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', message: 'Server dan database berjalan normal.' });
  } catch (error) {
    console.error('Pemeriksaan kesehatan database gagal:', error);
    return res.status(503).json({ status: 'error', message: 'Database tidak dapat diakses.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
});

app.use((error, req, res, next) => {
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
});

const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, () => {
  console.log(`Server aktif di http://localhost:${PORT}`);
});
