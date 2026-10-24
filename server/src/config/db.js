const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  database: process.env.DB_NAME,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database PostgreSQL gagal terhubung:', err.message);
  } else {
    console.log('Database PostgreSQL terhubung pada:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};