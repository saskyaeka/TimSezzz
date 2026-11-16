const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

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
  user = { email: 'staff@example.id', role: 'kitchen', partner_id: null },
  partner = { id: 'p1', name: 'Gerai Satu' },
  settings = [
    { key: 'partner_price', numeric_value: '9000' },
    { key: 'central_price', numeric_value: '12000' },
  ],
  duplicateUser = false,
  asset = null,
  duplicatePartner = false,
  batches = [],
  reservations = [],
} = {}) {
  const queries = [];
  const runQuery = async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO audit_logs')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT 1 FROM partners WHERE LOWER(name)')) {
      return { rows: duplicatePartner ? [{ '?column?': 1 }] : [] };
    }
    if (sql.includes('UPDATE partners SET')) {
      return {
        rows: [{
          id: params[0],
          name: 'Gerai Baru',
          type: 'Kedai',
          zone: 'Zona A',
          address: null,
          sent: 0,
          sold: 0,
          returned: 0,
          price_per_unit: params.find((value) => value === 9800) || null,
        }],
      };
    }
    if (sql.includes('pg_advisory_xact_lock')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO partners')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id, left_qty FROM batches')) {
      return { rows: batches };
    }
    if (sql.includes('SELECT batch_id, SUM(quantity)::int AS reserved_qty')) {
      return { rows: reservations };
    }
    if (sql.includes('INSERT INTO manifests')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO manifest_batch_allocations')) {
      return { rows: [] };
    }
    if (sql.includes('FROM business_settings WHERE key IN')) {
      return { rows: settings };
    }
    if (sql.includes('FROM partners WHERE id = $1')) {
      return { rows: partner ? [{ ...partner }] : [] };
    }
    if (sql.includes('SELECT email, role, partner_id FROM users WHERE LOWER(email)')) {
      return { rows: user ? [{ ...user }] : [] };
    }
    if (sql.includes('INSERT INTO users')) {
      if (duplicateUser) {
        throw Object.assign(new Error('duplicate user'), { code: '23505' });
      }
      return {
        rows: [{
          email: params[0],
          name: params[1],
          role: params[2],
          status: 'aktif',
          partner_id: params[4],
        }],
      };
    }
    if (sql.includes('UPDATE users SET role = $2')) {
      return {
        rows: [{
          email: params[0],
          role: params[1],
          status: params[2] || user.status || 'aktif',
          partner_id: params[3],
        }],
      };
    }
    if (sql.includes('INSERT INTO assets')) {
      return {
        rows: [{
          id: params[0],
          name: params[1],
          location: params[2],
          condition: params[3],
          writeoff_approved: false,
        }],
      };
    }
    if (sql.includes('UPDATE assets SET condition = COALESCE')) {
      return {
        rows: [{
          ...asset,
          condition: params[1] ?? asset.condition,
          name: params[2] ?? asset.name,
          location: params[3] ?? asset.location,
          writeoff_approved: params[1] === null ? asset.writeoff_approved : false,
        }],
      };
    }
    if (sql.includes('UPDATE assets SET writeoff_approved = TRUE')) {
      return {
        rows: asset && asset.condition === 'Tidak layak'
          ? [{ ...asset, writeoff_approved: true }]
          : [],
      };
    }
    if (sql.includes('INSERT INTO business_settings')) {
      const existing = settings.find((item) => item.key === params[0]);
      if (existing) existing.numeric_value = params[1];
      else settings.push({ key: params[0], numeric_value: params[1] });
      return { rows: [] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };
  fakeDb.state = {
    committed: 0,
    rolledBack: 0,
    query: runQuery,
    client: { query: runQuery },
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

function ownerRequest(body = {}, params = {}) {
  return {
    body,
    params,
    query: {},
    user: { role: 'owner', partnerId: null, email: 'owner@example.id' },
  };
}

test('owner membuat akun mitra aktif yang ditautkan ke gerai dan diaudit', async (t) => {
  const queries = setupDatabase();
  t.mock.method(bcrypt, 'hash', async () => 'secure-password-hash');
  const res = response();

  await operations.createUser(ownerRequest({
    name: 'Mitra Satu',
    email: ' MITRA@example.id ',
    password: 'PaSS1234',
    role: 'partner',
    partnerId: 'p1',
  }), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body.data.user, {
    email: 'mitra@example.id',
    name: 'Mitra Satu',
    role: 'partner',
    status: 'aktif',
    partner_id: 'p1',
  });
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO users') &&
    params[0] === 'mitra@example.id' &&
    params[2] === 'partner' &&
    params[3] === 'secure-password-hash' &&
    params[4] === 'p1'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('owner creation rejects public owner role', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.createUser(ownerRequest({
      name: 'Owner Dua',
      email: 'owner2@example.id',
      password: 'PaSS1234',
      role: 'owner',
    }), response()),
    (error) => error.status === 400 && /Role tidak valid/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});

test('owner tidak dapat mengubah akun yang sedang dipakai sendiri', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.updateUser(
      ownerRequest({ status: 'nonaktif' }, { email: 'OWNER@example.id' }),
      response()
    ),
    (error) => error.status === 400 && /tidak dapat mengubah akun sendiri/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});

test('akun owner lain tidak dapat diubah melalui endpoint manajemen staf', async () => {
  const queries = setupDatabase({
    user: { email: 'owner2@example.id', role: 'owner', partner_id: null },
  });

  await assert.rejects(
    operations.updateUser(
      ownerRequest({ status: 'nonaktif' }, { email: 'owner2@example.id' }),
      response()
    ),
    (error) => error.status === 403 && /Akun owner tidak dapat diubah/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('UPDATE users SET role = $2')), false);
});

test('perubahan akun mitra memperbarui status dan gerai dalam satu transaksi', async () => {
  const queries = setupDatabase({
    user: { email: 'staff@example.id', role: 'kitchen', partner_id: null },
  });
  const res = response();

  await operations.updateUser(
    ownerRequest(
      { role: 'partner', partnerId: 'p1', status: 'aktif' },
      { email: 'STAFF@example.id' }
    ),
    res
  );

  assert.deepEqual(res.body.data.user, {
    email: 'staff@example.id',
    role: 'partner',
    status: 'aktif',
    partner_id: 'p1',
  });
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE users SET role = $2') &&
    params[0] === 'staff@example.id' && params[1] === 'partner' &&
    params[2] === 'aktif' && params[3] === 'p1'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('owner hanya memperbarui harga mitra yang dikirim dan mempertahankan harga pusat', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.updatePrices(ownerRequest({ partnerPrice: 9500 }), res);

  assert.deepEqual(res.body.data.prices, {
    partner_price: 9500,
    central_price: 12000,
  });
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO business_settings') &&
    params[0] === 'partner_price' && params[1] === 9500
  ));
  assert.equal(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO business_settings') && params[0] === 'central_price'
  ), false);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('owner tidak dapat menetapkan harga nol atau negatif', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.updatePrices(ownerRequest({ centralPrice: 0 }), response()),
    (error) => error.status === 400 && /Harga kasir harus lebih dari nol/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});

test('duplikasi email saat membuat akun dikembalikan sebagai konflik', async (t) => {
  const queries = setupDatabase({ duplicateUser: true });
  t.mock.method(bcrypt, 'hash', async () => 'secure-password-hash');
  const res = response();

  await operations.createUser(ownerRequest({
    name: 'Staf Satu',
    email: 'staff@example.id',
    password: 'PaSS1234',
    role: 'kitchen',
  }), res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { success: false, message: 'Email sudah terdaftar.' });
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')), false);
  assert.equal(fakeDb.state.rolledBack, 1);
});

test('owner membuat aset dengan kondisi valid dan mencatat audit', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.createAsset(ownerRequest({
    id: 'ALT-010',
    name: 'Freezer tambahan',
    location: 'Gudang',
    condition: 'Baik',
  }), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body.data.asset, {
    id: 'ALT-010',
    name: 'Freezer tambahan',
    location: 'Gudang',
    condition: 'Baik',
    writeoff_approved: false,
  });
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO assets') &&
    params[0] === 'ALT-010' && params[3] === 'Baik'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('owner tidak dapat membuat aset dengan kondisi di luar pilihan', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.createAsset(ownerRequest({
      id: 'ALT-011',
      name: 'Freezer rusak',
      location: 'Gudang',
      condition: 'Rusak total',
    }), response()),
    (error) => error.status === 400 && /Kondisi aset tidak valid/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});

test('perubahan kondisi aset mereset status persetujuan write-off', async () => {
  const asset = {
    id: 'ALT-003',
    name: 'Mixer',
    location: 'Dapur',
    condition: 'Tidak layak',
    writeoff_approved: true,
  };
  const queries = setupDatabase({ asset });
  const res = response();

  await operations.updateAsset(
    ownerRequest({ condition: 'Layak' }, { assetId: asset.id }),
    res
  );

  assert.equal(res.body.data.asset.condition, 'Layak');
  assert.equal(res.body.data.asset.writeoff_approved, false);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('writeoff_approved = CASE WHEN $2 IS NULL THEN writeoff_approved ELSE FALSE END') &&
    params[0] === asset.id && params[1] === 'Layak'
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('owner dapat menyetujui write-off aset yang tidak layak', async () => {
  const asset = {
    id: 'ALT-004',
    name: 'Mixer rusak',
    location: 'Gudang',
    condition: 'Tidak layak',
    writeoff_approved: false,
  };
  const queries = setupDatabase({ asset });
  const res = response();

  await operations.approveAssetWriteoff(
    ownerRequest({}, { assetId: asset.id }),
    res
  );

  assert.equal(res.body.data.asset.writeoff_approved, true);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("WHERE id = $1 AND condition = 'Tidak layak'") &&
    params[0] === asset.id
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('write-off aset yang masih layak ditolak tanpa audit', async () => {
  const asset = {
    id: 'ALT-005',
    name: 'Freezer sehat',
    location: 'Gudang',
    condition: 'Baik',
    writeoff_approved: false,
  };
  const queries = setupDatabase({ asset });

  await assert.rejects(
    operations.approveAssetWriteoff(
      ownerRequest({}, { assetId: asset.id }),
      response()
    ),
    (error) => error.status === 409 && /Tidak layak/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')), false);
});

test('owner membuat gerai baru tanpa pasokan awal', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.createPartner(ownerRequest({
    name: 'Kedai Baru',
    type: 'Kedai kopi',
    zone: 'Zona Utara',
    pin: '1234',
    address: 'Jalan Melati',
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.partner.name, 'Kedai Baru');
  assert.equal(res.body.data.partner.initialManifestId, null);
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('INSERT INTO partners') &&
    params[1] === 'Kedai Baru' && params[4] === '1234' &&
    params[5] === 'Jalan Melati'
  ));
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO manifests')), false);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('nama gerai yang sudah digunakan ditolak tanpa insert', async () => {
  const queries = setupDatabase({ duplicatePartner: true });

  await assert.rejects(
    operations.createPartner(ownerRequest({
      name: 'Kedai Lama',
      type: 'Kedai',
      zone: 'Zona Utara',
      pin: '1234',
    }), response()),
    (error) => error.status === 409 && /Nama gerai sudah terdaftar/.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.equal(queries.some(({ sql }) =>
    sql.includes('INSERT INTO partners') || sql.includes('INSERT INTO audit_logs')
  ), false);
});

test('PIN gerai harus tepat empat angka', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.createPartner(ownerRequest({
      name: 'Kedai Baru',
      type: 'Kedai',
      zone: 'Zona Utara',
      pin: '12ab',
    }), response()),
    (error) => error.status === 400 && /PIN gerai harus terdiri dari 4 angka/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});

test('pasokan awal gerai membuat manifes dan reservasi batch', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 10 }],
    reservations: [],
  });
  const res = response();

  await operations.createPartner(ownerRequest({
    name: 'Kedai Dengan Stok',
    type: 'Kedai kopi',
    zone: 'Zona Selatan',
    pin: '5678',
    initialQty: 6,
  }), res);

  const manifest = queries.find(({ sql }) => sql.includes('INSERT INTO manifests'));
  const allocation = queries.find(({ sql }) => sql.includes('INSERT INTO manifest_batch_allocations'));
  assert.ok(manifest);
  assert.equal(manifest.params[1], res.body.data.partner.id);
  assert.equal(manifest.params[2], 6);
  assert.equal(allocation.params[1], 'batch-1');
  assert.equal(allocation.params[2], 6);
  assert.equal(res.body.data.partner.initialManifestId, manifest.params[0]);
  assert.equal(fakeDb.state.committed, 1);
});

test('pasokan awal tanpa stok batch cukup membatalkan pembuatan gerai', async () => {
  const queries = setupDatabase({
    batches: [{ id: 'batch-1', left_qty: 5 }],
    reservations: [{ batch_id: 'batch-1', reserved_qty: 2 }],
  });

  await assert.rejects(
    operations.createPartner(ownerRequest({
      name: 'Kedai Tanpa Batch',
      type: 'Kedai kopi',
      zone: 'Zona Selatan',
      pin: '9876',
      initialQty: 4,
    }), response()),
    (error) => error.status === 409 && /cold storage yang belum dialokasikan tidak mencukupi/i.test(error.message)
  );

  assert.equal(fakeDb.state.committed, 0);
  assert.equal(fakeDb.state.rolledBack, 1);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO partners')));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO manifests')));
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')), false);
});

test('owner mengubah metadata dan harga gerai dalam satu update', async () => {
  const queries = setupDatabase();
  const res = response();

  await operations.updatePartner(
    ownerRequest(
      { zone: 'Zona Barat', pricePerUnit: 9800, address: 'Alamat baru' },
      { partnerId: 'p1' }
    ),
    res
  );

  assert.equal(res.body.data.partner.id, 'p1');
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes('UPDATE partners SET') &&
    sql.includes('zone = $2') &&
    sql.includes('address = $3') &&
    sql.includes('price_per_unit = $4') &&
    params[0] === 'p1' &&
    params[1] === 'Zona Barat' &&
    params[2] === 'Alamat baru' &&
    params[3] === 9800
  ));
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
  assert.equal(fakeDb.state.committed, 1);
});

test('harga per gerai harus lebih dari nol', async () => {
  const queries = setupDatabase();

  await assert.rejects(
    operations.updatePartner(
      ownerRequest({ pricePerUnit: 0 }, { partnerId: 'p1' }),
      response()
    ),
    (error) => error.status === 400 && /Harga mitra harus lebih dari nol/.test(error.message)
  );

  assert.equal(queries.length, 0);
  assert.equal(fakeDb.state.committed, 0);
});
