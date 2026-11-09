const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcrypt');
const db = require('../config/db');

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_OWNER_NAME?.trim();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_OWNER_EMAIL harus diatur dengan email yang valid.');
  }
  if (!name || name.length < 2 || name.length > 100) {
    throw new Error('BOOTSTRAP_OWNER_NAME harus berisi 2-100 karakter.');
  }
  if (typeof password !== 'string' || password.length < 12 ||
      !/[A-Za-z]/.test(password) || !/\d/.test(password) ||
      Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('BOOTSTRAP_OWNER_PASSWORD harus minimal 12 karakter, mengandung huruf dan angka, serta maksimal 72 byte.');
  }

  await db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['paolotory-bootstrap-owner']);
    const { rows } = await client.query(
      `SELECT email FROM users WHERE role = 'owner' LIMIT 1 FOR UPDATE`
    );
    if (rows[0]) {
      throw new Error('Akun owner sudah tersedia; bootstrap dibatalkan tanpa mengubah akun.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (email, name, role, password_hash, status, partner_id)
       VALUES ($1, $2, 'owner', $3, 'aktif', NULL)`,
      [email, name, passwordHash]
    );
  });
  console.log(`Akun owner berhasil dibuat: ${email}`);
}

main()
  .catch((error) => {
    console.error('Gagal membuat akun owner:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
