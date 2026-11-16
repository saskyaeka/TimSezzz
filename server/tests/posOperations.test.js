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
    if (!this.state.query) throw new Error(`Unexpected database query: ${sql}`);
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
  shift = { id: 'shift-1', opening_cash: '50000', status: 'open' },
  settings = [{ key: 'central_price', numeric_value: '12000' }],
  batches = [],
  reservations = [],
  cashSales = '0',
  shiftOwner = 'kasir@example.id',
  shiftSales = [],
  duplicateShift = false,
} = {}) {
  const queries = [];
  fakeDb.state = {
    committed: 0,
    rolledBack: 0,
    client: {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (sql.includes('FROM pos_shifts WHERE opened_by = $1 AND status =')) {
          return { rows: shift ? [{ ...shift }] : [] };
        }
        if (sql.includes('FROM business_settings')) {
          return { rows: settings };
        }
        if (sql.includes('SELECT id, left_qty FROM batches')) {
          return { rows: batches };
        }
        if (sql.includes('SELECT batch_id, SUM(quantity)::int AS reserved_qty')) {
          return { rows: reservations };
        }
        if (sql.includes('SELECT COALESCE(SUM(total), 0)::numeric AS cash_sales')) {
          return { rows: [{ cash_sales: cashSales }] };
        }
        if (sql.includes("UPDATE pos_shifts SET status = 'closed'")) {
          return {
            rows: [{
              ...shift,
              status: 'closed',
              expected_cash: params[1],
              counted_cash: params[2],
              cash_difference: params[3],
            }],
          };
        }
        if (sql.includes('INSERT INTO pos_shifts')) {
          if (duplicateShift) {
            throw Object.assign(new Error('duplicate shift'), { code: '23505' });
          }
          return {
            rows: [{
              id: params[0],
              opening_cash: params[2],
              opened_at: '2026-11-09T08:00:00.000Z',
            }],
          };
        }
        if (sql.includes('INSERT INTO pos_spoilage')) {
          return {
            rows: [{
              id: params[0],
              product_id: params[2],
              quantity: params[3],
              reason: params[4],
              note: params[5],
            }],
          };
        }
        return { rows: [], rowCount: 1 };
      },
    },
    query: async (sql, params = []) => {
      queries.push({ sql, params, outsideTransaction: true });
      if (sql.includes('SELECT id, opened_by FROM pos_shifts WHERE id = $1')) {
        return { rows: [{ id: params[0], opened_by: shiftOwner }] };
      }
      if (sql.includes('FROM pos_sales s LEFT JOIN pos_sale_items')) {
        return { rows: shiftSales };
      }
      if (sql.includes('FROM business_settings')) return { rows: settings };
      throw new Error(`Unexpected non-transactional query: ${sql}`);
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

function cashierRequest(body = {}) {
  return {
    body,
    params: {},
    query: {},
    user: { role: 'pos', partnerId: null, email: 'kasir@example.id' },
  };
}

test('checkout menghitung harga di server, memberi kembalian, dan mengurangi stok beku', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 10 }],
    reservations: [{ batch_id: 'batch-1', reserved_qty: 2 }],
  });
  const res = response();

  await operations.checkout(cashierRequest({
    paymentMethod: 'tunai',
    receivedAmount: 70000,
    items: [{ productId: 'pack6', quantity: 1 }],
  }), res);

  const sale = res.body.data.sale;
  assert.equal(res.statusCode, 201);
  assert.equal(sale.total, 66000);
  assert.equal(sale.receivedAmount, 70000);
  assert.equal(sale.changeAmount, 4000);
  assert.equal(sale.items[0].unitPrice, 66000);
  assert.equal(sale.items[0].lineTotal, 66000);
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE batches SET left_qty = left_qty - $2') &&
    params[0] === 'batch-1' && params[1] === 6
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO pos_sales') &&
    params[1] === 'shift-1' && params[4] === 66000 &&
    params[5] === 70000 && params[6] === 4000
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO pos_sale_items') &&
    params[1] === 'pack6' && params[3] === 66000
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('checkout QRIS tidak menerima atau mencatat uang tunai', async () => {
  setupDatabase();
  const res = response();

  await operations.checkout(cashierRequest({
    paymentMethod: 'qris',
    items: [{ productId: 'hangat', quantity: 2 }],
  }), res);

  assert.equal(res.body.data.sale.total, 24000);
  assert.equal(res.body.data.sale.receivedAmount, null);
  assert.equal(res.body.data.sale.changeAmount, 0);
});

test('checkout tanpa stok cold storage cukup di-rollback tanpa mencatat penjualan', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 5 }],
    reservations: [],
  });

  await assert.rejects(
    operations.checkout(cashierRequest({
      paymentMethod: 'qris',
      items: [{ productId: 'pack6', quantity: 1 }],
    }), response()),
    (error) => error.status === 409 && /cold storage tidak mencukupi/i.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('INSERT INTO pos_sales') ||
    sql.includes('INSERT INTO pos_sale_items')
  ), false);
});

test('checkout menolak uang tunai kurang sebelum mencatat transaksi', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.checkout(cashierRequest({
      paymentMethod: 'tunai',
      receivedAmount: 10000,
      items: [{ productId: 'hangat', quantity: 1 }],
    }), response()),
    (error) => error.status === 400 && /Uang diterima kurang/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO pos_sales')), false);
});

test('penutupan shift menghitung kas akhir dan selisih terhadap hitungan kasir', async () => {
  const queries = setupDatabase({
    cashSales: '37500.00',
  });
  const res = response();

  await operations.closeShift(cashierRequest({ countedCash: 90000 }), res);

  assert.equal(res.body.data.shift.status, 'closed');
  assert.equal(res.body.data.shift.expected_cash, 87500);
  assert.equal(res.body.data.shift.counted_cash, 90000);
  assert.equal(res.body.data.shift.cash_difference, 2500);
  assert.equal(fakeDb.state.committed, 1);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('FROM pos_shifts WHERE opened_by = $1 AND status =') &&
    params[0] === 'kasir@example.id'
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("FROM pos_sales WHERE shift_id = $1 AND payment_method = 'tunai'") &&
    params[0] === 'shift-1'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('pembukaan shift mencatat modal awal dan identitas kasir', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.openShift(cashierRequest({ openingCash: 75000 }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.shift.opening_cash, 75000);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO pos_shifts') &&
    params[1] === 'kasir@example.id' && params[2] === 75000
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('pembukaan shift kedua ditolak sebagai konflik tanpa audit', async () => {
  const queries = setupDatabase({ duplicateShift: true });

  await assert.rejects(
    operations.openShift(cashierRequest({ openingCash: 50000 }), response()),
    (error) => error.status === 409 && /shift yang belum ditutup/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')), false);
});

test('kasir hanya dapat melihat penjualan pada shift miliknya', async () => {
  const queries = setupDatabase({ shiftOwner: 'kasir-lain@example.id' });

  await assert.rejects(
    operations.listShiftSales(
      { ...cashierRequest(), params: { shiftId: 'shift-rahasia' }, query: {} },
      response()
    ),
    (error) => error.status === 403 && /hanya dapat melihat shift sendiri/.test(error.message)
  );

  assert.equal(queries.some(({ sql }) => sql.includes('FROM pos_sales s LEFT JOIN')), false);
});

test('owner dapat melihat riwayat penjualan shift kasir lain', async () => {
  const sales = [{ id: 'sale-1', total: '24000.00', items: [] }];
  const queries = setupDatabase({
    shiftOwner: 'kasir-lain@example.id',
    shiftSales: sales,
  });
  const res = response();

  await operations.listShiftSales(
    {
      ...cashierRequest(),
      params: { shiftId: 'shift-lain' },
      query: { limit: '10', offset: '0' },
      user: { role: 'owner', email: 'owner@example.id' },
    },
    res
  );

  assert.deepEqual(res.body.data.sales, sales);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('FROM pos_sales s LEFT JOIN') &&
    params[0] === 'shift-lain'
  ));
});

test('produk beku rusak mengurangi stok batch dan dicatat pada shift aktif', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 20 }],
    reservations: [{ batch_id: 'batch-1', reserved_qty: 2 }],
  });
  const res = response();

  await operations.reportSpoilage(cashierRequest({
    productId: 'pack6',
    quantity: 2,
    reason: 'Kemasan rusak',
    note: 'Ditemukan saat pengecekan',
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.spoilage.productId, 'pack6');
  assert.equal(res.body.data.spoilage.quantity, 2);
  assert.equal(res.body.data.spoilage.reason, 'Kemasan rusak');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE batches SET left_qty = left_qty - $2') &&
    params[0] === 'batch-1' && params[1] === 12
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO pos_spoilage') &&
    params[1] === 'kasir@example.id' &&
    params[2] === 'pack6' && params[3] === 2
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('produk hangat rusak dicatat tanpa mengurangi stok cold storage', async () => {
  const queries = setupDatabase();

  await operations.reportSpoilage(cashierRequest({
    productId: 'hangat',
    quantity: 1,
    reason: 'Tidak layak jual',
  }), response());

  assert.equal(queries.some(({ sql }) => sql.includes('UPDATE batches')), false);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO pos_spoilage')));
});

test('produk beku rusak tanpa stok cold storage cukup di-rollback', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 5 }],
    reservations: [{ batch_id: 'batch-1', reserved_qty: 2 }],
  });

  await assert.rejects(
    operations.reportSpoilage(cashierRequest({
      productId: 'pack6',
      quantity: 1,
      reason: 'Kemasan bocor',
    }), response()),
    (error) => error.status === 409 && /cold storage tidak mencukupi/i.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO pos_spoilage')), false);
});
