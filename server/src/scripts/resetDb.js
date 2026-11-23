const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function runSqlFile(client, filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File SQL tidak ditemukan: ${fullPath}`);
  }
  const sql = fs.readFileSync(fullPath, 'utf8');
  await client.query(sql);
}

async function reset() {
  console.log('Memulai pembersihan seluruh data database PostgreSQL...');

  const ownerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || 'owner@paolotory.id').trim().toLowerCase();
  const ownerName = (process.env.BOOTSTRAP_OWNER_NAME || 'Pemilik Usaha').trim();
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || 'OwnerPaolotory123';

  await db.transaction(async (client) => {
    // 1. Pastikan skema tabel sudah ada
    console.log('1. Memastikan skema database siap...');
    await runSqlFile(client, '../../../docs/database_scheme.sql');
    await runSqlFile(client, '../db/operations_schema.sql');

    // 2. Kosongkan semua data transaksi dan operasional
    console.log('2. Mengosongkan data transaksi, shift, pesanan, retur, pengiriman, dan stok...');
    await client.query(`
      TRUNCATE TABLE
        pos_sale_items,
        pos_sales,
        pos_shifts,
        pos_spoilage,
        manifest_batch_allocations,
        orders,
        claims,
        manifests,
        partner_sales,
        partner_inventory_movements,
        partners,
        production_run_items,
        production_runs,
        batches,
        inventory_movements,
        purchase_orders,
        bill_of_materials,
        recipe_items,
        recipes,
        ingredients,
        assets,
        audit_logs
      CASCADE;
    `);

    // 3. Bersihkan users, sisakan HANYA satu akun owner
    console.log('3. Membersihkan seluruh akun pengguna...');
    await client.query('DELETE FROM users');

    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    await client.query(
      `INSERT INTO users (email, name, role, password_hash, status, partner_id)
       VALUES ($1, $2, 'owner', $3, 'aktif', NULL)`,
      [ownerEmail, ownerName, passwordHash]
    );
    console.log(`✓ Akun owner aktif disiapkan: ${ownerEmail}`);

    // 4. Pastikan pengaturan bisnis default tersedia
    console.log('4. Menyetel konfigurasi harga dan operasional awal...');
    await client.query(`
      INSERT INTO business_settings (key, numeric_value)
      VALUES
        ('partner_price', 9000),
        ('central_price', 12000),
        ('production_yield', 60),
        ('production_opex', 45000)
      ON CONFLICT (key) DO UPDATE SET numeric_value = EXCLUDED.numeric_value;
    `);

    // 5. Catat log awal
    await client.query(
      `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, details)
       VALUES ($1, 'system.reset', 'database', 'paolotory_db', $2)`,
      [ownerEmail, JSON.stringify({ message: 'Database reset untuk pengujian mandiri' })]
    );
  });

  console.log('\n=========================================');
  console.log('PEMBERSIHAN SELESAI!');
  console.log('Seluruh data transaksi dan entitas telah dikosongkan.');
  console.log(`Login Owner yang tersisa:`);
  console.log(`- Email    : ${ownerEmail}`);
  console.log(`- Password : ${ownerPassword}`);
  console.log('=========================================\n');
}

reset()
  .catch((err) => {
    console.error('Pembersihan database gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
