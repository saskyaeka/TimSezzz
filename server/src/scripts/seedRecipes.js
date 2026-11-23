const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/db');

const INGREDIENTS = [
  { id: 'tepung', name: 'Tepung Terigu Segitiga Biru', unit: 'g', stock: 80000, rop: 20000, price: 12 },
  { id: 'gula', name: 'Gula Pasir Kristal Putih', unit: 'g', stock: 25000, rop: 6000, price: 17 },
  { id: 'ragi', name: 'Ragi Roti Saf-Instant', unit: 'g', stock: 3000, rop: 800, price: 90 },
  { id: 'ayam', name: 'Daging Ayam Fillet Cincang', unit: 'g', stock: 30000, rop: 8000, price: 38 },
  { id: 'bumbu', name: 'Bumbu Racik Gurih Paolotory', unit: 'g', stock: 8000, rop: 2000, price: 60 },
  { id: 'cokelat', name: 'Pasta Cokelat Belgia Premium', unit: 'g', stock: 20000, rop: 5000, price: 65 },
  { id: 'keju', name: 'Keju Cheddar Olahan Parut', unit: 'g', stock: 15000, rop: 4000, price: 95 },
  { id: 'kacang_hijau', name: 'Pasta Kacang Hijau Manis', unit: 'g', stock: 20000, rop: 5000, price: 32 },
  { id: 'mentega', name: 'Mentega / Margarin Blue Band', unit: 'g', stock: 10000, rop: 2500, price: 40 },
  { id: 'susu', name: 'Susu Bubuk Full Cream', unit: 'g', stock: 6000, rop: 1500, price: 75 },
  { id: 'minyak', name: 'Minyak Nabati Murni', unit: 'g', stock: 12000, rop: 3000, price: 20 },
  { id: 'plastik', name: 'Plastik Kemasan Vakum Satuan', unit: 'pcs', stock: 1500, rop: 300, price: 350 },
];

const STANDARD_RECIPES = [
  {
    id: 'rcp-ayam',
    name: 'Bakpau Ayam Gurih (Standar)',
    yield: 60,
    opex: 45000,
    isActive: true,
    items: [
      { ingredientId: 'tepung', quantity: 6000 },
      { ingredientId: 'gula', quantity: 1200 },
      { ingredientId: 'ragi', quantity: 80 },
      { ingredientId: 'ayam', quantity: 4000 },
      { ingredientId: 'bumbu', quantity: 500 },
      { ingredientId: 'plastik', quantity: 60 },
    ],
  },
  {
    id: 'rcp-cokelat',
    name: 'Bakpau Cokelat Lumer Belgia',
    yield: 60,
    opex: 45000,
    isActive: false,
    items: [
      { ingredientId: 'tepung', quantity: 6000 },
      { ingredientId: 'gula', quantity: 1200 },
      { ingredientId: 'ragi', quantity: 80 },
      { ingredientId: 'cokelat', quantity: 3500 },
      { ingredientId: 'mentega', quantity: 400 },
      { ingredientId: 'plastik', quantity: 60 },
    ],
  },
  {
    id: 'rcp-keju',
    name: 'Bakpau Keju Manis Susu',
    yield: 60,
    opex: 45000,
    isActive: false,
    items: [
      { ingredientId: 'tepung', quantity: 6000 },
      { ingredientId: 'gula', quantity: 1000 },
      { ingredientId: 'ragi', quantity: 80 },
      { ingredientId: 'keju', quantity: 3000 },
      { ingredientId: 'susu', quantity: 500 },
      { ingredientId: 'plastik', quantity: 60 },
    ],
  },
  {
    id: 'rcp-kacang',
    name: 'Bakpau Kacang Hijau Tradisional',
    yield: 60,
    opex: 45000,
    isActive: false,
    items: [
      { ingredientId: 'tepung', quantity: 6000 },
      { ingredientId: 'gula', quantity: 1500 },
      { ingredientId: 'ragi', quantity: 80 },
      { ingredientId: 'kacang_hijau', quantity: 3600 },
      { ingredientId: 'minyak', quantity: 300 },
      { ingredientId: 'plastik', quantity: 60 },
    ],
  },
];

async function seedRecipes() {
  console.log('Menyiapkan skema resep dan menambahkan data ke database PostgreSQL...');

  await db.transaction(async (client) => {
    // 0. Pastikan tabel recipes dan recipe_items sudah ada
    await client.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        yield INTEGER NOT NULL DEFAULT 60 CHECK (yield > 0),
        opex NUMERIC(12, 2) NOT NULL DEFAULT 45000 CHECK (opex >= 0),
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recipe_items (
        id BIGSERIAL PRIMARY KEY,
        recipe_id VARCHAR(50) NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        ingredient_id VARCHAR(50) NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
        quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
        UNIQUE (recipe_id, ingredient_id)
      );
    `);

    // 1. Simpan bahan baku
    for (const ing of INGREDIENTS) {
      await client.query(
        `INSERT INTO ingredients (id, name, unit, stock, rop, price)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           unit = EXCLUDED.unit,
           stock = EXCLUDED.stock,
           rop = EXCLUDED.rop,
           price = EXCLUDED.price`,
        [ing.id, ing.name, ing.unit, ing.stock, ing.rop, ing.price]
      );

      // Catat mutasi awal jika belum ada
      const { rows: movCheck } = await client.query(
        `SELECT id FROM inventory_movements WHERE ingredient_id = $1 AND reason = 'stok_awal'`,
        [ing.id]
      );
      if (movCheck.length === 0) {
        const movId = `MOV-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
        await client.query(
          `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, note, created_by)
           VALUES ($1, $2, $3, 'stok_awal', 'Inisialisasi stok bahan baku resep', 'owner@paolotory.id')`,
          [movId, ing.id, ing.stock]
        );
      }
    }
    console.log(`✓ Berhasil menambahkan ${INGREDIENTS.length} bahan baku lengkap dengan stok dan harga.`);

    // 2. Simpan master recipes dan recipe_items
    for (const r of STANDARD_RECIPES) {
      await client.query(
        `INSERT INTO recipes (id, name, yield, opex, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           yield = EXCLUDED.yield,
           opex = EXCLUDED.opex,
           is_active = EXCLUDED.is_active,
           updated_at = CURRENT_TIMESTAMP`,
        [r.id, r.name, r.yield, r.opex, r.isActive]
      );

      await client.query('DELETE FROM recipe_items WHERE recipe_id = $1', [r.id]);
      for (const item of r.items) {
        await client.query(
          `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity)
           VALUES ($1, $2, $3)`,
          [r.id, item.ingredientId, item.quantity]
        );
      }
    }
    console.log(`✓ Berhasil menambahkan ${STANDARD_RECIPES.length} resep standar ke tabel recipes.`);

    // 3. Set resep aktif ke bill_of_materials
    const active = STANDARD_RECIPES.find((r) => r.isActive) || STANDARD_RECIPES[0];
    await client.query(
      `INSERT INTO business_settings (key, numeric_value)
       VALUES ('production_yield', $1), ('production_opex', $2)
       ON CONFLICT (key) DO UPDATE SET numeric_value = EXCLUDED.numeric_value`,
      [active.yield, active.opex]
    );

    await client.query('DELETE FROM bill_of_materials');
    for (const item of active.items) {
      await client.query(
        `INSERT INTO bill_of_materials (ingredient_id, quantity, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [item.ingredientId, item.quantity]
      );
    }
    console.log(`✓ Berhasil menyinkronkan resep aktif "${active.name}" ke bill_of_materials.`);

    // 4. Catat audit log
    await client.query(
      `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, details)
       VALUES ($1, 'recipe.seed', 'recipe', 'all', $2)`,
      ['owner@paolotory.id', JSON.stringify({ message: 'Seed resep multi-varian dan bahan baku' })]
    );
  });

  console.log('\n=========================================');
  console.log('SEED BERHASIL!');
  console.log('Bahan baku dan daftar resep siap di PostgreSQL.');
  console.log('=========================================\n');
}

seedRecipes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal seed resep:', err.message);
    process.exit(1);
  });
