const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { date, decimal, enumValue, integer, pagination, text } = require('../../utils/operationsValidation');
const { ID, audit, availableCold, getAvailableBatches, getAllBatches, readSettings, setSetting } = require('./shared');

async function listIngredients(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT id, name, unit, stock, rop, price, (stock <= rop) AS needs_reorder
     FROM ingredients
     ORDER BY name ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { ingredients: rows } });
}

async function createIngredient(req, res) {
  const id = text(req.body?.id, 'ID bahan', { max: 50 }).toLowerCase();
  const name = text(req.body?.name, 'Nama bahan', { max: 100 });
  const unit = text(req.body?.unit, 'Satuan', { max: 10 });
  const price = decimal(req.body?.price, 'Harga bahan');
  const stock = req.body?.stock === undefined ? 0 : decimal(req.body.stock, 'Stok awal');
  const rop = req.body?.rop === undefined ? 0 : decimal(req.body.rop, 'Reorder point');

  try {
    const ingredient = await db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO ingredients (id, name, unit, stock, rop, price)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, unit, stock, rop, price`,
        [id, name, unit, stock, rop, price]
      );
      if (stock > 0) {
        await client.query(
          `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, note, created_by)
           VALUES ($1, $2, $3, 'stok_awal', 'Inisialisasi bahan baku', $4)`,
          [ID(), id, stock, req.user.email]
        );
      }
      await audit(client, req, 'ingredient.created', 'ingredient', id, { name, unit, stock, rop, price });
      return rows[0];
    });
    return res.status(201).json({ success: true, data: { ingredient } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'ID bahan sudah terdaftar.' });
    throw error;
  }
}

async function updateIngredient(req, res) {
  const ingredientId = text(req.params.ingredientId, 'ID bahan', { max: 50 });
  assert(req.body?.stock === undefined, 400, 'Stok bahan hanya dapat berubah melalui mutasi operasional.');

  const fields = [];
  const values = [ingredientId];
  const add = (col, val) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (req.body?.name !== undefined) add('name', text(req.body.name, 'Nama bahan', { max: 100 }));
  if (req.body?.unit !== undefined) add('unit', text(req.body.unit, 'Satuan', { max: 10 }));
  if (req.body?.rop !== undefined) add('rop', decimal(req.body.rop, 'Reorder point'));
  if (req.body?.price !== undefined) add('price', decimal(req.body.price, 'Harga bahan'));

  assert(fields.length > 0, 400, 'Tidak ada perubahan yang dikirim.');

  const ingredient = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE ingredients SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, name, unit, stock, rop, price`,
      values
    );
    assert(rows[0], 404, 'Bahan baku tidak ditemukan.');
    await audit(client, req, 'ingredient.updated', 'ingredient', ingredientId, { fields: Object.keys(req.body) });
    return rows[0];
  });

  return res.json({ success: true, data: { ingredient } });
}

async function getRecipe(req, res) {
  const settings = await readSettings(db);
  const { rows } = await db.query(
    `SELECT b.ingredient_id, i.name, i.unit, b.quantity, i.stock, i.price
     FROM bill_of_materials b
     JOIN ingredients i ON i.id = b.ingredient_id
     ORDER BY i.name ASC`
  );
  return res.json({
    success: true,
    data: {
      recipe: {
        yield: Number(settings.production_yield),
        opex: Number(settings.production_opex),
        items: rows,
      },
    },
  });
}

async function updateRecipe(req, res) {
  const yieldQty = integer(req.body?.yield, 'Hasil resep (yield)', { min: 1, max: 100000 });
  const opex = decimal(req.body?.opex ?? 0, 'Biaya operasional (opex)');
  assert(Array.isArray(req.body?.items) && req.body.items.length > 0, 400, 'Daftar bahan resep wajib diisi.');

  const seen = new Set();
  const items = req.body.items.map((item) => {
    const ingredientId = text(item?.ingredientId, 'ID bahan', { max: 50 });
    assert(!seen.has(ingredientId), 400, `Bahan ${ingredientId} dikirim lebih dari satu kali.`);
    seen.add(ingredientId);
    const quantity = decimal(item?.quantity, 'Takaran bahan');
    assert(quantity > 0, 400, 'Takaran bahan harus lebih dari nol.');
    return { ingredientId, quantity };
  });

  await db.transaction(async (client) => {
    const requestedIds = items.map((item) => item.ingredientId);
    const { rows: matched } = await client.query(
      'SELECT id FROM ingredients WHERE id = ANY($1::varchar[])',
      [requestedIds]
    );
    assert(matched.length === requestedIds.length, 400, 'Sebagian bahan resep tidak ditemukan.');

    await client.query('DELETE FROM bill_of_materials');

    for (const item of items) {
      await client.query(
        'INSERT INTO bill_of_materials (ingredient_id, quantity, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [item.ingredientId, item.quantity]
      );
    }

    await setSetting(client, req, 'production_yield', yieldQty);
    await setSetting(client, req, 'production_opex', opex);

    await audit(client, req, 'recipe.updated', 'recipe', 'default', { yield: yieldQty, opex, items });
  });

  return getRecipe(req, res);
}

async function listRecipes(req, res) {
  const { rows: recipeRows } = await db.query(
    `SELECT r.id, r.name, r.yield, r.opex, r.is_active, r.created_at, r.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'ingredientId', ri.ingredient_id,
                  'ingredientName', i.name,
                  'unit', i.unit,
                  'quantity', ri.quantity,
                  'stock', i.stock,
                  'price', i.price
                ) ORDER BY i.name ASC
              ) FILTER (WHERE ri.id IS NOT NULL),
              '[]'::json
            ) AS items
     FROM recipes r
     LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id
     GROUP BY r.id
     ORDER BY r.is_active DESC, r.created_at ASC`
  );
  return res.json({ success: true, data: { recipes: recipeRows } });
}

async function createRecipe(req, res) {
  const name = text(req.body?.name, 'Nama resep', { max: 150 });
  const yieldQty = integer(req.body?.yield, 'Hasil resep (yield)', { min: 1, max: 100000 });
  const opex = decimal(req.body?.opex ?? 0, 'Biaya operasional (opex)');
  assert(Array.isArray(req.body?.items) && req.body.items.length > 0, 400, 'Daftar bahan resep wajib diisi.');

  const seen = new Set();
  const items = req.body.items.map((item) => {
    const ingredientId = text(item?.ingredientId, 'ID bahan', { max: 50 });
    assert(!seen.has(ingredientId), 400, `Bahan ${ingredientId} dikirim lebih dari satu kali.`);
    seen.add(ingredientId);
    const quantity = decimal(item?.quantity, 'Takaran bahan');
    assert(quantity > 0, 400, 'Takaran bahan harus lebih dari nol.');
    return { ingredientId, quantity };
  });

  const recipe = await db.transaction(async (client) => {
    const requestedIds = items.map((item) => item.ingredientId);
    const { rows: matched } = await client.query(
      'SELECT id FROM ingredients WHERE id = ANY($1::varchar[])',
      [requestedIds]
    );
    assert(matched.length === requestedIds.length, 400, 'Sebagian bahan resep tidak ditemukan.');

    const id = `rcp-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
    const { rows: existingCount } = await client.query('SELECT COUNT(*)::int AS cnt FROM recipes');
    const makeActive = Boolean(req.body?.isActive) || existingCount[0].cnt === 0;

    if (makeActive) {
      await client.query('UPDATE recipes SET is_active = FALSE');
    }

    const { rows: rRows } = await client.query(
      `INSERT INTO recipes (id, name, yield, opex, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, yieldQty, opex, makeActive]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity)
         VALUES ($1, $2, $3)`,
        [id, item.ingredientId, item.quantity]
      );
    }

    if (makeActive) {
      await client.query('DELETE FROM bill_of_materials');
      for (const item of items) {
        await client.query(
          'INSERT INTO bill_of_materials (ingredient_id, quantity, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [item.ingredientId, item.quantity]
        );
      }
      await setSetting(client, req, 'production_yield', yieldQty);
      await setSetting(client, req, 'production_opex', opex);
    }

    await audit(client, req, 'recipe.created', 'recipe', id, { name, yield: yieldQty, opex, items });
    return { ...rRows[0], items };
  });

  return res.status(201).json({ success: true, data: { recipe } });
}

async function updateRecipeById(req, res) {
  const recipeId = text(req.params.recipeId, 'ID resep', { max: 50 });
  const name = text(req.body?.name, 'Nama resep', { max: 150 });
  const yieldQty = integer(req.body?.yield, 'Hasil resep (yield)', { min: 1, max: 100000 });
  const opex = decimal(req.body?.opex ?? 0, 'Biaya operasional (opex)');
  assert(Array.isArray(req.body?.items) && req.body.items.length > 0, 400, 'Daftar bahan resep wajib diisi.');

  const seen = new Set();
  const items = req.body.items.map((item) => {
    const ingredientId = text(item?.ingredientId, 'ID bahan', { max: 50 });
    assert(!seen.has(ingredientId), 400, `Bahan ${ingredientId} dikirim lebih dari satu kali.`);
    seen.add(ingredientId);
    const quantity = decimal(item?.quantity, 'Takaran bahan');
    assert(quantity > 0, 400, 'Takaran bahan harus lebih dari nol.');
    return { ingredientId, quantity };
  });

  const recipe = await db.transaction(async (client) => {
    const { rows: existing } = await client.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    assert(existing[0], 404, 'Resep tidak ditemukan.');

    const requestedIds = items.map((item) => item.ingredientId);
    const { rows: matched } = await client.query(
      'SELECT id FROM ingredients WHERE id = ANY($1::varchar[])',
      [requestedIds]
    );
    assert(matched.length === requestedIds.length, 400, 'Sebagian bahan resep tidak ditemukan.');

    const { rows: rRows } = await client.query(
      `UPDATE recipes SET name = $2, yield = $3, opex = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [recipeId, name, yieldQty, opex]
    );

    await client.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipeId]);
    for (const item of items) {
      await client.query(
        `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity)
         VALUES ($1, $2, $3)`,
        [recipeId, item.ingredientId, item.quantity]
      );
    }

    if (existing[0].is_active) {
      await client.query('DELETE FROM bill_of_materials');
      for (const item of items) {
        await client.query(
          'INSERT INTO bill_of_materials (ingredient_id, quantity, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [item.ingredientId, item.quantity]
        );
      }
      await setSetting(client, req, 'production_yield', yieldQty);
      await setSetting(client, req, 'production_opex', opex);
    }

    await audit(client, req, 'recipe.updated', 'recipe', recipeId, { name, yield: yieldQty, opex, items });
    return { ...rRows[0], items };
  });

  return res.json({ success: true, data: { recipe } });
}

async function deleteRecipe(req, res) {
  const recipeId = text(req.params.recipeId, 'ID resep', { max: 50 });
  await db.transaction(async (client) => {
    const { rows: existing } = await client.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    assert(existing[0], 404, 'Resep tidak ditemukan.');
    assert(!existing[0].is_active, 400, 'Resep yang sedang aktif tidak dapat dihapus. Aktifkan resep lain terlebih dahulu.');

    await client.query('DELETE FROM recipes WHERE id = $1', [recipeId]);
    await audit(client, req, 'recipe.deleted', 'recipe', recipeId, { name: existing[0].name });
  });
  return res.json({ success: true, message: 'Resep berhasil dihapus.' });
}

async function activateRecipe(req, res) {
  const recipeId = text(req.params.recipeId, 'ID resep', { max: 50 });
  const recipe = await db.transaction(async (client) => {
    const { rows: rRows } = await client.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    const r = rRows[0];
    assert(r, 404, 'Resep tidak ditemukan.');

    const { rows: items } = await client.query(
      'SELECT ingredient_id, quantity FROM recipe_items WHERE recipe_id = $1',
      [recipeId]
    );
    assert(items.length > 0, 400, 'Resep tidak memiliki bahan baku.');

    await client.query('UPDATE recipes SET is_active = (id = $1)', [recipeId]);
    await client.query('DELETE FROM bill_of_materials');
    for (const item of items) {
      await client.query(
        'INSERT INTO bill_of_materials (ingredient_id, quantity, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [item.ingredient_id, item.quantity]
      );
    }
    await setSetting(client, req, 'production_yield', r.yield);
    await setSetting(client, req, 'production_opex', r.opex);

    await audit(client, req, 'recipe.activated', 'recipe', recipeId, { name: r.name });
    return { ...r, is_active: true, items };
  });
  return res.json({ success: true, data: { recipe } });
}

async function listBatches(req, res) {
  const batches = await getAllBatches(db);
  return res.json({
    success: true,
    data: {
      batches,
      availableColdStock: await availableCold(db),
    },
  });
}

async function listInventoryMovements(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT m.id, m.ingredient_id, i.name AS ingredient_name, i.unit,
            m.quantity_delta, m.reason, m.note, m.reference_id, m.created_by, m.created_at
     FROM inventory_movements m
     JOIN ingredients i ON i.id = m.ingredient_id
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { movements: rows } });
}

async function listPurchaseOrders(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT po.id, po.ingredient_id, i.name AS ingredient_name, i.unit,
            po.quantity, po.unit_price, po.status, po.note,
            po.created_by, po.received_by, po.created_at, po.received_at
     FROM purchase_orders po
     JOIN ingredients i ON i.id = po.ingredient_id
     ORDER BY po.created_at DESC, po.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { purchaseOrders: rows } });
}

async function createPurchaseOrder(req, res) {
  const ingredientId = text(req.body?.ingredientId, 'ID bahan', { max: 50 });
  const quantity = decimal(req.body?.quantity, 'Jumlah pesanan');
  assert(quantity > 0, 400, 'Jumlah pesanan harus lebih dari nol.');
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const customUnitPrice = (req.body?.unitPrice !== undefined && req.body?.unitPrice !== null && req.body?.unitPrice !== '')
    ? decimal(req.body.unitPrice, 'Harga bahan')
    : null;

  const purchaseOrder = await db.transaction(async (client) => {
    const { rows: ingRows } = await client.query('SELECT id, price FROM ingredients WHERE id = $1', [ingredientId]);
    assert(ingRows[0], 404, 'Bahan baku tidak ditemukan.');

    const unitPrice = customUnitPrice !== null ? customUnitPrice : ingRows[0].price;
    const id = ID();
    const { rows } = await client.query(
      `INSERT INTO purchase_orders (id, ingredient_id, quantity, unit_price, note, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'menunggu')
       RETURNING *`,
      [id, ingredientId, quantity, unitPrice, note, req.user.email]
    );
    await audit(client, req, 'purchase_order.created', 'purchase_order', id, { ingredientId, quantity });
    return rows[0];
  });

  return res.status(201).json({ success: true, data: { purchaseOrder } });
}

async function receivePurchaseOrder(req, res) {
  const orderId = text(req.params.orderId, 'ID purchase order', { max: 50 });

  const ingredient = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [orderId]);
    const po = rows[0];
    assert(po, 404, 'Purchase order tidak ditemukan.');
    assert(po.status === 'menunggu', 409, 'Purchase order sudah diproses sebelumnya.');

    const { rows: ingRows } = await client.query(
      `UPDATE ingredients SET stock = stock + $2, price = $3 WHERE id = $1
       RETURNING id, name, unit, stock, rop, price`,
      [po.ingredient_id, po.quantity, po.unit_price]
    );

    await client.query(
      `UPDATE purchase_orders SET status = 'diterima', received_by = $2, received_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, req.user.email]
    );

    await client.query(
      `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, reference_id, created_by, note)
       VALUES ($1, $2, $3, 'penerimaan_po', $4, $5, $6)`,
      [ID(), po.ingredient_id, po.quantity, orderId, req.user.email, po.note]
    );

    await audit(client, req, 'purchase_order.received', 'purchase_order', orderId, {
      ingredientId: po.ingredient_id,
      quantity: Number(po.quantity),
    });

    return ingRows[0];
  });

  return res.json({ success: true, data: { ingredient } });
}

async function listProductions(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT pr.id, pr.batch_id, pr.recipe_count, pr.yield_qty, pr.usage_mode,
            pr.hpp_per_unit, pr.note, pr.created_by, pr.created_at,
            COALESCE(json_agg(json_build_object(
              'ingredientId', pri.ingredient_id,
              'ingredientName', i.name,
              'unit', i.unit,
              'quantityUsed', pri.quantity_used,
              'standardQuantity', pri.standard_quantity
            )) FILTER (WHERE pri.id IS NOT NULL), '[]'::json) AS items
     FROM production_runs pr
     LEFT JOIN production_run_items pri ON pri.production_run_id = pr.id
     LEFT JOIN ingredients i ON i.id = pri.ingredient_id
     GROUP BY pr.id
     ORDER BY pr.created_at DESC, pr.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { productions: rows } });
}

async function createProduction(req, res) {
  const recipeCount = integer(req.body?.recipeCount, 'Jumlah resep', { min: 1, max: 1000 });
  const usageMode = enumValue(req.body?.usageMode ?? 'auto', 'Mode pemakaian', ['auto', 'manual']);
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const customExpDate = req.body?.expDate === undefined ? null : date(req.body.expDate, 'Tanggal kedaluwarsa');

  const production = await db.transaction(async (client) => {
    const settings = await readSettings(client);

    let bomRows = [];
    let customYield = null;
    let customOpex = null;

    if (Array.isArray(req.body?.recipeItems) && req.body.recipeItems.length > 0) {
      const requestedIds = req.body.recipeItems.map((item) =>
        text(item?.ingredientId, 'ID bahan resep', { max: 50 })
      );
      const { rows: ingRows } = await client.query(
        'SELECT id, name, stock, price FROM ingredients WHERE id = ANY($1::varchar[]) FOR UPDATE',
        [requestedIds]
      );
      const ingMap = Object.fromEntries(ingRows.map((r) => [r.id, r]));
      assert(ingRows.length === requestedIds.length, 400, 'Sebagian bahan resep yang diproduksi tidak ditemukan.');

      bomRows = req.body.recipeItems.map((item) => {
        const id = item.ingredientId;
        const q = decimal(item.quantity, `Takaran ${id}`);
        assert(q > 0, 400, 'Takaran bahan harus lebih dari nol.');
        return {
          ingredient_id: id,
          quantity: q,
          stock: ingMap[id].stock,
          price: ingMap[id].price,
          name: ingMap[id].name,
        };
      });

      if (req.body?.recipeYield !== undefined && req.body?.recipeYield !== null) {
        customYield = integer(req.body.recipeYield, 'Hasil resep (yield)', { min: 1, max: 100000 });
      }
      if (req.body?.recipeOpex !== undefined && req.body?.recipeOpex !== null) {
        customOpex = decimal(req.body.recipeOpex, 'Biaya operasional (opex)');
      }
    } else {
      const { rows } = await client.query(
        `SELECT b.ingredient_id, b.quantity, i.stock, i.price, i.name
         FROM bill_of_materials b
         JOIN ingredients i ON i.id = b.ingredient_id
         ORDER BY b.ingredient_id ASC
         FOR UPDATE OF i`
      );
      bomRows = rows;
    }
    assert(bomRows.length > 0, 400, 'Resep BOM belum dikonfigurasi.');

    const bomMap = Object.fromEntries(bomRows.map((row) => [row.ingredient_id, row]));
    const standardMap = Object.fromEntries(
      bomRows.map((row) => [row.ingredient_id, Number(row.quantity) * recipeCount])
    );

    let actualMap = {};
    if (usageMode === 'manual') {
      assert(req.body?.items && typeof req.body.items === 'object' && !Array.isArray(req.body.items), 400, 'Mode manual wajib mengirim objek items.');
      for (const [ingredientId, rawQty] of Object.entries(req.body.items)) {
        assert(bomMap[ingredientId], 400, `Pemakaian bahan yang tidak ada di resep: ${ingredientId}.`);
        const qty = decimal(rawQty, `Takaran ${ingredientId}`);
        if (qty > 0) actualMap[ingredientId] = qty;
      }
      assert(Object.keys(actualMap).length > 0, 400, 'Minimal satu bahan harus memiliki jumlah lebih dari nol.');
    } else {
      actualMap = { ...standardMap };
    }

    let ingredientCost = 0;
    for (const [ingredientId, needed] of Object.entries(actualMap)) {
      const ing = bomMap[ingredientId];
      assert(Number(ing.stock) >= needed, 409, `Stok ${ing.name || ingredientId} tidak mencukupi (tersedia: ${ing.stock}, butuh: ${needed}).`);
      ingredientCost += needed * Number(ing.price);
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['paolotory-batch-seq']);
    const { rows: dateRows } = await client.query(
      `SELECT CURRENT_DATE::text AS today,
              TO_CHAR(CURRENT_DATE, 'YYYYMMDD') AS date_code,
              (SELECT COUNT(*)::int + 1 FROM batches WHERE made_date = CURRENT_DATE) AS sequence`
    );
    const { today, date_code: dateCode, sequence } = dateRows[0];

    let expDate = customExpDate;
    if (!expDate) {
      const { rows: expRows } = await client.query(
        `SELECT ($1::date + INTERVAL '30 days')::date::text AS value`,
        [today]
      );
      expDate = expRows[0].value;
    }
    assert(expDate >= today, 400, 'Tanggal kedaluwarsa tidak boleh lebih awal dari tanggal produksi.');

    for (const [ingredientId, needed] of Object.entries(actualMap)) {
      await client.query('UPDATE ingredients SET stock = stock - $2 WHERE id = $1', [ingredientId, needed]);
    }

    const yieldPerRecipe = customYield !== null ? customYield : Number(settings.production_yield);
    const opexPerRecipe = customOpex !== null ? customOpex : Number(settings.production_opex);
    const yieldQty = yieldPerRecipe * recipeCount;
    const totalOpex = opexPerRecipe * recipeCount;
    const hppPerUnit = Number(((ingredientCost + totalOpex) / yieldQty).toFixed(4));

    const batchId = `BPK-${dateCode}-${String(sequence).padStart(2, '0')}`;
    const productionId = ID();

    await client.query(
      `INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
       VALUES ($1, $2, $3, $4, $4)`,
      [batchId, today, expDate, yieldQty]
    );

    await client.query(
      `INSERT INTO production_runs (id, batch_id, recipe_count, yield_qty, usage_mode, hpp_per_unit, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [productionId, batchId, recipeCount, yieldQty, usageMode, hppPerUnit, note, req.user.email]
    );

    for (const row of bomRows) {
      const ingredientId = row.ingredient_id;
      const used = actualMap[ingredientId] || 0;
      const standard = standardMap[ingredientId] || 0;
      await client.query(
        `INSERT INTO production_run_items (production_run_id, ingredient_id, quantity_used, standard_quantity)
         VALUES ($1, $2, $3, $4)`,
        [productionId, ingredientId, used, standard]
      );
      if (used > 0) {
        await client.query(
          `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, note, reference_id, created_by)
           VALUES ($1, $2, $3, 'produksi', $4, $5, $6)`,
          [ID(), ingredientId, -used, note, productionId, req.user.email]
        );
      }
    }

    await audit(client, req, 'production.created', 'production_run', productionId, {
      batchId,
      recipeCount,
      yieldQty,
      usageMode,
      hppPerUnit,
    });

    return {
      id: productionId,
      batch: { id: batchId, madeDate: today, expDate, qty: yieldQty },
      recipeCount,
      yieldQty,
      usageMode,
      hppPerUnit,
      note,
    };
  });

  return res.status(201).json({ success: true, data: { production } });
}

async function createIngredientAdjustment(req, res) {
  const ingredientId = text(req.body?.ingredientId, 'ID bahan', { max: 50 });
  const quantity = decimal(req.body?.quantity, 'Jumlah pengurangan');
  assert(quantity > 0, 400, 'Jumlah pengurangan harus lebih dari nol.');
  const reason = text(req.body?.reason, 'Alasan', { max: 80 });
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });

  const ingredient = await db.transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, name, unit, stock FROM ingredients WHERE id = $1 FOR UPDATE',
      [ingredientId]
    );
    const current = rows[0];
    assert(current, 404, 'Bahan baku tidak ditemukan.');
    assert(Number(current.stock) >= quantity, 409, `Jumlah melebihi stok ${current.name} (${current.stock}).`);

    const { rows: updated } = await client.query(
      `UPDATE ingredients SET stock = stock - $2 WHERE id = $1
       RETURNING id, name, unit, stock, rop, price`,
      [ingredientId, quantity]
    );

    await client.query(
      `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ID(), ingredientId, -quantity, reason, note, req.user.email]
    );

    await audit(client, req, 'ingredient.adjusted', 'ingredient', ingredientId, { quantity, reason });
    return updated[0];
  });

  return res.status(201).json({ success: true, data: { ingredient } });
}

module.exports = {
  listIngredients,
  createIngredient,
  updateIngredient,
  getRecipe,
  updateRecipe,
  listRecipes,
  createRecipe,
  updateRecipeById,
  deleteRecipe,
  activateRecipe,
  listBatches,
  listInventoryMovements,
  listPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  listProductions,
  createProduction,
  createIngredientAdjustment,
};