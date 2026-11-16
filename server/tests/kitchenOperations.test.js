const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const originalDbModule = require.cache[dbPath];
const fakeDb = {
  state: null,
  async transaction(callback) {
    try {
      const result = await callback(this.state.client);
      this.state.committed += 1;
      return result;
    } catch (error) {
      this.state.rolledBack += 1;
      throw error;
    }
  },
  async query(sql, params = []) {
    return this.state.query(sql, params);
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb,
};

const operations = require('../src/controllers/operationsController');

if (originalDbModule) {
  require.cache[dbPath] = originalDbModule;
} else {
  delete require.cache[dbPath];
}

function setupDatabase({
  purchaseOrder = null,
  ingredient = { id: 'flour', name: 'Tepung', unit: 'g', stock: 1000, rop: 100, price: 12 },
  recipe = [{ ingredient_id: 'flour', quantity: '100', stock: 1000, price: 12, name: 'Tepung', unit: 'g' }],
  settings = [
    { key: 'production_yield', numeric_value: '60' },
    { key: 'production_opex', numeric_value: '600' },
  ],
  batch = { today: '2026-11-09', date_code: '20261109', sequence: 2 },
  matchedIngredients = recipe.map((item) => ({ id: item.ingredient_id })),
  adjustedIngredient = { ...ingredient, stock: Number(ingredient.stock) - 25 },
} = {}) {
  const queries = [];
  let recipeReadback = recipe;
  const currentSettings = [...settings];
  fakeDb.state = {
    committed: 0,
    rolledBack: 0,
    query: async (sql, params = []) => {
      queries.push({ sql, params, outsideTransaction: true });
      if (sql.includes('SELECT key, numeric_value FROM business_settings')) {
        return { rows: currentSettings };
      }
      if (sql.includes('SELECT b.ingredient_id, i.name, i.unit, b.quantity, i.stock, i.price')) {
        return { rows: recipeReadback };
      }
      throw new Error(`Unexpected non-transactional query: ${sql}`);
    },
    client: {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (sql.includes('SELECT key, numeric_value FROM business_settings')) {
          return { rows: currentSettings };
        }
        if (sql.includes('INSERT INTO business_settings')) {
          const setting = currentSettings.find((item) => item.key === params[0]);
          if (setting) setting.numeric_value = params[1];
          else currentSettings.push({ key: params[0], numeric_value: params[1] });
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE')) {
          return { rows: purchaseOrder ? [{ ...purchaseOrder }] : [] };
        }
        if (sql.includes('SELECT id FROM ingredients WHERE id = $1 FOR UPDATE')) {
          return { rows: ingredient ? [{ id: ingredient.id }] : [] };
        }
        if (sql.includes('SELECT id, name, unit, stock FROM ingredients WHERE id = $1 FOR UPDATE')) {
          return { rows: ingredient ? [{ ...ingredient }] : [] };
        }
        if (sql.includes('SELECT id FROM ingredients WHERE id = ANY($1::varchar[])')) {
          return { rows: matchedIngredients };
        }
        if (sql.includes('UPDATE ingredients SET stock = stock - $2 WHERE id = $1\n       RETURNING id, name, unit, stock, rop, price')) {
          return { rows: [{ ...adjustedIngredient }] };
        }
        if (sql.includes('UPDATE ingredients SET stock = stock + $2')) {
          return {
            rows: [{
              ...ingredient,
              stock: Number(ingredient.stock) + Number(params[1]),
              price: params[2],
            }],
          };
        }
        if (sql.includes('SELECT b.ingredient_id, b.quantity, i.stock, i.price')) {
          return { rows: recipe };
        }
        if (sql.includes('SELECT CURRENT_DATE::text AS today')) {
          return { rows: [batch] };
        }
        if (sql.includes('SELECT ($1::date + INTERVAL')) {
          return { rows: [{ value: '2026-12-09' }] };
        }
        if (sql.includes('SELECT id, price FROM ingredients WHERE id = $1')) {
          return { rows: ingredient ? [{ id: ingredient.id, price: ingredient.price }] : [] };
        }
        if (sql.includes('INSERT INTO purchase_orders')) {
          return {
            rows: [{
              id: params[0],
              ingredient_id: params[1],
              quantity: params[2],
              unit_price: params[3],
              note: params[4],
              created_by: params[5],
              status: 'menunggu',
            }],
          };
        }
        if (sql.includes('INSERT INTO bill_of_materials')) {
          const previous = recipe.find((item) => item.ingredient_id === params[0]);
          recipeReadback = [
            ...recipeReadback,
            {
              ...(previous || { name: params[0], unit: 'g', stock: 1000, price: 12 }),
              ingredient_id: params[0],
              quantity: params[1],
            },
          ];
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM bill_of_materials')) {
          recipeReadback = [];
          return { rows: [], rowCount: recipe.length };
        }
        return { rows: [], rowCount: 1 };
      },
    },
  };
  return queries;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function kitchenRequest(body = {}, params = {}) {
  return {
    body,
    params,
    query: {},
    user: { role: 'kitchen', partnerId: null, email: 'dapur@example.id' },
  };
}

test('pembuatan PO menyimpan harga bahan saat pemesanan dan mencatat audit', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.createPurchaseOrder(
    kitchenRequest({ ingredientId: 'flour', quantity: 2500, note: 'Stok mingguan' }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.purchaseOrder.ingredient_id, 'flour');
  assert.equal(res.body.data.purchaseOrder.quantity, 2500);
  assert.equal(res.body.data.purchaseOrder.unit_price, 12);
  assert.equal(res.body.data.purchaseOrder.status, 'menunggu');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO purchase_orders') &&
    params[1] === 'flour' && params[2] === 2500 && params[3] === 12 &&
    params[5] === 'dapur@example.id'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('penerimaan PO menambah stok, memperbarui harga, dan mencatat mutasi', async () => {
  const order = {
    id: 'po-1',
    ingredient_id: 'flour',
    quantity: '2500',
    unit_price: '14.50',
    status: 'menunggu',
  };
  const queries = setupDatabase({ purchaseOrder: order });
  const res = response();

  await operations.receivePurchaseOrder(
    kitchenRequest({}, { orderId: order.id }),
    res
  );

  assert.equal(res.body.data.ingredient.stock, 3500);
  assert.equal(res.body.data.ingredient.price, '14.50');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE ingredients SET stock = stock + $2') &&
    params[0] === 'flour' && params[1] === '2500' && params[2] === '14.50'
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("UPDATE purchase_orders SET status = 'diterima'") &&
    params[0] === order.id && params[1] === 'dapur@example.id'
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("'penerimaan_po'") && params[1] === 'flour' &&
    params[2] === '2500' && params[3] === order.id &&
    params[4] === 'dapur@example.id'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('PO yang sudah diproses tidak dapat diterima dua kali', async () => {
  const order = {
    id: 'po-received',
    ingredient_id: 'flour',
    quantity: '500',
    unit_price: '12',
    status: 'diterima',
  };
  const queries = setupDatabase({ purchaseOrder: order });

  await assert.rejects(
    operations.receivePurchaseOrder(
      kitchenRequest({}, { orderId: order.id }),
      response()
    ),
    (error) => error.status === 409 && /sudah diproses/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE ingredients') ||
    sql.includes("UPDATE purchase_orders SET status = 'diterima'") ||
    sql.includes('INSERT INTO inventory_movements')
  ), false);
});

test('produksi otomatis mengurangi bahan sesuai resep dan membuat batch beserta HPP', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.createProduction(
    kitchenRequest({ recipeCount: 2, usageMode: 'auto', note: 'Produksi pagi' }),
    res
  );

  const production = res.body.data.production;
  assert.equal(res.statusCode, 201);
  assert.equal(production.batch.id, 'BPK-20261109-02');
  assert.equal(production.batch.qty, 120);
  assert.equal(production.batch.expDate, '2026-12-09');
  assert.equal(production.hppPerUnit, 30);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE ingredients SET stock = stock - $2') &&
    params[0] === 'flour' && params[1] === 200
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO batches') &&
    params[0] === 'BPK-20261109-02' && params[3] === 120
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO production_runs') &&
    params[2] === 2 && params[3] === 120 && params[5] === 30
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO inventory_movements') &&
    params[1] === 'flour' && params[2] === -200
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO production_run_items')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('produksi manual menolak pemakaian bahan yang tidak ada di resep', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.createProduction(
      kitchenRequest({
        recipeCount: 1,
        usageMode: 'manual',
        items: { flour: 100, sugar: 50 },
      }),
      response()
    ),
    (error) => error.status === 400 && /bahan yang tidak ada di resep/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('INSERT INTO batches') ||
    sql.includes('UPDATE ingredients SET stock') ||
    sql.includes('INSERT INTO production_runs')
  ), false);
});

test('produksi kekurangan bahan di-rollback tanpa membuat batch atau mutasi stok', async () => {
  const queries = setupDatabase({
    recipe: [{
      ingredient_id: 'flour',
      quantity: '100',
      stock: 150,
      price: 12,
      name: 'Tepung',
      unit: 'g',
    }],
  });

  await assert.rejects(
    operations.createProduction(
      kitchenRequest({ recipeCount: 2, usageMode: 'auto' }),
      response()
    ),
    (error) => error.status === 409 && /Stok Tepung tidak mencukupi/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('INSERT INTO batches') ||
    sql.includes('UPDATE ingredients SET stock') ||
    sql.includes('INSERT INTO production_runs')
  ), false);
});

test('perubahan resep mengganti BOM dan menyimpan hasil serta biaya operasional', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.updateRecipe(
    {
      ...kitchenRequest({
        yield: 48,
        opex: 72000,
        items: [{ ingredientId: 'flour', quantity: 150 }],
      }),
      user: { role: 'owner', email: 'owner@example.id' },
    },
    res
  );

  assert.equal(res.body.data.recipe.yield, 48);
  assert.equal(res.body.data.recipe.opex, 72000);
  assert.equal(res.body.data.recipe.items[0].quantity, 150);
  assert.ok(queries.some(({ sql }) => sql.includes('DELETE FROM bill_of_materials')));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO bill_of_materials') &&
    params[0] === 'flour' && params[1] === 150
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO business_settings') &&
    params[0] === 'production_yield' && params[1] === 48
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO business_settings') &&
    params[0] === 'production_opex' && params[1] === 72000
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('perubahan resep ditolak sebelum BOM dihapus jika bahan tidak ditemukan', async () => {
  const queries = setupDatabase({ matchedIngredients: [] });

  await assert.rejects(
    operations.updateRecipe(
      {
        ...kitchenRequest({
          yield: 48,
          opex: 72000,
          items: [{ ingredientId: 'missing', quantity: 150 }],
        }),
        user: { role: 'owner', email: 'owner@example.id' },
      },
      response()
    ),
    (error) => error.status === 400 && /bahan resep tidak ditemukan/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('DELETE FROM bill_of_materials') ||
    sql.includes('INSERT INTO bill_of_materials')
  ), false);
});

test('penyesuaian stok mengurangi bahan dan mencatat alasan serta audit', async () => {
  const queries = setupDatabase({
    adjustedIngredient: {
      id: 'flour',
      name: 'Tepung',
      unit: 'g',
      stock: 975,
      rop: 100,
      price: 12,
    },
  });
  const res = response();

  await operations.createIngredientAdjustment(
    kitchenRequest({
      ingredientId: 'flour',
      quantity: 25,
      reason: 'Bahan tumpah',
      note: 'Kemasan robek',
    }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.ingredient.stock, 975);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE ingredients SET stock = stock - $2') &&
    params[0] === 'flour' && params[1] === 25
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO inventory_movements') &&
    params[1] === 'flour' && params[2] === -25 &&
    params[3] === 'Bahan tumpah' && params[4] === 'Kemasan robek'
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO audit_logs') &&
    params[1] === 'ingredient.adjusted' && params[2] === 'ingredient'
  ));
  assert.equal(fakeDb.state.committed, 1);
});

test('penyesuaian melebihi stok ditolak tanpa mutasi ledger', async () => {
  const queries = setupDatabase({
    ingredient: { id: 'flour', name: 'Tepung', unit: 'g', stock: 10, rop: 5, price: 12 },
  });

  await assert.rejects(
    operations.createIngredientAdjustment(
      kitchenRequest({
        ingredientId: 'flour',
        quantity: 11,
        reason: 'Rusak',
      }),
      response()
    ),
    (error) => error.status === 409 && /Jumlah melebihi stok Tepung/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE ingredients SET stock = stock - $2') ||
    sql.includes('INSERT INTO inventory_movements')
  ), false);
});
