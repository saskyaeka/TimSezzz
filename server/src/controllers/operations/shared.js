const { randomUUID } = require('crypto');
const { assert } = require('../../utils/httpError');
const { createAuditLog } = require('../../models/operations/auditModel');
const { getAvailableBatches, getAllBatches, availableCold } = require('../../models/operations/inventoryModel');
const { getPartner, recordPartnerMovement } = require('../../models/operations/partnerModel');
const { readSettings, setSetting } = require('../../models/operations/settingsModel');

const ID = () => randomUUID();

async function audit(client, req, action, entityType, entityId, details = {}) {
  await createAuditLog(client, req, action, entityType, entityId, details);
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

module.exports = {
  ID,
  audit,
  getPartner,
  getAvailableBatches,
  getAllBatches,
  allocateBatches,
  availableCold,
  recordPartnerMovement,
  createManifest,
  readSettings,
  setSetting,
};
