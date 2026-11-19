const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { validateJwtConfig } = require('./config/jwt');
validateJwtConfig();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const operationsRoutes = require('./routes/operationsRoutes');
const { errorHandler } = require('./middlewares/errorHandler');

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

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, () => {
  console.log(`Server aktif di http://localhost:${PORT}`);
});
