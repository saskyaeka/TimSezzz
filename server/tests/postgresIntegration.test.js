const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { Pool } = require('pg');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

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

test('alur pesanan mitra memakai PostgreSQL dan rollback transaksi nyata', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL ke database PostgreSQL khusus untuk menjalankan tes ini.',
}, async () => {
  const parsedUrl = new URL(testDatabaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(parsedUrl.protocol), 'TEST_DATABASE_URL harus memakai PostgreSQL.');
  assert.ok(parsedUrl.pathname.length > 1, 'TEST_DATABASE_URL harus menyebut database tes secara eksplisit.');
  assert.match(
    decodeURIComponent(parsedUrl.pathname.slice(1)),
    /^(test|.+_test|.+_testdb)$/i,
    'Nama database TEST_DATABASE_URL harus menandakan database khusus tes.'
  );

  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl, application_name: 'TimSezzz integration setup' });
  const databasePath = require.resolve('../src/config/db');
  const controllerPath = require.resolve('../src/controllers/operationsController');
  const originalDatabaseModule = require.cache[databasePath];
  const originalControllerModule = require.cache[controllerPath];
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let adminClient;
  let appDb;
  let schemaCreated = false;

  try {
    adminClient = await adminPool.connect();
    await adminClient.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await adminClient.query(`SET search_path TO "${schema}"`);

    const root = path.resolve(__dirname, '../..');
    const baseSchema = fs.readFileSync(path.join(root, 'docs', 'database_scheme.sql'), 'utf8');
    const operationsSchema = fs.readFileSync(
      path.join(root, 'server', 'src', 'db', 'operations_schema.sql'),
      'utf8'
    );
    await adminClient.query(baseSchema);
    await adminClient.query(operationsSchema);
    const { rows: emailIndexRows } = await adminClient.query(
      `SELECT to_regclass('users_email_lower_idx') AS index_name`
    );
    assert.equal(emailIndexRows[0].index_name, 'users_email_lower_idx');
    await adminClient.query(
      `INSERT INTO partners (id, name, type, zone, pin) VALUES ('integration-partner', 'Integration Partner', 'Kedai', 'Test', '1234');
       INSERT INTO users (email, name, role, password_hash, status, partner_id)
       VALUES ('owner@integration.test', 'Test Owner', 'owner', 'unused', 'aktif', NULL),
              ('partner@integration.test', 'Test Partner', 'partner', 'unused', 'aktif', 'integration-partner'),
              ('cashier@integration.test', 'Test Cashier', 'pos', 'unused', 'aktif', NULL),
              ('cashier2@integration.test', 'Test Cashier 2', 'pos', 'unused', 'aktif', NULL);
       INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
       VALUES ('integration-batch', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 8, 8),
              ('pos-batch', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 6, 6);`
    );

    const scopedUrl = new URL(testDatabaseUrl);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();
    delete require.cache[databasePath];
    delete require.cache[controllerPath];
    appDb = require('../src/config/db');
    const operations = require('../src/controllers/operationsController');

    const partnerRequest = {
      body: { quantity: 5 },
      params: {},
      query: {},
      user: { role: 'partner', partnerId: 'integration-partner', email: 'partner@integration.test' },
    };
    const createdOrderResponse = response();
    await operations.createOrder(partnerRequest, createdOrderResponse);
    assert.equal(createdOrderResponse.statusCode, 201);
    const successfulOrderId = createdOrderResponse.body.data.order.id;

    const approvalResponse = response();
    await operations.reviewOrder({
      body: { decision: 'disetujui' },
      params: { orderId: successfulOrderId },
      query: {},
      user: { role: 'owner', partnerId: null, email: 'owner@integration.test' },
    }, approvalResponse);
    assert.equal(approvalResponse.statusCode, 200);
    assert.equal(approvalResponse.body.data.order.status, 'disetujui');

    const failedOrderResponse = response();
    await operations.createOrder({ ...partnerRequest, body: { quantity: 10 } }, failedOrderResponse);
    const failedOrderId = failedOrderResponse.body.data.order.id;
    await assert.rejects(
      operations.reviewOrder({
        body: { decision: 'disetujui' },
        params: { orderId: failedOrderId },
        query: {},
        user: { role: 'owner', partnerId: null, email: 'owner@integration.test' },
      }, response()),
      (error) => error.status === 409
    );

    const { rows } = await adminClient.query(
      `SELECT o.status, o.manifest_id,
         (SELECT COUNT(*)::int FROM manifests) AS manifest_count,
         (SELECT COUNT(*)::int FROM manifest_batch_allocations) AS allocation_count,
         (SELECT left_qty FROM batches WHERE id = 'integration-batch') AS batch_quantity
       FROM orders o WHERE o.id = $1`,
      [failedOrderId]
    );
    assert.equal(rows[0].status, 'menunggu');
    assert.equal(rows[0].manifest_id, null);
    assert.equal(rows[0].manifest_count, 1);
    assert.equal(rows[0].allocation_count, 1);
    assert.equal(rows[0].batch_quantity, 8);

    const cashierRequest = {
      body: { openingCash: 50000 },
      params: {},
      query: {},
      user: { role: 'pos', partnerId: null, email: 'cashier@integration.test' },
    };
    const shiftResponse = response();
    await operations.openShift(cashierRequest, shiftResponse);
    assert.equal(shiftResponse.statusCode, 201);
    const shiftId = shiftResponse.body.data.shift.id;

    await assert.rejects(
      operations.checkout({
        ...cashierRequest,
        body: {
          paymentMethod: 'qris',
          items: [{ productId: 'pack6', quantity: 2 }],
        },
      }, response()),
      (error) => error.status === 409
    );

    const successfulSaleResponse = response();
    await operations.checkout({
      ...cashierRequest,
      body: {
        paymentMethod: 'tunai',
        receivedAmount: 70000,
        items: [{ productId: 'pack6', quantity: 1 }],
      },
    }, successfulSaleResponse);
    assert.equal(successfulSaleResponse.statusCode, 201);
    assert.equal(successfulSaleResponse.body.data.sale.total, 66000);
    assert.equal(successfulSaleResponse.body.data.sale.changeAmount, 4000);

    const posRows = await adminClient.query(
      `SELECT
         (SELECT COUNT(*)::int FROM pos_sales WHERE shift_id = $1) AS sale_count,
         (SELECT COUNT(*)::int FROM pos_sale_items) AS item_count,
         (SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'pos_sale') AS sale_audit_count,
         (SELECT left_qty FROM batches WHERE id = 'integration-batch') AS reserved_batch_quantity,
         (SELECT left_qty FROM batches WHERE id = 'pos-batch') AS pos_batch_quantity`,
      [shiftId]
    );
    assert.equal(posRows.rows[0].sale_count, 1);
    assert.equal(posRows.rows[0].item_count, 1);
    assert.equal(posRows.rows[0].sale_audit_count, 1);
    assert.equal(posRows.rows[0].reserved_batch_quantity, 5);
    assert.equal(posRows.rows[0].pos_batch_quantity, 3);

    await adminClient.query(
      `INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
       VALUES ('concurrent-batch', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 3, 3)`
    );
    const secondCashierRequest = {
      ...cashierRequest,
      user: { ...cashierRequest.user, email: 'cashier2@integration.test' },
    };
    const secondShiftResponse = response();
    await operations.openShift(secondCashierRequest, secondShiftResponse);
    assert.equal(secondShiftResponse.statusCode, 201);

    const concurrentCheckouts = await Promise.allSettled(
      [cashierRequest, secondCashierRequest].map((request) => operations.checkout({
        ...request,
        body: {
          paymentMethod: 'qris',
          items: [{ productId: 'pack6', quantity: 1 }],
        },
      }, response()))
    );
    assert.equal(concurrentCheckouts.filter((result) => result.status === 'fulfilled').length, 1);
    const rejectedCheckouts = concurrentCheckouts.filter((result) => result.status === 'rejected');
    assert.equal(rejectedCheckouts.length, 1);
    assert.equal(rejectedCheckouts[0].reason.status, 409);

    const concurrencyRows = await adminClient.query(
      `SELECT
         (SELECT COUNT(*)::int FROM pos_sales WHERE shift_id IN ($1, $2)) AS sale_count,
         (SELECT COUNT(*)::int FROM pos_sale_items) AS item_count,
         (SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'pos_sale') AS sale_audit_count,
         (SELECT left_qty FROM batches WHERE id = 'integration-batch') AS reserved_batch_quantity,
         (SELECT left_qty FROM batches WHERE id = 'pos-batch') AS pos_batch_quantity,
         (SELECT left_qty FROM batches WHERE id = 'concurrent-batch') AS concurrent_batch_quantity`,
      [shiftId, secondShiftResponse.body.data.shift.id]
    );
    assert.equal(concurrencyRows.rows[0].sale_count, 2);
    assert.equal(concurrencyRows.rows[0].item_count, 2);
    assert.equal(concurrencyRows.rows[0].sale_audit_count, 2);
    assert.equal(concurrencyRows.rows[0].reserved_batch_quantity, 5);
    assert.equal(concurrencyRows.rows[0].pos_batch_quantity, 0);
    assert.equal(concurrencyRows.rows[0].concurrent_batch_quantity, 0);
  } finally {
    try {
      if (appDb) await appDb.close();
    } finally {
      if (originalControllerModule) require.cache[controllerPath] = originalControllerModule;
      else delete require.cache[controllerPath];
      if (originalDatabaseModule) require.cache[databasePath] = originalDatabaseModule;
      else delete require.cache[databasePath];
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      try {
        if (schemaCreated && adminClient) {
          await adminClient.query('RESET search_path');
          await adminClient.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        if (adminClient) adminClient.release();
        await adminPool.end();
      }
    }
  }
});
