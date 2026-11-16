const db = require('../../config/db');
const HttpError = require('../../utils/httpError');

const generateId = (prefix) => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${datePart}-${rand}`;
};

// 1. Daftar Bahan & Status ROP
async function getAllIngredients() {
  const { rows } = await db.query(
    `SELECT id, name, unit, stock, rop, price,
            (stock <= rop) AS needs_reorder
     FROM ingredients
     ORDER BY name ASC`
  );
  return rows;
}

// 2. Buat Bahan Baru
async function insertIngredient({ id, name, unit, price, stock = 0, rop = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO ingredients (id, name, unit, stock, rop, price)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, name, unit, stock, rop, price]
  );
  return rows[0];
}

// 3. Update Master Bahan (Stok tidak diubah di sini)
async function patchIngredient(id, fields) {
  const allowed = ['name', 'unit', 'rop', 'price'];
  const updates = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }

  if (updates.length === 0) {
    throw new HttpError(400, 'Tidak ada field valid yang diubah.');
  }

  values.push(id);
  const { rows } = await db.query(
    `UPDATE ingredients SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!rows[0]) throw new HttpError(404, 'Bahan baku tidak ditemukan.');
  return rows[0];
}

// 4. Baca Resep & BOM
async function fetchRecipe() {
  const recipeRes = await db.query(`SELECT * FROM recipes LIMIT 1`);
  const itemsRes = await db.query(
    `SELECT ri.ingredient_id AS "ingredientId", i.name, i.unit, i.price, ri.quantity
     FROM recipe_items ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     ORDER BY i.name ASC`
  );
  return {
    ...(recipeRes.rows[0] || { yield: 1, opex: 0 }),
    items: itemsRes.rows,
  };
}

// 5. Update Resep & BOM (Transaksional + Audit Log)
async function saveRecipe({ yieldQty, opex, items, actorEmail }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO recipes (id, yield, opex)
       VALUES ('default', $1, $2)
       ON CONFLICT (id) DO UPDATE SET yield = EXCLUDED.yield, opex = EXCLUDED.opex`,
      [yieldQty, opex]
    );

    await client.query(`DELETE FROM recipe_items`);
    for (const item of items) {
      await client.query(
        `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity)
         VALUES ('default', $1, $2)`,
        [item.ingredientId, item.quantity]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (actor_email, action, details)
       VALUES ($1, 'UPDATE_RECIPE', $2)`,
      [actorEmail, JSON.stringify({ yield: yieldQty, opex, itemCount: items.length })]
    );

    await client.query('COMMIT');
    return await fetchRecipe();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 6. Daftar Batch Cold Storage
async function getAllBatches() {
  const { rows } = await db.query(
    `SELECT id, made_date, exp_date, qty, left_qty,
            COALESCE(reserved_qty, 0) AS reserved_qty,
            (left_qty - COALESCE(reserved_qty, 0)) AS available_qty
     FROM batches
     ORDER BY exp_date ASC, made_date ASC`
  );
  return rows;
}

// 7. Buku Besar Mutasi Bahan
async function getMovements({ limit = 50, offset = 0 }) {
  const { rows } = await db.query(
    `SELECT m.*, i.name AS ingredient_name, i.unit
     FROM ingredient_movements m
     JOIN ingredients i ON i.id = m.ingredient_id
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

// 8. Purchase Orders (List, Create, Receive)
async function getPurchaseOrders({ limit = 50, offset = 0 }) {
  const { rows } = await db.query(
    `SELECT po.*, i.name AS ingredient_name, i.unit
     FROM purchase_orders po
     JOIN ingredients i ON i.id = po.ingredient_id
     ORDER BY po.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function insertPurchaseOrder({ ingredientId, quantity, note, actorEmail }) {
  const id = generateId('PO');
  const { rows } = await db.query(
    `INSERT INTO purchase_orders (id, ingredient_id, quantity, note, status, created_by)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING *`,
    [id, ingredientId, quantity, note || null, actorEmail]
  );
  return rows[0];
}

async function receivePurchaseOrderTx({ orderId, actorEmail }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const po = poRes.rows[0];
    if (!po) throw new HttpError(404, 'Purchase order tidak ditemukan.');
    if (po.status === 'received') {
      throw new HttpError(409, 'Purchase order sudah pernah diterima.');
    }

    await client.query(
      `UPDATE ingredients SET stock = stock + $1 WHERE id = $2`,
      [po.quantity, po.ingredient_id]
    );

    const updatedPo = await client.query(
      `UPDATE purchase_orders
       SET status = 'received', received_at = NOW(), received_by = $1
       WHERE id = $2 RETURNING *`,
      [actorEmail, orderId]
    );

    await client.query(
      `INSERT INTO ingredient_movements (ingredient_id, type, quantity, reference_id, note, created_by)
       VALUES ($1, 'PO_RECEIVE', $2, $3, $4, $5)`,
      [po.ingredient_id, po.quantity, orderId, po.note, actorEmail]
    );

    await client.query('COMMIT');
    return updatedPo.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 9. Produksi Otomatis / Manual (Potong Stok Bahan + Buat Batch + Hitung HPP)
async function executeProductionTx({ recipeCount, usageMode, manualItems, expDate, note, actorEmail }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const recipeRes = await client.query(`SELECT * FROM recipes LIMIT 1`);
    const recipe = recipeRes.rows[0];
    if (!recipe) throw new HttpError(400, 'Resep belum dikonfigurasi.');

    const bomRes = await client.query(`SELECT ingredient_id, quantity FROM recipe_items`);
    const usageMap = {};

    if (usageMode === 'manual') {
      Object.assign(usageMap, manualItems);
    } else {
      for (const row of bomRes.rows) {
        usageMap[row.ingredient_id] = Number(row.quantity) * recipeCount;
      }
    }

    const ingredientIds = Object.keys(usageMap);
    if (ingredientIds.length === 0) {
      throw new HttpError(400, 'Daftar bahan produksi kosong.');
    }

    // Lock semua baris bahan yang dipakai
    const ingRes = await client.query(
      `SELECT id, name, stock, price FROM ingredients WHERE id = ANY($1) FOR UPDATE`,
      [ingredientIds]
    );
    const ingMap = Object.fromEntries(ingRes.rows.map((r) => [r.id, r]));

    let totalIngredientCost = 0;
    const usedDetails = [];

    for (const ingId of ingredientIds) {
      const ing = ingMap[ingId];
      const needed = Number(usageMap[ingId]);
      if (!ing) throw new HttpError(404, `Bahan '${ingId}' tidak ditemukan.`);
      if (Number(ing.stock) < needed) {
        throw new HttpError(400, `Stok ${ing.name} tidak mencukupi (tersedia: ${ing.stock}, butuh: ${needed}).`);
      }

      const cost = needed * Number(ing.price);
      totalIngredientCost += cost;
      usedDetails.push({ ingredientId: ingId, name: ing.name, quantity: needed, cost });

      await client.query(
        `UPDATE ingredients SET stock = stock - $1 WHERE id = $2`,
        [needed, ingId]
      );
    }

    const producedQty = Number(recipe.yield) * recipeCount;
    const totalOpex = Number(recipe.opex || 0) * recipeCount;
    const totalHpp = totalIngredientCost + totalOpex;
    const hppPerUnit = producedQty > 0 ? totalHpp / producedQty : 0;

    const batchId = generateId('BPK');
    const prodId = generateId('PRD');
    const madeDate = new Date().toISOString().slice(0, 10);
    const finalExpDate =
      expDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
       VALUES ($1, $2, $3, $4, $4)`,
      [batchId, madeDate, finalExpDate, producedQty]
    );

    const prodRes = await client.query(
      `INSERT INTO productions (id, batch_id, recipe_count, usage_mode, produced_qty, total_hpp, hpp_per_unit, used_items, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        prodId,
        batchId,
        recipeCount,
        usageMode,
        producedQty,
        totalHpp,
        hppPerUnit,
        JSON.stringify(usedDetails),
        note || null,
        actorEmail,
      ]
    );

    for (const item of usedDetails) {
      await client.query(
        `INSERT INTO ingredient_movements (ingredient_id, type, quantity, reference_id, note, created_by)
         VALUES ($1, 'PRODUCTION_OUT', $2, $3, $4, $5)`,
        [item.ingredientId, -item.quantity, prodId, note || 'Produksi', actorEmail]
      );
    }

    await client.query('COMMIT');
    return prodRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 10. Daftar Riwayat Produksi
async function getProductions({ limit = 50, offset = 0 }) {
  const { rows } = await db.query(
    `SELECT * FROM productions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

// 11. Penyesuaian Stok Bahan di Luar Produksi
async function adjustIngredientTx({ ingredientId, quantity, reason, note, actorEmail }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const ingRes = await client.query(
      `SELECT id, name, stock FROM ingredients WHERE id = $1 FOR UPDATE`,
      [ingredientId]
    );
    const ing = ingRes.rows[0];
    if (!ing) throw new HttpError(404, 'Bahan baku tidak ditemukan.');
    if (Number(ing.stock) < quantity) {
      throw new HttpError(400, `Stok ${ing.name} tidak cukup untuk dikurangi sebesar ${quantity}.`);
    }

    const updated = await client.query(
      `UPDATE ingredients SET stock = stock - $1 WHERE id = $2 RETURNING *`,
      [quantity, ingredientId]
    );

    await client.query(
      `INSERT INTO ingredient_movements (ingredient_id, type, quantity, note, created_by)
       VALUES ($1, 'ADJUSTMENT', $2, $3, $4)`,
      [ingredientId, -quantity, `${reason}${note ? ': ' + note : ''}`, actorEmail]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getAllIngredients,
  insertIngredient,
  patchIngredient,
  fetchRecipe,
  saveRecipe,
  getAllBatches,
  getMovements,
  getPurchaseOrders,
  insertPurchaseOrder,
  receivePurchaseOrderTx,
  executeProductionTx,
  getProductions,
  adjustIngredientTx,
};