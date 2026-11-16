const { randomUUID } = require('crypto');
const { assert } = require('../../utils/httpError');

async function getPartner(client, partnerId, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT id, name, type, zone, address, sent, sold, returned, price_per_unit
     FROM partners WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [partnerId]
  );
  assert(rows[0], 404, 'Gerai mitra tidak ditemukan.');
  return rows[0];
}

async function recordPartnerMovement(client, req, partnerId, type, delta, referenceId) {
  await client.query(
    `INSERT INTO partner_inventory_movements
       (id, partner_id, movement_type, quantity_delta, reference_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), partnerId, type, delta, referenceId, req.user.email]
  );
}

module.exports = { getPartner, recordPartnerMovement };
