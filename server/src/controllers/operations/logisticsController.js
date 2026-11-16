const db = require('../../config/db');
const { assert } = require('../../utils/httpError');
const { decimal, text } = require('../../utils/operationsValidation');
const { audit, getPartner, recordPartnerMovement } = require('./shared');

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
    assert(
      req.user.role === 'owner' || !manifest.courier_email || manifest.courier_email === req.user.email,
      403,
      'Manifes ditugaskan ke kurir lain.'
    );
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
       gps_latitude = $3, gps_longitude = $4, received_by = $5,
       courier_email = COALESCE(courier_email, $6)
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

module.exports = {
  claimManifest,
  confirmDelivery,
};
