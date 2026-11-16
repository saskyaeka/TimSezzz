const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { decimal, enumValue, integer, pagination, text } = require('../../utils/operationsValidation');
const { ID, audit, availableCold, getAvailableBatches, readSettings } = require('./shared');

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

module.exports = {
  posUnitPrice,
  getPosProducts,
  getCurrentShift,
  openShift,
  closeShift,
  listShiftSales,
  checkout,
  reportSpoilage,
};
