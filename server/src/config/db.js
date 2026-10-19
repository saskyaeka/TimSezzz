const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Jika production di cloud (seperti Neon/Supabase), aktifkan SSL:
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  console.log('✅ Berhasil terhubung ke database PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Terjadi kesalahan pada pool database:', err.message);
});

module.exports = pool;