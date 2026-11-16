const bcrypt = require('bcrypt');
const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { decimal, enumValue, integer, pagination, text } = require('../../utils/operationsValidation');
const { ID, audit, availableCold, createManifest, getPartner, readSettings, recordPartnerMovement, setSetting } = require('./shared');
const ROLES = ['owner', 'kitchen', 'pos', 'courier', 'partner'];

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
  reviewOrder,
  createManualManifest,
  cancelManifest,
  reviewClaim,
};
