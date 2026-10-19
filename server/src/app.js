const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware Keamanan & Parsing
app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true })); // Port default Vite client
app.use(express.json());
app.use(morgan('dev'));

// Routing API
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend Paolotory aktif' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Paolotory aktif di http://localhost:${PORT}`);
});

// Tangani jika port sedang dipakai oleh aplikasi lain
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} sudah digunakan! Ubah PORT di .env atau matikan aplikasi yang memakai port tersebut.`);
  } else {
    console.error('❌ Gagal menjalankan server:', err.message);
  }
});