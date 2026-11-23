const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function seed() {
  console.log('Memulai seeding data awal ke PostgreSQL...');

  await db.transaction(async (client) => {
    // 1. Seed Partners
    const partners = [
      ['p1', 'Rina Wulandari (Kedai Kopi)', 'Kedai kopi', 'Zona Selatan', '4821', 'Jl. Sudirman No. 12', 240, 196, 8],
      ['p2', 'Budi Santoso (Kantin Sekolah)', 'Kantin sekolah', 'Zona Pusat', '1175', 'Jl. Merdeka No. 4', 300, 262, 12],
      ['p3', 'Siti Aminah (Toko Oleh-oleh)', 'Toko oleh-oleh', 'Zona Pusat', '9034', 'Jl. Diponegoro No. 88', 180, 121, 18],
      ['p4', 'Dedi Prasetyo (Minimarket)', 'Minimarket lokal', 'Zona Selatan', '5560', 'Jl. Gatot Subroto No. 5', 150, 143, 2],
    ];

    for (const [id, name, type, zone, pin, address, sent, sold, returned] of partners) {
      await client.query(
        `INSERT INTO partners (id, name, type, zone, pin, address, sent, sold, returned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           zone = EXCLUDED.zone,
           pin = EXCLUDED.pin,
           address = EXCLUDED.address`,
        [id, name, type, zone, pin, address, sent, sold, returned]
      );
    }
    console.log('✓ Data partners berhasil di-seed.');

    // 2. Seed Users untuk setiap Role (termasuk owner)
    const users = [
      {
        email: 'owner@paolotory.id',
        name: 'Pemilik Usaha',
        role: 'owner',
        password: 'OwnerPaolotory123',
        partner_id: null,
      },
      {
        email: 'produksi@paolotory.id',
        name: 'Manajer Dapur',
        role: 'kitchen',
        password: 'Produksi123',
        partner_id: null,
      },
      {
        email: 'kasir@paolotory.id',
        name: 'Kasir Pusat',
        role: 'pos',
        password: 'Kasir12345',
        partner_id: null,
      },
      {
        email: 'kurir@paolotory.id',
        name: 'Kurir Distribusi',
        role: 'courier',
        password: 'Kurir12345',
        partner_id: null,
      },
      {
        email: 'mitra@paolotory.id',
        name: 'Rina Wulandari',
        role: 'partner',
        password: 'Mitra12345',
        partner_id: 'p1',
      },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);
      await client.query(
        `INSERT INTO users (email, name, role, password_hash, status, partner_id)
         VALUES ($1, $2, $3, $4, 'aktif', $5)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash,
           status = 'aktif',
           partner_id = EXCLUDED.partner_id`,
        [u.email, u.name, u.role, hash, u.partner_id]
      );
    }
    console.log('✓ Akun pengguna (owner, kitchen, pos, courier, partner) berhasil di-seed.');

    // 3. Seed Bahan Baku (Ingredients)
    const ingredients = [
      ['tepung', 'Tepung terigu', 'g', 42000, 18000, 12],
      ['gula', 'Gula pasir', 'g', 14000, 5000, 17],
      ['ragi', 'Ragi instan', 'g', 1600, 500, 90],
      ['ayam', 'Isian ayam kecap', 'g', 6500, 8000, 38],
      ['bumbu', 'Bumbu isian', 'g', 3200, 1000, 60],
      ['plastik', 'Plastik kemasan vakum', 'pcs', 520, 200, 350],
    ];

    for (const [id, name, unit, stock, rop, price] of ingredients) {
      await client.query(
        `INSERT INTO ingredients (id, name, unit, stock, rop, price)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           unit = EXCLUDED.unit,
           stock = EXCLUDED.stock,
           rop = EXCLUDED.rop,
           price = EXCLUDED.price`,
        [id, name, unit, stock, rop, price]
      );
    }
    console.log('✓ Data ingredients berhasil di-seed.');

    // 4. Seed Bill of Materials (BOM)
    const bomItems = [
      ['tepung', 6000],
      ['gula', 1200],
      ['ragi', 80],
      ['ayam', 4000],
      ['bumbu', 500],
      ['plastik', 60],
    ];

    for (const [ingId, qty] of bomItems) {
      await client.query(
        `INSERT INTO bill_of_materials (ingredient_id, quantity)
         VALUES ($1, $2)
         ON CONFLICT (ingredient_id) DO UPDATE SET
           quantity = EXCLUDED.quantity`,
        [ingId, qty]
      );
    }
    console.log('✓ Data bill of materials berhasil di-seed.');

    // 5. Seed Batches (Stok Cold Storage)
    const batches = [
      ['BPK-20261115-01', '2026-11-15', '2026-12-15', 120, 96],
      ['BPK-20261118-01', '2026-11-18', '2026-12-18', 180, 180],
    ];

    for (const [id, made, exp, qty, left] of batches) {
      await client.query(
        `INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           qty = EXCLUDED.qty,
           left_qty = EXCLUDED.left_qty`,
        [id, made, exp, qty, left]
      );
    }
    console.log('✓ Data batches berhasil di-seed.');

    // 6. Seed Assets
    const assets = [
      ['ast-01', 'Smart Steamer 4-Tier Alpha', 'Gerai Mitra p1', 'Baik'],
      ['ast-02', 'Smart Steamer 4-Tier Beta', 'Gerai Mitra p2', 'Baik'],
      ['ast-03', 'Smart Steamer Mini Gamma', 'Toko Pusat Flagship', 'Layak'],
      ['ast-04', 'Cooler Box 50L Logistik-1', 'Armada Kurir', 'Baik'],
    ];

    for (const [id, name, location, condition] of assets) {
      await client.query(
        `INSERT INTO assets (id, name, location, condition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           location = EXCLUDED.location,
           condition = EXCLUDED.condition`,
        [id, name, location, condition]
      );
    }
    console.log('✓ Data aset berhasil di-seed.');
  });

  console.log('Seluruh seeding data awal berhasil!');
}

seed()
  .catch((err) => {
    console.error('Seeding gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
