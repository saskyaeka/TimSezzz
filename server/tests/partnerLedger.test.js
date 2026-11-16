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
  async query() {
    if (this.state.query) {
      return this.state.query(...arguments);
    }
    throw new Error('Unexpected non-transactional database query.');
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
  partner = { id: 'p1', sent: 20, sold: 5, returned: 2, price_per_unit: null },
  pendingClaims = 0,
  claim = null,
  order = null,
  batches = [],
  reservations = [],
  manifest = null,
  allocations = [],
  pendingInventoryClaims = 0,
  incomingSupply = 0,
  salesAggregate = { quantity: 0, gross: 0 },
  returnsAggregate = { quantity: 0 },
  partnerSales = [],
  partnerOrders = [],
  partnerClaims = [],
} = {}) {
  const queries = [];
  fakeDb.state = {
    committed: 0,
    rolledBack: 0,
    query: async (sql, params = []) => {
      queries.push({ sql, params, outsideTransaction: true });
      if (sql.includes('FROM partners WHERE id = $1')) {
        return { rows: [partner] };
      }
      if (sql.includes('FROM business_settings')) {
        return { rows: [{ key: 'partner_price', numeric_value: '9000' }] };
      }
      if (sql.includes('FROM partner_sales WHERE')) {
        if (sql.includes('SELECT id, quantity, unit_price, total, reported_by, created_at')) {
          return { rows: partnerSales };
        }
        return { rows: [{ ...salesAggregate }] };
      }
      if (sql.includes('FROM orders o JOIN partners p')) {
        return { rows: partnerOrders };
      }
      if (sql.includes('FROM claims c JOIN partners p')) {
        return { rows: partnerClaims };
      }
      if (sql.includes('FROM claims WHERE') && sql.includes("status = 'dikonfirmasi'")) {
        return { rows: [{ ...returnsAggregate }] };
      }
      if (sql.includes('FROM claims WHERE partner_id = $1')) {
        return { rows: [{ pending_claim_qty: pendingInventoryClaims }] };
      }
      if (sql.includes('FROM manifests WHERE partner_id = $1')) {
        return { rows: [{ quantity: incomingSupply }] };
      }
      throw new Error(`Unexpected non-transactional query: ${sql}`);
    },
    client: {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (sql.includes('FROM partners WHERE id = $1')) {
          return { rows: [partner] };
        }
        if (sql.includes("FROM claims WHERE partner_id = $1 AND status = 'menunggu'")) {
          return { rows: [{ pending_qty: pendingClaims, quantity: pendingClaims }] };
        }
        if (sql.includes('SELECT * FROM claims WHERE id = $1 FOR UPDATE')) {
          return { rows: claim ? [{ ...claim }] : [] };
        }
        if (sql.includes('SELECT * FROM orders WHERE id = $1 FOR UPDATE')) {
          return { rows: order ? [{ ...order }] : [] };
        }
        if (sql.includes('SELECT * FROM manifests WHERE id = $1 FOR UPDATE')) {
          return { rows: manifest ? [{ ...manifest }] : [] };
        }
        if (sql.includes('SELECT a.id, a.batch_id, a.quantity, b.left_qty')) {
          return { rows: allocations };
        }
        if (sql.includes('SELECT id, left_qty FROM batches')) {
          return { rows: batches };
        }
        if (sql.includes('SELECT batch_id, SUM(quantity)::int AS reserved_qty')) {
          return { rows: reservations };
        }
        if (sql.includes('FROM business_settings')) {
          return { rows: [{ key: 'partner_price', numeric_value: '9000' }] };
        }
        if (sql.includes('INSERT INTO orders (id, partner_id, qty, note, status, order_date)')) {
          return {
            rows: [{
              id: params[0],
              partner_id: params[1],
              qty: params[2],
              note: params[3],
              status: 'menunggu',
              order_date: '2026-11-09',
            }],
          };
        }
        if (sql.includes('INSERT INTO manifests')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO manifest_batch_allocations')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE orders SET manifest_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE orders SET status = $2')) {
          return {
            rows: [{
              ...order,
              status: params[1],
              reviewed_by: params[2],
            }],
          };
        }
        if (sql.includes('UPDATE manifests SET is_done = TRUE')) {
          return {
            rows: [{
              ...manifest,
              is_done: true,
              photo_url: params[1],
              received_by: params[4],
              courier_email: manifest.courier_email || params[5],
            }],
          };
        }
        if (sql.includes('UPDATE manifests SET cancelled_by = $2')) {
          return {
            rows: [{
              ...manifest,
              cancelled_by: params[1],
              cancelled_at: '2026-11-09T00:00:00.000Z',
            }],
          };
        }
        if (sql.includes('SELECT 1 FROM orders WHERE manifest_id = $1')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('RETURNING id, partner_id, qty, status, claim_date, photo_url')) {
          return {
            rows: [{
              id: params[0],
              partner_id: params[1],
              qty: params[2],
              status: 'menunggu',
              claim_date: '2026-11-09',
              photo_url: params[3],
            }],
          };
        }
        if (sql.includes('UPDATE claims SET status = $2')) {
          return {
            rows: [{
              ...claim,
              status: params[1],
              reviewed_by: params[2],
            }],
          };
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

function partnerRequest(body) {
  return {
    body,
    params: {},
    query: {},
    user: { role: 'partner', partnerId: 'p1', email: 'mitra@example.id' },
  };
}

function ownerClaimRequest(claimId, decision) {
  return {
    body: { decision },
    params: { claimId },
    query: {},
    user: { role: 'owner', partnerId: null, email: 'owner@example.id' },
  };
}

function ownerOrderRequest(orderId, decision) {
  return {
    body: { decision },
    params: { orderId },
    query: {},
    user: { role: 'owner', partnerId: null, email: 'owner@example.id' },
  };
}

function courierManifestRequest(manifestId, body) {
  return {
    body,
    params: { manifestId },
    query: {},
    user: { role: 'courier', partnerId: null, email: 'courier@example.id' },
  };
}

function ownerManifestRequest(manifestId) {
  return {
    body: {},
    params: { manifestId },
    query: {},
    user: { role: 'owner', partnerId: null, email: 'owner@example.id' },
  };
}

function partnerReadRequest(query = {}, params = {}) {
  return {
    body: {},
    params,
    query,
    user: { role: 'partner', partnerId: 'p1', email: 'mitra@example.id' },
  };
}

test('penjualan mitra mengurangi stok tersedia setelah memperhitungkan retur tertunda', async () => {
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 20, sold: 5, returned: 2, price_per_unit: null },
    pendingClaims: 3,
  });
  const res = response();

  await operations.createPartnerSale(partnerRequest({ quantity: 4 }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.sale.quantity, 4);
  assert.equal(res.body.data.sale.unitPrice, 9000);
  assert.equal(res.body.data.sale.total, 36000);
  assert.equal(res.body.data.sale.remainingStock, 6);
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE partners SET sold = sold + $2') &&
    params[0] === 'p1' && params[1] === 4
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO partner_inventory_movements')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('penjualan yang melebihi stok tersedia ditolak tanpa menulis ledger', async () => {
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 10, sold: 6, returned: 1, price_per_unit: null },
    pendingClaims: 1,
  });

  await assert.rejects(
    operations.createPartnerSale(partnerRequest({ quantity: 3 }), response()),
    (error) => error.status === 409 && /tersedia di gerai \(2 butir\)/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE partners') ||
    sql.includes('INSERT INTO partner_sales') ||
    sql.includes('INSERT INTO partner_inventory_movements')
  ), false);
});

test('retur tertunda hanya dapat dibuat dalam batas stok yang belum terjual atau diklaim', async () => {
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 10, sold: 3, returned: 1, price_per_unit: null },
    pendingClaims: 2,
  });
  const res = response();

  await operations.createClaim(
    partnerRequest({ quantity: 3, photoUrl: 'https://storage.example/return.jpg' }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.claim.qty, 3);
  assert.equal(res.body.data.claim.status, 'menunggu');
  assert.equal(res.body.data.claim.photo_url, 'https://storage.example/return.jpg');
  assert.equal(fakeDb.state.committed, 1);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("INSERT INTO claims") && params[2] === 3
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('retur yang melebihi stok yang dapat diklaim ditolak tanpa membuat klaim', async () => {
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 10, sold: 3, returned: 1, price_per_unit: null },
    pendingClaims: 3,
  });

  await assert.rejects(
    operations.createClaim(partnerRequest({ quantity: 4 }), response()),
    (error) => error.status === 409 && /dapat diklaim \(3 butir\)/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO claims')), false);
});

test('konfirmasi retur memperbarui saldo dan mencatat mutasi serta audit', async () => {
  const claim = {
    id: 'claim-1',
    partner_id: 'p1',
    qty: 3,
    status: 'menunggu',
  };
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 10, sold: 3, returned: 1, price_per_unit: null },
    claim,
  });
  const res = response();

  await operations.reviewClaim(ownerClaimRequest(claim.id, 'dikonfirmasi'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.claim.status, 'dikonfirmasi');
  assert.equal(res.body.data.claim.reviewed_by, 'owner@example.id');
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE partners SET returned = returned + $2') &&
    params[0] === 'p1' && params[1] === 3
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO partner_inventory_movements') &&
    params[1] === 'p1' && params[2] === 'retur' &&
    params[3] === -3 && params[4] === claim.id
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('UPDATE claims SET status = $2')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('penolakan retur mengubah status dan audit tanpa mengubah saldo mitra', async () => {
  const claim = {
    id: 'claim-2',
    partner_id: 'p1',
    qty: 2,
    status: 'menunggu',
  };
  const queries = setupDatabase({ claim });
  const res = response();

  await operations.reviewClaim(ownerClaimRequest(claim.id, 'ditolak'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.claim.status, 'ditolak');
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('FROM partners WHERE id = $1') ||
    sql.includes('UPDATE partners') ||
    sql.includes('INSERT INTO partner_inventory_movements')
  ), false);
  assert.ok(queries.some(({ sql }) => sql.includes('UPDATE claims SET status = $2')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('konfirmasi retur ditolak dan di-rollback jika saldo berubah sebelum persetujuan', async () => {
  const claim = {
    id: 'claim-3',
    partner_id: 'p1',
    qty: 4,
    status: 'menunggu',
  };
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 10, sold: 8, returned: 1, price_per_unit: null },
    claim,
  });

  await assert.rejects(
    operations.reviewClaim(ownerClaimRequest(claim.id, 'dikonfirmasi'), response()),
    (error) => error.status === 409 && /tidak cukup/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE partners SET returned') ||
    sql.includes('INSERT INTO partner_inventory_movements') ||
    sql.includes('UPDATE claims SET status')
  ), false);
});

test('retur yang sudah diproses tidak dapat ditinjau ulang', async () => {
  const claim = {
    id: 'claim-4',
    partner_id: 'p1',
    qty: 1,
    status: 'ditolak',
  };
  const queries = setupDatabase({ claim });

  await assert.rejects(
    operations.reviewClaim(ownerClaimRequest(claim.id, 'dikonfirmasi'), response()),
    (error) => error.status === 409 && /sudah diproses/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE partners') ||
    sql.includes('INSERT INTO partner_inventory_movements') ||
    sql.includes('UPDATE claims SET status')
  ), false);
});

test('pesanan mitra dibuat menunggu untuk gerai dari sesi dan dicatat di audit', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.createOrder(
    partnerRequest({ quantity: 12, note: 'Restok akhir pekan' }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.order.partner_id, 'p1');
  assert.equal(res.body.data.order.qty, 12);
  assert.equal(res.body.data.order.note, 'Restok akhir pekan');
  assert.equal(res.body.data.order.status, 'menunggu');
  assert.equal(fakeDb.state.committed, 1);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO orders') &&
    params[1] === 'p1' && params[2] === 12
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
});

test('persetujuan pesanan membuat manifes dan mereservasi batch secara FEFO', async () => {
  const order = {
    id: 'order-1',
    partner_id: 'p1',
    qty: 8,
    status: 'menunggu',
  };
  const queries = setupDatabase({
    order,
    batches: [
      { id: 'batch-expiring-first', left_qty: 5 },
      { id: 'batch-expiring-later', left_qty: 10 },
    ],
    reservations: [{ batch_id: 'batch-expiring-first', reserved_qty: 2 }],
  });
  const res = response();

  await operations.reviewOrder(ownerOrderRequest(order.id, 'disetujui'), res);

  const allocations = queries
    .filter(({ sql }) => sql.includes('INSERT INTO manifest_batch_allocations'))
    .map(({ params }) => ({ batchId: params[1], quantity: params[2] }));
  const manifestInsert = queries.find(({ sql }) => sql.includes('INSERT INTO manifests'));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.order.status, 'disetujui');
  assert.equal(res.body.data.manifestId, manifestInsert.params[0]);
  assert.deepEqual(allocations, [
    { batchId: 'batch-expiring-first', quantity: 3 },
    { batchId: 'batch-expiring-later', quantity: 5 },
  ]);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE orders SET manifest_id') &&
    params[1] === order.id
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('UPDATE orders SET status = $2')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
});

test('persetujuan pesanan tanpa stok cukup di-rollback sebelum status pesanan berubah', async () => {
  const order = {
    id: 'order-2',
    partner_id: 'p1',
    qty: 4,
    status: 'menunggu',
  };
  const queries = setupDatabase({
    order,
    batches: [{ id: 'batch-1', left_qty: 5 }],
    reservations: [{ batch_id: 'batch-1', reserved_qty: 2 }],
  });

  await assert.rejects(
    operations.reviewOrder(ownerOrderRequest(order.id, 'disetujui'), response()),
    (error) => error.status === 409 && /cold storage.*tidak mencukupi/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO manifest_batch_allocations')));
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE orders SET manifest_id') ||
    sql.includes('UPDATE orders SET status = $2')
  ), false);
});

test('pesanan yang sudah diproses tidak dapat disetujui kembali', async () => {
  const order = {
    id: 'order-3',
    partner_id: 'p1',
    qty: 3,
    status: 'disetujui',
  };
  const queries = setupDatabase({ order });

  await assert.rejects(
    operations.reviewOrder(ownerOrderRequest(order.id, 'disetujui'), response()),
    (error) => error.status === 409 && /sudah diproses/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('INSERT INTO manifests') ||
    sql.includes('INSERT INTO manifest_batch_allocations') ||
    sql.includes('UPDATE orders SET status = $2')
  ), false);
});

test('pengantaran mengonsumsi batch terreservasi dan menambah pasokan gerai', async () => {
  const manifest = {
    id: 'manifest-1',
    partner_id: 'p1',
    qty: 5,
    is_done: false,
    cancelled_at: null,
    courier_email: 'courier@example.id',
  };
  const allocations = [
    { id: 1, batch_id: 'batch-1', quantity: 3, left_qty: 10 },
    { id: 2, batch_id: 'batch-2', quantity: 2, left_qty: 8 },
  ];
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 4, sold: 1, returned: 0, price_per_unit: null },
    manifest,
    allocations,
  });
  const res = response();

  await operations.confirmDelivery(
    courierManifestRequest(manifest.id, {
      photoUrl: 'https://storage.example/pod.jpg',
      latitude: -6.2,
      longitude: 106.8,
      receivedBy: 'PIC gerai',
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.manifest.is_done, true);
  assert.equal(res.body.data.manifest.photo_url, 'https://storage.example/pod.jpg');
  assert.equal(res.body.data.manifest.received_by, 'PIC gerai');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE batches SET left_qty = left_qty - $2') &&
    params[0] === 'batch-1' && params[1] === 3
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("UPDATE manifest_batch_allocations SET status = 'consumed'") &&
    params[0] === 1
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE partners SET sent = sent + $2') &&
    params[0] === 'p1' && params[1] === 5
  ));
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO partner_inventory_movements') &&
    params[2] === 'pengiriman' && params[3] === 5
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
});

test('pengantaran ditolak dan di-rollback jika alokasi batch tidak lengkap', async () => {
  const manifest = {
    id: 'manifest-2',
    partner_id: 'p1',
    qty: 5,
    is_done: false,
    cancelled_at: null,
    courier_email: 'courier@example.id',
  };
  const queries = setupDatabase({
    manifest,
    allocations: [{ id: 1, batch_id: 'batch-1', quantity: 4, left_qty: 10 }],
  });

  await assert.rejects(
    operations.confirmDelivery(
      courierManifestRequest(manifest.id, { photoUrl: 'https://storage.example/pod.jpg' }),
      response()
    ),
    (error) => error.status === 409 && /alokasi stok.*tidak lengkap/i.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('UPDATE batches') ||
    sql.includes('UPDATE partners SET sent') ||
    sql.includes('UPDATE manifests SET is_done')
  ), false);
});

test('owner dapat mengonfirmasi pengantaran untuk supervisi tanpa mengubah kurir yang ditugaskan', async () => {
  const manifest = {
    id: 'manifest-supervised',
    partner_id: 'p1',
    qty: 2,
    is_done: false,
    cancelled_at: null,
    courier_email: 'courier@example.id',
  };
  const queries = setupDatabase({
    manifest,
    allocations: [{ id: 1, batch_id: 'batch-1', quantity: 2, left_qty: 10 }],
  });
  const res = response();

  await operations.confirmDelivery({
    ...ownerManifestRequest(manifest.id),
    body: { photoUrl: 'https://storage.example/pod.jpg' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.manifest.is_done, true);
  assert.equal(res.body.data.manifest.courier_email, 'courier@example.id');
  assert.ok(queries.some(({ sql }) => sql.includes('COALESCE(courier_email, $6)')));
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
});

test('pembatalan manifes melepas reservasi dan mencatat audit', async () => {
  const manifest = {
    id: 'manifest-3',
    partner_id: 'p1',
    qty: 5,
    is_done: false,
    cancelled_at: null,
  };
  const queries = setupDatabase({ manifest });
  const res = response();

  await operations.cancelManifest(
    ownerManifestRequest(manifest.id),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.manifest.cancelled_by, 'owner@example.id');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("UPDATE manifest_batch_allocations SET status = 'cancelled'") &&
    params[0] === manifest.id
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('UPDATE manifests SET cancelled_by')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
  assert.equal(fakeDb.state.rolledBack, 0);
});

test('inventaris mitra menghitung stok tersedia dan pasokan masuk untuk gerai sesi', async () => {
  const queries = setupDatabase({
    partner: { id: 'p1', sent: 30, sold: 8, returned: 2, price_per_unit: null },
    pendingInventoryClaims: 4,
    incomingSupply: 12,
  });
  const res = response();

  await operations.getPartnerInventory(
    partnerReadRequest({}, { partnerId: 'p2' }),
    res
  );

  assert.equal(res.body.data.inventory.partnerId, 'p1');
  assert.equal(res.body.data.inventory.currentStock, 20);
  assert.equal(res.body.data.inventory.availableToReport, 16);
  assert.equal(res.body.data.inventory.pendingClaimQuantity, 4);
  assert.equal(res.body.data.inventory.incomingSupply, 12);
  assert.ok(queries.every(({ params }) => params[0] === 'p1'));
});

test('settlement mitra memakai total transaksi dan membatasi gerai serta rentang tanggal', async () => {
  const queries = setupDatabase({
    partner: {
      id: 'p1',
      name: 'Gerai Satu',
      sent: 30,
      sold: 8,
      returned: 2,
      price_per_unit: 8500,
    },
    salesAggregate: { quantity: 7, gross: '59500.00' },
    returnsAggregate: { quantity: 1 },
  });
  const res = response();

  await operations.getPartnerSettlement(
    partnerReadRequest(
      { from: '2026-11-01', to: '2026-11-09' },
      { partnerId: 'p2' }
    ),
    res
  );

  assert.deepEqual(res.body.data.settlement, {
    partnerId: 'p1',
    partnerName: 'Gerai Satu',
    from: '2026-11-01',
    to: '2026-11-09',
    soldQuantity: 7,
    returnedQuantity: 1,
    unitPrice: 8500,
    grossPayable: 59500,
    netPayable: 59500,
  });
  const salesQuery = queries.find(({ sql }) => sql.includes('FROM partner_sales WHERE'));
  const returnsQuery = queries.find(({ sql }) =>
    sql.includes('FROM claims WHERE') && sql.includes("status = 'dikonfirmasi'")
  );
  assert.deepEqual(salesQuery.params, ['p1', '2026-11-01', '2026-11-09']);
  assert.deepEqual(returnsQuery.params, ['p1', '2026-11-01', '2026-11-09']);
  assert.match(salesQuery.sql, /created_at >= \$2::date/);
  assert.match(salesQuery.sql, /created_at < \(\$3::date \+ INTERVAL '1 day'\)/);
});

test('daftar penjualan mitra difilter oleh gerai sesi dan tanggal yang diminta', async () => {
  const sales = [{
    id: 'sale-1',
    quantity: 3,
    unit_price: '8500.00',
    total: '25500.00',
    reported_by: 'mitra@example.id',
    created_at: '2026-11-05T10:00:00.000Z',
  }];
  const queries = setupDatabase({ partnerSales: sales });
  const res = response();

  await operations.listPartnerSales(
    partnerReadRequest(
      { from: '2026-11-01', to: '2026-11-09', limit: '10', offset: '0' },
      { partnerId: 'p2' }
    ),
    res
  );

  assert.deepEqual(res.body.data.sales, sales);
  const salesQuery = queries.find(({ sql }) => sql.includes('SELECT id, quantity, unit_price'));
  assert.deepEqual(salesQuery.params, ['p1', '2026-11-01', '2026-11-09', 10, 0]);
  assert.match(salesQuery.sql, /partner_id = \$1/);
  assert.match(salesQuery.sql, /created_at >= \$2::date/);
  assert.match(salesQuery.sql, /created_at < \(\$3::date \+ INTERVAL '1 day'\)/);
});

test('daftar pesanan mitra hanya mengambil gerai yang terikat ke sesi', async () => {
  const orders = [{
    id: 'order-p1',
    partner_id: 'p1',
    qty: 6,
    status: 'menunggu',
  }];
  const queries = setupDatabase({ partnerOrders: orders });
  const res = response();

  await operations.listOrders(
    partnerReadRequest({ limit: '20', offset: '0' }, { partnerId: 'p2' }),
    res
  );

  assert.deepEqual(res.body.data.orders, orders);
  const orderQuery = queries.find(({ sql }) => sql.includes('FROM orders o JOIN partners p'));
  assert.deepEqual(orderQuery.params, ['p1', 20, 0]);
  assert.match(orderQuery.sql, /WHERE o\.partner_id = \$1/);
});

test('daftar retur mitra hanya mengambil gerai yang terikat ke sesi', async () => {
  const claims = [{
    id: 'claim-p1',
    partner_id: 'p1',
    qty: 2,
    status: 'menunggu',
  }];
  const queries = setupDatabase({ partnerClaims: claims });
  const res = response();

  await operations.listClaims(
    partnerReadRequest({ limit: '5', offset: '0' }, { partnerId: 'p2' }),
    res
  );

  assert.deepEqual(res.body.data.claims, claims);
  const claimQuery = queries.find(({ sql }) => sql.includes('FROM claims c JOIN partners p'));
  assert.deepEqual(claimQuery.params, ['p1', 5, 0]);
  assert.match(claimQuery.sql, /WHERE c\.partner_id = \$1/);
});
