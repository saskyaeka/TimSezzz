const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());

// Pendaftaran Router
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server backend Paolotory berjalan normal.' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server aktif di http://localhost:${PORT}`);
});

