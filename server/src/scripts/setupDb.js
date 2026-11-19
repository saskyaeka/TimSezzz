const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/db');

async function runSqlFile(client, filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File SQL tidak ditemukan: ${fullPath}`);
  }
  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`Menjalankan: ${path.basename(fullPath)}...`);
  await client.query(sql);
}

async function main() {
  console.log('Memulai inisialisasi skema database PostgreSQL...');

  await db.transaction(async (client) => {
    // 1. Skema dasar (tabel utama)
    await runSqlFile(client, '../../../docs/database_scheme.sql');

    // 2. Skema operasional (kolom tambahan, tabel transaksi, audit, BOM, dll.)
    await runSqlFile(client, '../db/operations_schema.sql');
  });

  console.log('Inisialisasi skema database selesai dengan sukses.');
}

main()
  .catch((err) => {
    console.error('Inisialisasi database gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
