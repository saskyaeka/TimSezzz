const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { integer, text } = require('../../utils/operationsValidation');
const { ID, audit, getPartner, readSettings, recordPartnerMovement } = require('./shared');

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
    assert(['https:', 'http:'].includes(photo.protocol), 400, 'Foto retur harus menggunakan URL HTTP atau HTTPS.');
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

module.exports = {
  createOrder,
  createPartnerSale,
  createClaim,
};
