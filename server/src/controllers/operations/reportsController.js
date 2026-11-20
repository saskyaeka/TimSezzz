const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { date, pagination, text } = require('../../utils/operationsValidation');
const { getPartner, readSettings } = require('./shared');

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
        partnerName: partner.name,
        name: partner.name,
        type: partner.type,
        zone: partner.zone,
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
  listOrders,
  listManifests,
  listClaims,
  dateFilters,
  getPartnerSettlement,
  listSettlements,
  getPartnerInventory,
  listPartnerSales,
};
