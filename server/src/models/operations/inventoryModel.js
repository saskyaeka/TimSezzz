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

module.exports = { getAvailableBatches, availableCold };
