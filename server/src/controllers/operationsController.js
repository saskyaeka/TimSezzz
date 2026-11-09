const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const db = require('../config/db');
const { assert } = require('../utils/httpError');
const { date, decimal, enumValue, integer, pagination, text } = require('../utils/operationsValidation');

const ID = () => randomUUID();
const ROLES = ['owner', 'kitchen', 'pos', 'courier', 'partner'];

async function audit(client, req, action, entityType, entityId, details = {}) {
  await client.query(
    `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.email, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function getPartner(client, partnerId, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT id, name, type, zone, address, sent, sold, returned, price_per_unit
     FROM partners WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [partnerId]
  );
  assert(rows[0], 404, 'Gerai mitra tidak ditemukan.');
  return rows[0];
}

async function getAvailableBatches(client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['paolotory-cold-stock']);
  const { rows: batches } = await client.query(
    `SELECT id, left_qty FROM batches WHERE left_qty > 0 AND exp_date >= CURRENT_DATE
     ORDER BY exp_date ASC, made_date ASC, id ASC FOR UPDATE`
  );
  const { rows: reservations } = await client.query(
    `SELECT batch_id, SUM(quantity)::int AS reserved_qty
     FROM manifest_batch_allocations WHERE status = 'pending'
     GROUP BY batch_id`
  );
  const reservedByBatch = new Map(reservations.map((item) => [item.batch_id, item.reserved_qty]));
  return batches.map((batch) => ({
    ...batch,
    reserved_qty: reservedByBatch.get(batch.id) || 0,
  }));
}

async function allocateBatches(client, manifestId, quantity) {
  const batches = await getAvailableBatches(client);
  let remaining = quantity;
  for (const batch of batches) {
    const available = batch.left_qty - batch.reserved_qty;
    const allocated = Math.min(available, remaining);
    if (allocated <= 0) continue;
    await client.query(
      `INSERT INTO manifest_batch_allocations (manifest_id, batch_id, quantity)
       VALUES ($1, $2, $3)`,
      [manifestId, batch.id, allocated]
    );
    remaining -= allocated;
    if (remaining === 0) break;
  }
  assert(remaining === 0, 409, 'Stok cold storage yang belum dialokasikan tidak mencukupi.');
}

async function availableCold(client) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(b.left_qty - COALESCE(r.reserved_qty, 0)), 0)::int AS quantity
     FROM batches b
     LEFT JOIN (
       SELECT batch_id, SUM(quantity)::int AS reserved_qty
       FROM manifest_batch_allocations WHERE status = 'pending' GROUP BY batch_id
     ) r ON r.batch_id = b.id
     WHERE b.exp_date >= CURRENT_DATE`
  );
  return rows[0].quantity;
}

async function recordPartnerMovement(client, req, partnerId, type, delta, referenceId) {
  await client.query(
    `INSERT INTO partner_inventory_movements
       (id, partner_id, movement_type, quantity_delta, reference_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ID(), partnerId, type, delta, referenceId, req.user.email]
  );
}

async function createManifest(client, req, partnerId, quantity, orderId = null) {
  const manifestId = ID();
  await client.query(
    `INSERT INTO manifests (id, partner_id, qty, is_done, courier_email)
     VALUES ($1, $2, $3, FALSE, $4)`,
    [manifestId, partnerId, quantity, null]
  );
  await allocateBatches(client, manifestId, quantity);
  if (orderId) {
    await client.query('UPDATE orders SET manifest_id = $1 WHERE id = $2', [manifestId, orderId]);
  }
  await audit(client, req, 'manifest.created', 'manifest', manifestId, { partnerId, quantity });
  return manifestId;
}

async function readSettings(client) {
  const { rows } = await client.query('SELECT key, numeric_value FROM business_settings');
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.numeric_value)]));
}

async function setSetting(client, req, key, value) {
  await client.query(
    `INSERT INTO business_settings (key, numeric_value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET numeric_value = EXCLUDED.numeric_value,
       updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [key, value, req.user.email]
  );
}

async function dashboard(req, res) {
  const [inventory, partners, claims, orders, ingredients] = await Promise.all([
    db.query(
      `SELECT COALESCE((SELECT SUM(left_qty) FROM batches), 0)::int AS cold_stock,
       COALESCE((SELECT SUM(qty) FROM manifests WHERE is_done = FALSE AND cancelled_at IS NULL), 0)::int AS in_transit`
    ),
    db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(sent - sold - returned), 0)::int AS floating_stock,
       COALESCE(SUM(sent), 0)::int AS sent, COALESCE(SUM(sold), 0)::int AS sold,
       COALESCE(SUM(returned), 0)::int AS returned FROM partners`
    ),
    db.query(`SELECT COUNT(*)::int AS count FROM claims WHERE status = 'menunggu'`),
    db.query(`SELECT COUNT(*)::int AS count FROM orders WHERE status = 'menunggu'`),
    db.query(`SELECT COUNT(*)::int AS count FROM ingredients WHERE stock <= rop`),
  ]);
  return res.json({
    success: true,
    data: {
      inventory: inventory.rows[0],
      availableColdStock: await availableCold(db),
      network: partners.rows[0],
      pendingClaims: claims.rows[0].count,
      pendingOrders: orders.rows[0].count,
      ingredientsToReorder: ingredients.rows[0].count,
    },
  });
}

async function listAuditLogs(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT id, actor_email, action, entity_type, entity_id, details, created_at
     FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { auditLogs: rows } });
}

async function listPartners(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.type, p.zone, p.address, p.sent, p.sold, p.returned,
       COALESCE(p.price_per_unit, s.numeric_value)::numeric AS price_per_unit,
       p.sent - p.sold - p.returned AS current_stock
     FROM partners p CROSS JOIN business_settings s
     WHERE s.key = 'partner_price'
     ORDER BY p.name LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { partners: rows } });
}

async function createPartner(req, res) {
  const name = text(req.body?.name, 'Nama gerai', { min: 3, max: 100 });
  const type = text(req.body?.type, 'Jenis gerai', { max: 50 });
  const zone = text(req.body?.zone, 'Zona', { max: 50 });
  const pin = text(req.body?.pin, 'PIN gerai', { min: 4, max: 4 });
  assert(/^\d{4}$/.test(pin), 400, 'PIN gerai harus terdiri dari 4 angka.');
  const address = text(req.body?.address, 'Alamat', { max: 500, optional: true });
  const initialQty = integer(req.body?.initialQty ?? 0, 'Pasokan awal');
  const id = `p-${ID()}`;
  const result = await db.transaction(async (client) => {
    const { rows: duplicate } = await client.query('SELECT 1 FROM partners WHERE LOWER(name) = LOWER($1)', [name]);
    assert(!duplicate.length, 409, 'Nama gerai sudah terdaftar.');
    await client.query(
      `INSERT INTO partners (id, name, type, zone, pin, address, sent, sold, returned)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0)`,
      [id, name, type, zone, pin, address]
    );
    let manifestId = null;
    if (initialQty > 0) manifestId = await createManifest(client, req, id, initialQty);
    await audit(client, req, 'partner.created', 'partner', id, { name, initialQty });
    return { id, name, type, zone, address, initialManifestId: manifestId };
  });
  return res.status(201).json({ success: true, data: { partner: result } });
}

async function updatePartner(req, res) {
  const partnerId = text(req.params.partnerId, 'ID mitra', { max: 50 });
  const fields = [];
  const values = [partnerId];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (req.body?.name !== undefined) add('name', text(req.body.name, 'Nama gerai', { min: 3, max: 100 }));
  if (req.body?.type !== undefined) add('type', text(req.body.type, 'Jenis gerai', { max: 50 }));
  if (req.body?.zone !== undefined) add('zone', text(req.body.zone, 'Zona', { max: 50 }));
  if (req.body?.address !== undefined) add('address', text(req.body.address, 'Alamat', { max: 500, optional: true }));
  if (req.body?.pin !== undefined) {
    const pin = text(req.body.pin, 'PIN gerai', { min: 4, max: 4 });
    assert(/^\d{4}$/.test(pin), 400, 'PIN gerai harus terdiri dari 4 angka.');
    add('pin', pin);
  }
  if (req.body?.pricePerUnit !== undefined) {
    const price = decimal(req.body.pricePerUnit, 'Harga mitra');
    assert(price > 0, 400, 'Harga mitra harus lebih dari nol.');
    add('price_per_unit', price);
  }
  assert(fields.length > 0, 400, 'Tidak ada perubahan yang dikirim.');
  fields.push('updated_at = CURRENT_TIMESTAMP');
  const partner = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE partners SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, name, type, zone, address, sent, sold, returned, price_per_unit`,
      values
    );
    assert(rows[0], 404, 'Gerai mitra tidak ditemukan.');
    await audit(client, req, 'partner.updated', 'partner', partnerId, { fields: Object.keys(req.body) });
    return rows[0];
  });
  return res.json({ success: true, data: { partner } });
}

async function listUsers(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT u.email, u.name, u.role, u.status, u.partner_id, p.name AS partner_name
     FROM users u LEFT JOIN partners p ON p.id = u.partner_id
     ORDER BY u.name LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { users: rows } });
}

async function createUser(req, res) {
  const name = text(req.body?.name, 'Nama pengguna', { min: 2, max: 100 });
  const email = text(req.body?.email, 'Email', { max: 100 }).toLowerCase();
  assert(email.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Format email tidak valid.');
  const password = req.body?.password;
  assert(typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password), 400, 'Kata sandi minimal 8 karakter dan harus berisi huruf serta angka.');
  assert(Buffer.byteLength(password, 'utf8') <= 72, 400, 'Kata sandi tidak boleh lebih dari 72 byte.');
  const role = enumValue(req.body?.role, 'Role', ROLES.filter((item) => item !== 'owner'));
  const partnerId = role === 'partner' ? text(req.body?.partnerId, 'ID gerai', { max: 50 }) : null;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await db.transaction(async (client) => {
      if (partnerId) await getPartner(client, partnerId);
      const { rows: inserted } = await client.query(
        `INSERT INTO users (email, name, role, password_hash, status, partner_id)
         VALUES ($1, $2, $3, $4, 'aktif', $5)
         RETURNING email, name, role, status, partner_id`,
        [email, name, role, passwordHash, partnerId]
      );
      await audit(client, req, 'user.created', 'user', email, { role, partnerId });
      return { rows: inserted };
    });
    return res.status(201).json({ success: true, data: { user: rows[0] } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    throw error;
  }
}

async function updateUser(req, res) {
  const email = text(req.params.email, 'Email', { max: 100 }).toLowerCase();
  assert(email !== req.user.email, 400, 'Anda tidak dapat mengubah akun sendiri.');
  const role = req.body?.role === undefined ? undefined : enumValue(req.body.role, 'Role', ROLES);
  const status = req.body?.status === undefined ? undefined : enumValue(req.body.status, 'Status', ['aktif', 'nonaktif', 'pending']);
  const partnerId = req.body?.partnerId === undefined ? undefined : text(req.body.partnerId, 'ID gerai', { max: 50, optional: true });
  assert(role !== undefined || status !== undefined || partnerId !== undefined, 400, 'Tidak ada perubahan yang dikirim.');

  const { rows } = await db.transaction(async (client) => {
    const { rows: currentRows } = await client.query('SELECT email, role, partner_id FROM users WHERE LOWER(email) = $1 FOR UPDATE', [email]);
    const current = currentRows[0];
    assert(current, 404, 'Pengguna tidak ditemukan.');
    assert(current.role !== 'owner', 403, 'Akun owner tidak dapat diubah melalui endpoint ini.');
    const nextRole = role || current.role;
    const nextPartner = partnerId === undefined ? current.partner_id : partnerId;
    assert(nextRole === 'partner' ? Boolean(nextPartner) : !partnerId, 400, 'Role mitra wajib memiliki gerai; role lain tidak boleh memiliki gerai.');
    if (nextRole === 'partner') await getPartner(client, nextPartner);

    const { rows: updated } = await client.query(
      `UPDATE users SET role = $2, status = COALESCE($3, status), partner_id = $4
       WHERE email = $1 RETURNING email, name, role, status, partner_id`,
      [current.email, nextRole, status ?? null, nextRole === 'partner' ? nextPartner : null]
    );
    await audit(client, req, 'user.updated', 'user', current.email, { role: nextRole, status, partnerId: nextPartner });
    return { rows: updated };
  });
  return res.json({ success: true, data: { user: rows[0] } });
}

async function getPrices(req, res) {
  const { rows } = await db.query(
    `SELECT key, numeric_value FROM business_settings WHERE key IN ('partner_price', 'central_price')
     ORDER BY key`
  );
  const prices = Object.fromEntries(rows.map((row) => [row.key, Number(row.numeric_value)]));
  return res.json({ success: true, data: { prices } });
}

async function updatePrices(req, res) {
  const partnerPrice = req.body?.partnerPrice === undefined ? null : decimal(req.body.partnerPrice, 'Harga mitra');
  const centralPrice = req.body?.centralPrice === undefined ? null : decimal(req.body.centralPrice, 'Harga kasir');
  assert(partnerPrice !== null || centralPrice !== null, 400, 'Harga yang akan diubah wajib dikirim.');
  assert(partnerPrice === null || partnerPrice > 0, 400, 'Harga mitra harus lebih dari nol.');
  assert(centralPrice === null || centralPrice > 0, 400, 'Harga kasir harus lebih dari nol.');
  await db.transaction(async (client) => {
    if (partnerPrice !== null) await setSetting(client, req, 'partner_price', partnerPrice);
    if (centralPrice !== null) await setSetting(client, req, 'central_price', centralPrice);
    await audit(client, req, 'prices.updated', 'business_settings', null, { partnerPrice, centralPrice });
  });
  return getPrices(req, res);
}

async function listAssets(req, res) {
  const { rows } = await db.query('SELECT * FROM assets ORDER BY id');
  return res.json({ success: true, data: { assets: rows } });
}

async function createAsset(req, res) {
  const id = text(req.body?.id, 'ID aset', { max: 50 });
  const name = text(req.body?.name, 'Nama aset', { max: 150 });
  const location = text(req.body?.location, 'Lokasi aset', { max: 150 });
  const condition = enumValue(req.body?.condition, 'Kondisi aset', ['Baik', 'Layak', 'Tidak layak']);
  const asset = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO assets (id, name, location, condition)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, name, location, condition]
    );
    await audit(client, req, 'asset.created', 'asset', id, { name, condition });
    return rows[0];
  });
  return res.status(201).json({ success: true, data: { asset } });
}

async function updateAsset(req, res) {
  const id = text(req.params.assetId, 'ID aset', { max: 50 });
  const condition = req.body?.condition === undefined
    ? undefined : enumValue(req.body.condition, 'Kondisi aset', ['Baik', 'Layak', 'Tidak layak']);
  const name = req.body?.name === undefined ? undefined : text(req.body.name, 'Nama aset', { max: 150 });
  const location = req.body?.location === undefined ? undefined : text(req.body.location, 'Lokasi aset', { max: 150 });
  assert(condition !== undefined || name !== undefined || location !== undefined, 400, 'Tidak ada perubahan yang dikirim.');
  const asset = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE assets SET condition = COALESCE($2, condition), name = COALESCE($3, name),
         location = COALESCE($4, location), last_inspected_at = CASE WHEN $2 IS NULL THEN last_inspected_at ELSE CURRENT_TIMESTAMP END,
         writeoff_approved = CASE WHEN $2 IS NULL THEN writeoff_approved ELSE FALSE END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, condition ?? null, name ?? null, location ?? null]
    );
    assert(rows[0], 404, 'Aset tidak ditemukan.');
    await audit(client, req, 'asset.updated', 'asset', id, { condition, name, location });
    return rows[0];
  });
  return res.json({ success: true, data: { asset } });
}

async function approveAssetWriteoff(req, res) {
  const id = text(req.params.assetId, 'ID aset', { max: 50 });
  const asset = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE assets SET writeoff_approved = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND condition = 'Tidak layak' RETURNING *`,
      [id]
    );
    assert(rows[0], 409, 'Aset hanya dapat dihapus setelah kondisinya ditetapkan Tidak layak.');
    await audit(client, req, 'asset.writeoff_approved', 'asset', id);
    return rows[0];
  });
  return res.json({ success: true, data: { asset } });
}

async function listIngredients(req, res) {
  const { rows } = await db.query(
    `SELECT i.id, i.name, i.unit, i.stock, i.rop, i.price,
       (i.stock <= i.rop) AS needs_reorder
     FROM ingredients i ORDER BY i.name`
  );
  return res.json({ success: true, data: { ingredients: rows } });
}

async function createIngredient(req, res) {
  const id = text(req.body?.id, 'ID bahan', { max: 50 });
  const name = text(req.body?.name, 'Nama bahan', { max: 100 });
  const unit = text(req.body?.unit, 'Satuan', { max: 10 });
  const stock = decimal(req.body?.stock ?? 0, 'Stok awal');
  const rop = decimal(req.body?.rop ?? 0, 'Reorder point');
  const price = decimal(req.body?.price, 'Harga beli');
  const ingredient = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO ingredients (id, name, unit, stock, rop, price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, unit, stock, rop, price`,
      [id, name, unit, stock, rop, price]
    );
    if (stock > 0) {
      await client.query(
        `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, created_by)
         VALUES ($1, $2, $3, 'stok_awal', $4)`,
        [ID(), id, stock, req.user.email]
      );
    }
    await audit(client, req, 'ingredient.created', 'ingredient', id, { stock, rop, price });
    return rows[0];
  });
  return res.status(201).json({ success: true, data: { ingredient } });
}

async function updateIngredient(req, res) {
  const id = text(req.params.ingredientId, 'ID bahan', { max: 50 });
  const name = req.body?.name === undefined ? null : text(req.body.name, 'Nama bahan', { max: 100 });
  const unit = req.body?.unit === undefined ? null : text(req.body.unit, 'Satuan', { max: 10 });
  const rop = req.body?.rop === undefined ? null : decimal(req.body.rop, 'Reorder point');
  const price = req.body?.price === undefined ? null : decimal(req.body.price, 'Harga beli');
  assert(name !== null || unit !== null || rop !== null || price !== null, 400, 'Tidak ada perubahan yang dikirim.');
  const ingredient = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE ingredients SET name = COALESCE($2, name), unit = COALESCE($3, unit),
         rop = COALESCE($4, rop), price = COALESCE($5, price)
       WHERE id = $1 RETURNING id, name, unit, stock, rop, price`,
      [id, name, unit, rop, price]
    );
    assert(rows[0], 404, 'Bahan baku tidak ditemukan.');
    await audit(client, req, 'ingredient.updated', 'ingredient', id, { name, unit, rop, price });
    return rows[0];
  });
  return res.json({ success: true, data: { ingredient } });
}

async function getRecipe(req, res) {
  const [settings, ingredients] = await Promise.all([
    readSettings(db),
    db.query(
      `SELECT b.ingredient_id, i.name, i.unit, b.quantity, i.stock, i.price
       FROM bill_of_materials b JOIN ingredients i ON i.id = b.ingredient_id
       ORDER BY i.name`
    ),
  ]);
  return res.json({
    success: true,
    data: {
      recipe: {
        yield: settings.production_yield,
        opex: settings.production_opex,
        items: ingredients.rows,
      },
    },
  });
}

async function updateRecipe(req, res) {
  const yieldQty = integer(req.body?.yield, 'Hasil per resep', { min: 1, max: 100000 });
  const opex = decimal(req.body?.opex, 'Biaya operasional');
  assert(Array.isArray(req.body?.items) && req.body.items.length > 0, 400, 'Daftar bahan resep wajib diisi.');
  const entries = req.body.items.map((item) => ({
    ingredientId: text(item?.ingredientId, 'ID bahan', { max: 50 }),
    quantity: decimal(item?.quantity, 'Takaran bahan'),
  }));
  assert(new Set(entries.map((item) => item.ingredientId)).size === entries.length, 400, 'Bahan resep tidak boleh duplikat.');
  await db.transaction(async (client) => {
    const ids = entries.map((item) => item.ingredientId);
    const { rows: matched } = await client.query('SELECT id FROM ingredients WHERE id = ANY($1::varchar[])', [ids]);
    assert(matched.length === ids.length, 400, 'Satu atau beberapa bahan resep tidak ditemukan.');
    await client.query('DELETE FROM bill_of_materials');
    for (const item of entries) {
      await client.query(
        `INSERT INTO bill_of_materials (ingredient_id, quantity) VALUES ($1, $2)`,
        [item.ingredientId, item.quantity]
      );
    }
    await setSetting(client, req, 'production_yield', yieldQty);
    await setSetting(client, req, 'production_opex', opex);
    await audit(client, req, 'recipe.updated', 'bill_of_materials', null, { yieldQty, opex, items: entries });
  });
  return getRecipe(req, res);
}

async function listBatches(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT id, made_date, exp_date, qty, left_qty,
       (exp_date - CURRENT_DATE) AS days_until_expiry
     FROM batches ORDER BY exp_date, made_date LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { batches: rows, availableColdStock: await availableCold(db) } });
}

async function listInventoryMovements(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT m.id, m.ingredient_id, i.name AS ingredient_name, i.unit, m.quantity_delta,
       m.reason, m.note, m.reference_id, m.created_by, m.created_at
     FROM inventory_movements m JOIN ingredients i ON i.id = m.ingredient_id
     ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { movements: rows } });
}

async function createPurchaseOrder(req, res) {
  const ingredientId = text(req.body?.ingredientId, 'ID bahan', { max: 50 });
  const quantity = decimal(req.body?.quantity, 'Jumlah pesanan', { min: Number.EPSILON });
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const id = ID();
  const order = await db.transaction(async (client) => {
    const { rows: ingredients } = await client.query('SELECT id, price FROM ingredients WHERE id = $1 FOR SHARE', [ingredientId]);
    assert(ingredients[0], 404, 'Bahan baku tidak ditemukan.');
    const { rows } = await client.query(
      `INSERT INTO purchase_orders (id, ingredient_id, quantity, unit_price, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, ingredientId, quantity, ingredients[0].price, note, req.user.email]
    );
    await audit(client, req, 'purchase_order.created', 'purchase_order', id, { ingredientId, quantity });
    return rows[0];
  });
  return res.status(201).json({ success: true, data: { purchaseOrder: order } });
}

async function listPurchaseOrders(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT po.*, i.name AS ingredient_name, i.unit
     FROM purchase_orders po JOIN ingredients i ON i.id = po.ingredient_id
     ORDER BY po.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { purchaseOrders: rows } });
}

async function receivePurchaseOrder(req, res) {
  const id = text(req.params.orderId, 'ID purchase order', { max: 50 });
  const received = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [id]);
    const order = rows[0];
    assert(order, 404, 'Purchase order tidak ditemukan.');
    assert(order.status === 'menunggu', 409, 'Purchase order sudah diproses.');
    const { rows: ingredientRows } = await client.query('SELECT id FROM ingredients WHERE id = $1 FOR UPDATE', [order.ingredient_id]);
    assert(ingredientRows[0], 404, 'Bahan baku tidak ditemukan.');
    const { rows: updated } = await client.query(
      `UPDATE ingredients SET stock = stock + $2, price = $3 WHERE id = $1
       RETURNING id, name, unit, stock, rop, price`,
      [order.ingredient_id, order.quantity, order.unit_price]
    );
    await client.query(
      `UPDATE purchase_orders SET status = 'diterima', received_by = $2, received_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, req.user.email]
    );
    await client.query(
      `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, reference_id, created_by)
       VALUES ($1, $2, $3, 'penerimaan_po', $4, $5)`,
      [ID(), order.ingredient_id, order.quantity, id, req.user.email]
    );
    await audit(client, req, 'purchase_order.received', 'purchase_order', id, { quantity: order.quantity });
    return updated[0];
  });
  return res.json({ success: true, data: { ingredient: received } });
}

async function createProduction(req, res) {
  const recipeCount = integer(req.body?.recipeCount, 'Jumlah resep', { min: 1, max: 10000 });
  const usageMode = enumValue(req.body?.usageMode ?? 'auto', 'Mode penggunaan', ['auto', 'manual']);
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const expDate = req.body?.expDate === undefined
    ? null : date(req.body.expDate, 'Tanggal kedaluwarsa');
  const manual = req.body?.items;
  assert(usageMode !== 'manual' || (manual && typeof manual === 'object' && !Array.isArray(manual)), 400, 'Mode manual memerlukan objek pemakaian items.');

  const production = await db.transaction(async (client) => {
    const settings = await readSettings(client);
    assert(settings.production_yield > 0, 409, 'Hasil resep belum dikonfigurasi.');
    const { rows: recipe } = await client.query(
      `SELECT b.ingredient_id, b.quantity, i.stock, i.price, i.name, i.unit
       FROM bill_of_materials b JOIN ingredients i ON i.id = b.ingredient_id
       ORDER BY b.ingredient_id FOR UPDATE OF i`
    );
    assert(recipe.length > 0, 409, 'Resep produksi belum dikonfigurasi.');
    const usages = recipe.map((item) => {
      const standard = Number(item.quantity) * recipeCount;
      const raw = usageMode === 'auto' ? standard : (manual[item.ingredient_id] ?? 0);
      return {
        ...item,
        standard,
        used: decimal(raw, `Pemakaian ${item.name}`),
      };
    });
    if (usageMode === 'manual') {
      const unknown = Object.keys(manual).filter((key) => !recipe.some((item) => item.ingredient_id === key));
      assert(unknown.length === 0, 400, 'Pemakaian berisi bahan yang tidak ada di resep.');
    }
    assert(usages.some((item) => item.used > 0), 400, 'Pemakaian minimal satu bahan harus lebih dari nol.');
    for (const item of usages) {
      assert(item.used <= Number(item.stock), 409, `Stok ${item.name} tidak mencukupi.`);
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['paolotory-production-batch']);
    const { rows: batchRows } = await client.query(
      `SELECT CURRENT_DATE::text AS today,
       to_char(CURRENT_DATE, 'YYYYMMDD') AS date_code,
       (SELECT COUNT(*)::int FROM batches WHERE made_date = CURRENT_DATE) + 1 AS sequence`
    );
    const { today, date_code: dateCode, sequence } = batchRows[0];
    const batchId = `BPK-${dateCode}-${String(sequence).padStart(2, '0')}`;
    const yieldQty = recipeCount * settings.production_yield;
    assert(Number.isSafeInteger(yieldQty) && yieldQty <= 2147483647, 400, 'Jumlah hasil produksi melampaui batas sistem.');
    const expiry = expDate || (await client.query(`SELECT ($1::date + INTERVAL '30 days')::date::text AS value`, [today])).rows[0].value;
    assert(expiry >= today, 400, 'Tanggal kedaluwarsa harus sama dengan atau setelah tanggal produksi.');
    const totalMaterialCost = usages.reduce((sum, item) => sum + item.used * Number(item.price), 0);
    const hpp = (totalMaterialCost + settings.production_opex * recipeCount) / yieldQty;
    await client.query(
      `INSERT INTO batches (id, made_date, exp_date, qty, left_qty)
       VALUES ($1, $2, $3, $4, $4)`,
      [batchId, today, expiry, yieldQty]
    );
    const runId = ID();
    await client.query(
      `INSERT INTO production_runs (id, batch_id, recipe_count, yield_qty, usage_mode, hpp_per_unit, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [runId, batchId, recipeCount, yieldQty, usageMode, hpp, note, req.user.email]
    );
    for (const item of usages) {
      if (item.used > 0) {
        await client.query('UPDATE ingredients SET stock = stock - $2 WHERE id = $1', [item.ingredient_id, item.used]);
        await client.query(
          `INSERT INTO inventory_movements (id, ingredient_id, quantity_delta, reason, note, reference_id, created_by)
           VALUES ($1, $2, $3, 'produksi', $4, $5, $6)`,
          [ID(), item.ingredient_id, -item.used, note, runId, req.user.email]
        );
      }
      await client.query(
        `INSERT INTO production_run_items (production_run_id, ingredient_id, quantity_used, standard_quantity)
         VALUES ($1, $2, $3, $4)`,
        [runId, item.ingredient_id, item.used, item.standard]
      );
    }
    await audit(client, req, 'production.completed', 'production_run', runId, { batchId, recipeCount, yieldQty, usageMode, hpp });
    return {
      id: runId,
      batch: { id: batchId, madeDate: today, expDate: expiry, qty: yieldQty, leftQty: yieldQty },
      recipeCount,
      usageMode,
      hppPerUnit: hpp,
    };
  });
  return res.status(201).json({ success: true, data: { production } });
}

async function listProductions(req, res) {
  const { limit, offset } = pagination(req.query);
  const { rows } = await db.query(
    `SELECT pr.id, pr.batch_id, b.made_date, b.exp_date, pr.recipe_count, pr.yield_qty,
       pr.usage_mode, pr.hpp_per_unit, pr.note, pr.created_by, pr.created_at,
       COALESCE(json_agg(json_build_object(
         'ingredientId', i.id, 'name', i.name, 'unit', i.unit,
         'quantityUsed', pri.quantity_used, 'standardQuantity', pri.standard_quantity
       ) ORDER BY i.name) FILTER (WHERE pri.id IS NOT NULL), '[]'::json) AS items
     FROM production_runs pr JOIN batches b ON b.id = pr.batch_id
     LEFT JOIN production_run_items pri ON pri.production_run_id = pr.id
     LEFT JOIN ingredients i ON i.id = pri.ingredient_id
     GROUP BY pr.id, b.id
     ORDER BY pr.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.json({ success: true, data: { productions: rows } });
}

async function createIngredientAdjustment(req, res) {
  const ingredientId = text(req.body?.ingredientId, 'ID bahan', { max: 50 });
  const quantity = decimal(req.body?.quantity, 'Jumlah pengurangan', { min: Number.EPSILON });
  const reason = text(req.body?.reason, 'Alasan', { max: 100 });
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT id, name, unit, stock FROM ingredients WHERE id = $1 FOR UPDATE', [ingredientId]);
    const ingredient = rows[0];
    assert(ingredient, 404, 'Bahan baku tidak ditemukan.');
    assert(quantity <= Number(ingredient.stock), 409, `Jumlah melebihi stok ${ingredient.name}.`);
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
    await audit(client, req, 'ingredient.adjusted', 'ingredient', ingredientId, { quantity: -quantity, reason, note });
    return updated[0];
  });
  return res.status(201).json({ success: true, data: { ingredient: result } });
}

const POS_PRODUCTS = {
  hangat: { name: 'Bakpau hangat', coldUnits: 0, unitMultiplier: 1, discount: 0 },
  pack6: { name: 'Pack beku isi 6', coldUnits: 6, unitMultiplier: 6, discount: 1 / 12 },
  pack12: { name: 'Pack beku isi 12', coldUnits: 12, unitMultiplier: 12, discount: 0.125 },
};

function posUnitPrice(basePrice, product) {
  return Math.round((basePrice * product.unitMultiplier * (1 - product.discount)) / 100) * 100;
}

async function getPosProducts(req, res) {
  const settings = await readSettings(db);
  const products = Object.entries(POS_PRODUCTS).map(([id, product]) => ({
    id,
    name: product.name,
    price: posUnitPrice(settings.central_price, product),
    coldUnits: product.coldUnits,
  }));
  return res.json({ success: true, data: { products, availableColdStock: await availableCold(db) } });
}

async function getCurrentShift(req, res) {
  const { rows } = await db.query(
    `SELECT sh.id, sh.opening_cash, sh.opened_at,
       COUNT(s.id)::int AS transaction_count,
       COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = 'tunai'), 0) AS cash_sales,
       COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = 'qris'), 0) AS non_cash_sales
     FROM pos_shifts sh LEFT JOIN pos_sales s ON s.shift_id = sh.id
     WHERE sh.opened_by = $1 AND sh.status = 'open'
     GROUP BY sh.id`,
    [req.user.email]
  );
  return res.json({ success: true, data: { shift: rows[0] || null } });
}

async function openShift(req, res) {
  const openingCash = decimal(req.body?.openingCash, 'Modal awal');
  const id = ID();
  try {
    const shift = await db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO pos_shifts (id, opened_by, opening_cash)
         VALUES ($1, $2, $3) RETURNING id, opening_cash, opened_at`,
        [id, req.user.email, openingCash]
      );
      await audit(client, req, 'pos.shift_opened', 'pos_shift', id, { openingCash });
      return rows[0];
    });
    return res.status(201).json({ success: true, data: { shift } });
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('Anda masih memiliki shift yang belum ditutup.'), { status: 409 });
    throw error;
  }
}

async function closeShift(req, res) {
  const countedCash = decimal(req.body?.countedCash, 'Uang kas terhitung');
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM pos_shifts WHERE opened_by = $1 AND status = 'open' FOR UPDATE`,
      [req.user.email]
    );
    const shift = rows[0];
    assert(shift, 409, 'Tidak ada shift aktif untuk ditutup.');
    const { rows: totals } = await client.query(
      `SELECT COALESCE(SUM(total), 0)::numeric AS cash_sales
       FROM pos_sales WHERE shift_id = $1 AND payment_method = 'tunai'`,
      [shift.id]
    );
    const expectedCash = Number(shift.opening_cash) + Number(totals[0].cash_sales);
    const difference = countedCash - expectedCash;
    const { rows: updated } = await client.query(
      `UPDATE pos_shifts SET status = 'closed', closed_at = CURRENT_TIMESTAMP,
       expected_cash = $2, counted_cash = $3, cash_difference = $4
       WHERE id = $1 RETURNING *`,
      [shift.id, expectedCash, countedCash, difference]
    );
    await audit(client, req, 'pos.shift_closed', 'pos_shift', shift.id, { expectedCash, countedCash, difference });
    return updated[0];
  });
  return res.json({ success: true, data: { shift: result } });
}

async function listShiftSales(req, res) {
  const shiftId = text(req.params.shiftId, 'ID shift', { max: 50 });
  const { limit, offset } = pagination(req.query);
  const { rows: shiftRows } = await db.query(
    `SELECT id, opened_by FROM pos_shifts WHERE id = $1`,
    [shiftId]
  );
  assert(shiftRows[0], 404, 'Shift tidak ditemukan.');
  assert(req.user.role === 'owner' || shiftRows[0].opened_by === req.user.email, 403, 'Anda hanya dapat melihat shift sendiri.');
  const { rows } = await db.query(
    `SELECT s.id, s.payment_method, s.total, s.received_amount, s.change_amount, s.created_at,
       COALESCE(json_agg(json_build_object(
         'productId', si.product_id, 'quantity', si.quantity,
         'unitPrice', si.unit_price, 'unitCount', si.unit_count, 'lineTotal', si.line_total
       )) FILTER (WHERE si.id IS NOT NULL), '[]'::json) AS items
     FROM pos_sales s LEFT JOIN pos_sale_items si ON si.sale_id = s.id
     WHERE s.shift_id = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`,
    [shiftId, limit, offset]
  );
  return res.json({ success: true, data: { sales: rows } });
}

async function checkout(req, res) {
  assert(Array.isArray(req.body?.items) && req.body.items.length > 0 && req.body.items.length <= 20, 400, 'Pesanan harus berisi 1-20 jenis produk.');
  const items = req.body.items.map((item) => ({
    productId: enumValue(item?.productId, 'Produk', Object.keys(POS_PRODUCTS)),
    quantity: integer(item?.quantity, 'Jumlah produk', { min: 1, max: 10000 }),
  }));
  assert(new Set(items.map((item) => item.productId)).size === items.length, 400, 'Setiap jenis produk hanya boleh dikirim satu kali.');
  const paymentMethod = enumValue(req.body?.paymentMethod, 'Metode pembayaran', ['tunai', 'qris']);
  const receivedAmount = paymentMethod === 'tunai' ? decimal(req.body?.receivedAmount, 'Uang diterima') : null;

  const sale = await db.transaction(async (client) => {
    const { rows: shifts } = await client.query(
      `SELECT * FROM pos_shifts WHERE opened_by = $1 AND status = 'open' FOR UPDATE`,
      [req.user.email]
    );
    const shift = shifts[0];
    assert(shift, 409, 'Buka shift kasir sebelum mencatat transaksi.');
    const settings = await readSettings(client);
    const pricedItems = items.map((item) => {
      const product = POS_PRODUCTS[item.productId];
      const unitPrice = posUnitPrice(settings.central_price, product);
      return { ...item, ...product, unitPrice, lineTotal: unitPrice * item.quantity };
    });
    const total = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    assert(total > 0, 400, 'Total transaksi harus lebih dari nol.');
    assert(total <= 999999999999.99, 400, 'Total transaksi melampaui batas sistem.');
    assert(paymentMethod !== 'tunai' || receivedAmount >= total, 400, 'Uang diterima kurang dari total transaksi.');
    const coldRequired = pricedItems.reduce((sum, item) => sum + item.coldUnits * item.quantity, 0);

    if (coldRequired > 0) {
      const batches = await getAvailableBatches(client);
      let remaining = coldRequired;
      for (const batch of batches) {
        const available = batch.left_qty - batch.reserved_qty;
        const take = Math.min(available, remaining);
        if (take <= 0) continue;
        await client.query('UPDATE batches SET left_qty = left_qty - $2 WHERE id = $1', [batch.id, take]);
        remaining -= take;
        if (remaining === 0) break;
      }
      assert(remaining === 0, 409, 'Stok cold storage tidak mencukupi untuk transaksi ini.');
    }

    const saleId = ID();
    const changeAmount = paymentMethod === 'tunai' ? receivedAmount - total : 0;
    await client.query(
      `INSERT INTO pos_sales (id, shift_id, cashier_email, payment_method, total, received_amount, change_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, shift.id, req.user.email, paymentMethod, total, receivedAmount, changeAmount]
    );
    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO pos_sale_items (sale_id, product_id, quantity, unit_price, unit_count, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, item.productId, item.quantity, item.unitPrice, item.unitMultiplier, item.lineTotal]
      );
    }
    await audit(client, req, 'pos.sale_completed', 'pos_sale', saleId, { total, paymentMethod, coldRequired });
    return { id: saleId, shiftId: shift.id, total, paymentMethod, receivedAmount, changeAmount, items: pricedItems };
  });
  return res.status(201).json({ success: true, message: 'Pembayaran berhasil dicatat.', data: { sale } });
}

async function reportSpoilage(req, res) {
  const productId = enumValue(req.body?.productId, 'Produk', Object.keys(POS_PRODUCTS));
  const quantity = integer(req.body?.quantity, 'Jumlah produk rusak', { min: 1, max: 10000 });
  const reason = text(req.body?.reason, 'Alasan', { max: 100 });
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const id = ID();
  const result = await db.transaction(async (client) => {
    const { rows: shifts } = await client.query(
      `SELECT id FROM pos_shifts WHERE opened_by = $1 AND status = 'open' FOR UPDATE`,
      [req.user.email]
    );
    assert(shifts[0], 409, 'Buka shift kasir sebelum mencatat produk rusak.');
    const coldRequired = POS_PRODUCTS[productId].coldUnits * quantity;
    if (coldRequired > 0) {
      const batches = await getAvailableBatches(client);
      let remaining = coldRequired;
      for (const batch of batches) {
        const take = Math.min(batch.left_qty - batch.reserved_qty, remaining);
        if (take <= 0) continue;
        await client.query('UPDATE batches SET left_qty = left_qty - $2 WHERE id = $1', [batch.id, take]);
        remaining -= take;
        if (!remaining) break;
      }
      assert(remaining === 0, 409, 'Stok cold storage tidak mencukupi.');
    }
    await client.query(
      `INSERT INTO pos_spoilage (id, cashier_email, product_id, quantity, reason, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.user.email, productId, quantity, reason, note]
    );
    await audit(client, req, 'pos.spoilage_reported', 'pos_spoilage', id, { productId, quantity, reason });
    return { id, productId, quantity, reason, note };
  });
  return res.status(201).json({ success: true, data: { spoilage: result } });
}

async function createOrder(req, res) {
  const quantity = integer(req.body?.quantity, 'Jumlah pesanan', { min: 1, max: 100000 });
  const note = text(req.body?.note, 'Catatan', { max: 500, optional: true });
  const partnerId = req.user.partnerId;
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const id = ID();
  const order = await db.transaction(async (client) => {
    await getPartner(client, partnerId);
    const { rows } = await client.query(
      `INSERT INTO orders (id, partner_id, qty, note, status, order_date)
       VALUES ($1, $2, $3, $4, 'menunggu', CURRENT_DATE)
       RETURNING id, partner_id, qty, note, status, order_date`,
      [id, partnerId, quantity, note]
    );
    await audit(client, req, 'partner.order_created', 'order', id, { partnerId, quantity });
    return rows[0];
  });
  return res.status(201).json({ success: true, data: { order } });
}

async function listOrders(req, res) {
  const { limit, offset } = pagination(req.query);
  const partnerOnly = req.user.role === 'partner';
  const params = partnerOnly ? [req.user.partnerId, limit, offset] : [limit, offset];
  assert(!partnerOnly || req.user.partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const where = partnerOnly ? 'WHERE o.partner_id = $1' : '';
  const limitParam = partnerOnly ? '$2' : '$1';
  const offsetParam = partnerOnly ? '$3' : '$2';
  const { rows } = await db.query(
    `SELECT o.id, o.partner_id, p.name AS partner_name, p.zone, o.qty, o.note, o.status,
       o.order_date, o.manifest_id, o.reviewed_by, o.reviewed_at
     FROM orders o JOIN partners p ON p.id = o.partner_id ${where}
     ORDER BY o.order_date DESC, o.id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return res.json({ success: true, data: { orders: rows } });
}

async function reviewOrder(req, res) {
  const orderId = text(req.params.orderId, 'ID pesanan', { max: 50 });
  const decision = enumValue(req.body?.decision, 'Keputusan', ['disetujui', 'ditolak']);
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    assert(order, 404, 'Pesanan mitra tidak ditemukan.');
    assert(order.status === 'menunggu', 409, 'Pesanan ini sudah diproses.');
    let manifestId = null;
    if (decision === 'disetujui') {
      manifestId = await createManifest(client, req, order.partner_id, order.qty, order.id);
    }
    const { rows: updated } = await client.query(
      `UPDATE orders SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [orderId, decision, req.user.email]
    );
    await audit(client, req, 'partner.order_reviewed', 'order', orderId, { decision, manifestId });
    return { order: updated[0], manifestId };
  });
  return res.json({ success: true, data: result });
}

async function createManualManifest(req, res) {
  const partnerId = text(req.body?.partnerId, 'ID mitra', { max: 50 });
  const quantity = integer(req.body?.quantity, 'Jumlah pengiriman', { min: 1, max: 100000 });
  const partner = await getPartner(db, partnerId);
  const result = await db.transaction(async (client) => {
    const manifestId = await createManifest(client, req, partnerId, quantity);
    return { id: manifestId, partnerId, partnerName: partner.name, quantity };
  });
  return res.status(201).json({ success: true, data: { manifest: result } });
}

async function listManifests(req, res) {
  const { limit, offset } = pagination(req.query);
  const courierFilter = req.user.role === 'courier'
    ? 'WHERE m.cancelled_at IS NULL AND (m.courier_email IS NULL OR m.courier_email = $1)'
    : '';
  const params = req.user.role === 'courier' ? [req.user.email, limit, offset] : [limit, offset];
  const limitParam = req.user.role === 'courier' ? '$2' : '$1';
  const offsetParam = req.user.role === 'courier' ? '$3' : '$2';
  const { rows } = await db.query(
    `SELECT m.id, m.partner_id, p.name AS partner_name, p.type, p.zone, m.qty,
       m.is_done, m.photo_url, m.photo_at, m.gps_latitude, m.gps_longitude,
       m.courier_email, m.cancelled_at, m.created_at
     FROM manifests m JOIN partners p ON p.id = m.partner_id ${courierFilter}
     ORDER BY m.is_done ASC, p.zone, m.created_at
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return res.json({ success: true, data: { manifests: rows } });
}

async function claimManifest(req, res) {
  const manifestId = text(req.params.manifestId, 'ID manifes', { max: 50 });
  const manifest = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE manifests SET courier_email = $2
       WHERE id = $1 AND is_done = FALSE AND cancelled_at IS NULL
         AND (courier_email IS NULL OR courier_email = $2)
       RETURNING id, courier_email, partner_id, qty`,
      [manifestId, req.user.email]
    );
    assert(rows[0], 409, 'Manifes tidak tersedia atau sudah diambil kurir lain.');
    await audit(client, req, 'manifest.claimed', 'manifest', manifestId);
    return rows[0];
  });
  return res.json({ success: true, data: { manifest } });
}

async function confirmDelivery(req, res) {
  const manifestId = text(req.params.manifestId, 'ID manifes', { max: 50 });
  const photoUrl = text(req.body?.photoUrl, 'URL foto bukti', { max: 2000 });
  let photo;
  try {
    photo = new URL(photoUrl);
  } catch {
    assert(false, 400, 'URL foto bukti tidak valid.');
  }
  assert(photo.protocol === 'https:', 400, 'Foto bukti harus menggunakan URL HTTPS.');
  const latitude = req.body?.latitude === undefined ? null : decimal(req.body.latitude, 'Latitude', { min: -90, max: 90 });
  const longitude = req.body?.longitude === undefined ? null : decimal(req.body.longitude, 'Longitude', { min: -180, max: 180 });
  assert((latitude === null) === (longitude === null), 400, 'Latitude dan longitude harus dikirim berpasangan.');
  const receivedBy = text(req.body?.receivedBy, 'Nama penerima', { max: 100, optional: true });

  const result = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM manifests WHERE id = $1 FOR UPDATE', [manifestId]);
    const manifest = rows[0];
    assert(manifest, 404, 'Manifes tidak ditemukan.');
    assert(!manifest.is_done && !manifest.cancelled_at, 409, 'Manifes sudah selesai atau dibatalkan.');
    assert(!manifest.courier_email || manifest.courier_email === req.user.email, 403, 'Manifes ditugaskan ke kurir lain.');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      ['paolotory-cold-stock']
    );
    const { rows: allocations } = await client.query(
      `SELECT a.id, a.batch_id, a.quantity, b.left_qty
       FROM manifest_batch_allocations a JOIN batches b ON b.id = a.batch_id
       WHERE a.manifest_id = $1 AND a.status = 'pending'
       ORDER BY b.exp_date ASC FOR UPDATE OF b`,
      [manifestId]
    );
    const allocated = allocations.reduce((sum, item) => sum + item.quantity, 0);
    assert(allocated === manifest.qty, 409, 'Alokasi stok untuk manifes tidak lengkap.');
    for (const item of allocations) {
      assert(item.left_qty >= item.quantity, 409, 'Stok batch tidak mencukupi saat serah terima.');
      await client.query('UPDATE batches SET left_qty = left_qty - $2 WHERE id = $1', [item.batch_id, item.quantity]);
      await client.query(
        `UPDATE manifest_batch_allocations SET status = 'consumed' WHERE id = $1`,
        [item.id]
      );
    }
    const partner = await getPartner(client, manifest.partner_id, { lock: true });
    await client.query('UPDATE partners SET sent = sent + $2 WHERE id = $1', [partner.id, manifest.qty]);
    await recordPartnerMovement(client, req, partner.id, 'pengiriman', manifest.qty, manifestId);
    const { rows: updated } = await client.query(
      `UPDATE manifests SET is_done = TRUE, photo_url = $2, photo_at = CURRENT_TIMESTAMP,
       gps_latitude = $3, gps_longitude = $4, received_by = $5, courier_email = $6
       WHERE id = $1 RETURNING *`,
      [manifestId, photoUrl, latitude, longitude, receivedBy, req.user.email]
    );
    await audit(client, req, 'manifest.delivered', 'manifest', manifestId, {
      partnerId: partner.id, quantity: manifest.qty, receivedBy, latitude, longitude,
    });
    return updated[0];
  });
  return res.json({ success: true, message: 'Serah terima pengiriman berhasil dicatat.', data: { manifest: result } });
}

async function cancelManifest(req, res) {
  const manifestId = text(req.params.manifestId, 'ID manifes', { max: 50 });
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM manifests WHERE id = $1 FOR UPDATE', [manifestId]);
    const manifest = rows[0];
    assert(manifest, 404, 'Manifes tidak ditemukan.');
    assert(!manifest.is_done && !manifest.cancelled_at, 409, 'Manifes sudah selesai atau dibatalkan.');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['paolotory-cold-stock']);
    await client.query(
      `UPDATE manifest_batch_allocations SET status = 'cancelled'
       WHERE manifest_id = $1 AND status = 'pending'`,
      [manifestId]
    );
    const { rows: updated } = await client.query(
      `UPDATE manifests SET cancelled_by = $2, cancelled_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [manifestId, req.user.email]
    );
    if (manifest.id && (await client.query('SELECT 1 FROM orders WHERE manifest_id = $1', [manifestId])).rowCount) {
      await client.query(
        `UPDATE orders SET status = 'ditolak', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
         WHERE manifest_id = $1 AND status = 'disetujui'`,
        [manifestId, req.user.email]
      );
    }
    await audit(client, req, 'manifest.cancelled', 'manifest', manifestId);
    return updated[0];
  });
  return res.json({ success: true, data: { manifest: result } });
}

async function createPartnerSale(req, res) {
  const quantity = integer(req.body?.quantity, 'Jumlah penjualan', { min: 1, max: 100000 });
  const partnerId = req.user.partnerId;
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const sale = await db.transaction(async (client) => {
    const partner = await getPartner(client, partnerId, { lock: true });
    const { rows: claims } = await client.query(
      `SELECT COALESCE(SUM(qty), 0)::int AS pending_qty
       FROM claims WHERE partner_id = $1 AND status = 'menunggu'`,
      [partnerId]
    );
    const stock = partner.sent - partner.sold - partner.returned - claims[0].pending_qty;
    assert(quantity <= stock, 409, `Penjualan melebihi stok tersedia di gerai (${stock} butir).`);
    const settings = await readSettings(client);
    const unitPrice = partner.price_per_unit === null
      ? settings.partner_price : Number(partner.price_per_unit);
    const id = ID();
    const total = quantity * unitPrice;
    assert(total <= 999999999999.99, 400, 'Total penjualan melampaui batas sistem.');
    await client.query('UPDATE partners SET sold = sold + $2 WHERE id = $1', [partnerId, quantity]);
    await client.query(
      `INSERT INTO partner_sales (id, partner_id, quantity, unit_price, total, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, partnerId, quantity, unitPrice, total, req.user.email]
    );
    await recordPartnerMovement(client, req, partnerId, 'penjualan', -quantity, id);
    await audit(client, req, 'partner.sale_reported', 'partner_sale', id, { quantity, unitPrice, total });
    return { id, quantity, unitPrice, total, remainingStock: stock - quantity };
  });
  return res.status(201).json({ success: true, data: { sale } });
}

async function createClaim(req, res) {
  const quantity = integer(req.body?.quantity, 'Jumlah retur', { min: 1, max: 100000 });
  const photoUrl = text(req.body?.photoUrl, 'URL foto retur', { max: 2000, optional: true });
  const partnerId = req.user.partnerId;
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  if (photoUrl) {
    let photo;
    try {
      photo = new URL(photoUrl);
    } catch {
      assert(false, 400, 'URL foto retur tidak valid.');
    }
    assert(photo.protocol === 'https:', 400, 'Foto retur harus menggunakan URL HTTPS.');
  }
  const claim = await db.transaction(async (client) => {
    const partner = await getPartner(client, partnerId, { lock: true });
    const { rows: openClaims } = await client.query(
      `SELECT COALESCE(SUM(qty), 0)::int AS quantity
       FROM claims WHERE partner_id = $1 AND status = 'menunggu'`,
      [partnerId]
    );
    const available = partner.sent - partner.sold - partner.returned - openClaims[0].quantity;
    assert(quantity <= available, 409, `Retur melebihi stok gerai yang dapat diklaim (${available} butir).`);
    const id = ID();
    const { rows } = await client.query(
      `INSERT INTO claims (id, partner_id, qty, status, claim_date, photo_url)
       VALUES ($1, $2, $3, 'menunggu', CURRENT_DATE, $4)
       RETURNING id, partner_id, qty, status, claim_date, photo_url`,
      [id, partnerId, quantity, photoUrl]
    );
    await audit(client, req, 'partner.claim_created', 'claim', id, { quantity });
    return rows[0];
  });
  return res.status(201).json({ success: true, data: { claim } });
}

async function listClaims(req, res) {
  const { limit, offset } = pagination(req.query);
  const partnerOnly = req.user.role === 'partner';
  const params = partnerOnly ? [req.user.partnerId, limit, offset] : [limit, offset];
  assert(!partnerOnly || req.user.partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const where = partnerOnly ? 'WHERE c.partner_id = $1' : '';
  const limitParam = partnerOnly ? '$2' : '$1';
  const offsetParam = partnerOnly ? '$3' : '$2';
  const { rows } = await db.query(
    `SELECT c.id, c.partner_id, p.name AS partner_name, c.qty, c.status, c.claim_date,
       c.photo_url, c.reviewed_by, c.reviewed_at
     FROM claims c JOIN partners p ON p.id = c.partner_id ${where}
     ORDER BY c.claim_date DESC, c.id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return res.json({ success: true, data: { claims: rows } });
}

async function reviewClaim(req, res) {
  const claimId = text(req.params.claimId, 'ID retur', { max: 50 });
  const decision = enumValue(req.body?.decision, 'Keputusan', ['dikonfirmasi', 'ditolak']);
  const claim = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [claimId]);
    const current = rows[0];
    assert(current, 404, 'Retur mitra tidak ditemukan.');
    assert(current.status === 'menunggu', 409, 'Retur ini sudah diproses.');
    if (decision === 'dikonfirmasi') {
      const partner = await getPartner(client, current.partner_id, { lock: true });
      assert(partner.sent - partner.sold - partner.returned >= current.qty, 409, 'Stok gerai sudah berubah dan tidak cukup untuk mengonfirmasi retur.');
      await client.query('UPDATE partners SET returned = returned + $2 WHERE id = $1', [partner.id, current.qty]);
      await recordPartnerMovement(client, req, partner.id, 'retur', -current.qty, claimId);
    }
    const { rows: updated } = await client.query(
      `UPDATE claims SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [claimId, decision, req.user.email]
    );
    await audit(client, req, 'partner.claim_reviewed', 'claim', claimId, { decision, quantity: current.qty });
    return updated[0];
  });
  return res.json({ success: true, data: { claim } });
}

function dateFilters(query) {
  const from = query.from === undefined ? null : date(query.from, 'Tanggal awal');
  const to = query.to === undefined ? null : date(query.to, 'Tanggal akhir');
  assert(!from || !to || from <= to, 400, 'Tanggal awal harus sebelum atau sama dengan tanggal akhir.');
  return { from, to };
}

async function getPartnerSettlement(req, res) {
  const partnerId = req.user.role === 'partner'
    ? req.user.partnerId : text(req.params.partnerId, 'ID mitra', { max: 50 });
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const partner = await getPartner(db, partnerId);
  const { from, to } = dateFilters(req.query);
  const conditions = ['partner_id = $1'];
  const params = [partnerId];
  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  const { rows: sales } = await db.query(
    `SELECT COALESCE(SUM(quantity), 0)::int AS quantity, COALESCE(SUM(total), 0)::numeric AS gross
     FROM partner_sales WHERE ${conditions.join(' AND ')}`,
    params
  );
  const claimParams = [partnerId];
  const claimFilters = ['partner_id = $1', `status = 'dikonfirmasi'`];
  if (from) {
    claimParams.push(from);
    claimFilters.push(`claim_date >= $${claimParams.length}::date`);
  }
  if (to) {
    claimParams.push(to);
    claimFilters.push(`claim_date < ($${claimParams.length}::date + INTERVAL '1 day')`);
  }
  const { rows: returns } = await db.query(
    `SELECT COALESCE(SUM(qty), 0)::int AS quantity
     FROM claims WHERE ${claimFilters.join(' AND ')}`,
    claimParams
  );
  const settings = await readSettings(db);
  const unitPrice = partner.price_per_unit === null
    ? settings.partner_price : Number(partner.price_per_unit);
  return res.json({
    success: true,
    data: {
      settlement: {
        partnerId,
        partnerName: partner.name,
        from,
        to,
        soldQuantity: sales[0].quantity,
        returnedQuantity: returns[0].quantity,
        unitPrice,
        grossPayable: Number(sales[0].gross),
        netPayable: Number(sales[0].gross),
      },
    },
  });
}

async function listSettlements(req, res) {
  const { from, to } = dateFilters(req.query);
  const { rows } = await db.query(
    `WITH sold AS (
       SELECT partner_id, SUM(quantity)::int AS quantity, SUM(total)::numeric AS gross
       FROM partner_sales
       WHERE ($1::date IS NULL OR created_at >= $1::date)
         AND ($2::date IS NULL OR created_at < ($2::date + INTERVAL '1 day'))
       GROUP BY partner_id
     ),
     returned AS (
       SELECT partner_id, SUM(qty)::int AS quantity
       FROM claims
       WHERE status = 'dikonfirmasi'
         AND ($1::date IS NULL OR claim_date >= $1::date)
         AND ($2::date IS NULL OR claim_date < ($2::date + INTERVAL '1 day'))
       GROUP BY partner_id
     )
     SELECT p.id AS partner_id, p.name AS partner_name,
       COALESCE(s.quantity, 0)::int AS sold_quantity,
       COALESCE(r.quantity, 0)::int AS returned_quantity,
       COALESCE(p.price_per_unit, bs.numeric_value)::numeric AS unit_price,
       COALESCE(s.gross, 0)::numeric AS gross_payable,
       COALESCE(s.gross, 0)::numeric AS net_payable
     FROM partners p CROSS JOIN business_settings bs
     LEFT JOIN sold s ON s.partner_id = p.id
     LEFT JOIN returned r ON r.partner_id = p.id
     WHERE bs.key = 'partner_price'
     ORDER BY p.name`,
    [from, to]
  );
  const totals = rows.reduce((result, item) => ({
    soldQuantity: result.soldQuantity + item.sold_quantity,
    returnedQuantity: result.returnedQuantity + item.returned_quantity,
    netPayable: result.netPayable + Number(item.net_payable),
  }), { soldQuantity: 0, returnedQuantity: 0, netPayable: 0 });
  return res.json({ success: true, data: { from, to, settlements: rows, totals } });
}

async function getPartnerInventory(req, res) {
  const partnerId = req.user.role === 'partner'
    ? req.user.partnerId : text(req.params.partnerId, 'ID mitra', { max: 50 });
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const partner = await getPartner(db, partnerId);
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(qty), 0)::int AS pending_claim_qty
     FROM claims WHERE partner_id = $1 AND status = 'menunggu'`,
    [partnerId]
  );
  const pendingSupply = await db.query(
    `SELECT COALESCE(SUM(qty), 0)::int AS quantity
     FROM manifests WHERE partner_id = $1 AND is_done = FALSE AND cancelled_at IS NULL`,
    [partnerId]
  );
  const stock = partner.sent - partner.sold - partner.returned;
  return res.json({
    success: true,
    data: {
      inventory: {
        partnerId,
        sent: partner.sent,
        sold: partner.sold,
        returned: partner.returned,
        currentStock: stock,
        availableToReport: stock - rows[0].pending_claim_qty,
        pendingClaimQuantity: rows[0].pending_claim_qty,
        incomingSupply: pendingSupply.rows[0].quantity,
      },
    },
  });
}

async function listPartnerSales(req, res) {
  const partnerId = req.user.role === 'partner'
    ? req.user.partnerId : text(req.params.partnerId, 'ID mitra', { max: 50 });
  assert(partnerId, 403, 'Akun ini belum ditautkan ke gerai mitra.');
  const { limit, offset } = pagination(req.query);
  const { from, to } = dateFilters(req.query);
  const params = [partnerId];
  let where = 'partner_id = $1';
  if (from) {
    params.push(from);
    where += ` AND created_at >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    where += ` AND created_at < ($${params.length}::date + INTERVAL '1 day')`;
  }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT id, quantity, unit_price, total, reported_by, created_at
     FROM partner_sales WHERE ${where}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.json({ success: true, data: { sales: rows } });
}

module.exports = {
  dashboard,
  listAuditLogs,
  listPartners,
  createPartner,
  updatePartner,
  listUsers,
  createUser,
  updateUser,
  getPrices,
  updatePrices,
  listAssets,
  createAsset,
  updateAsset,
  approveAssetWriteoff,
  listIngredients,
  createIngredient,
  updateIngredient,
  getRecipe,
  updateRecipe,
  listBatches,
  listInventoryMovements,
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  createProduction,
  listProductions,
  createIngredientAdjustment,
  getPosProducts,
  getCurrentShift,
  openShift,
  closeShift,
  listShiftSales,
  checkout,
  reportSpoilage,
  createOrder,
  listOrders,
  reviewOrder,
  createManualManifest,
  listManifests,
  claimManifest,
  confirmDelivery,
  cancelManifest,
  createPartnerSale,
  createClaim,
  listClaims,
  reviewClaim,
  getPartnerSettlement,
  listSettlements,
  getPartnerInventory,
  listPartnerSales,
};
