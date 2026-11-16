async function createAuditLog(client, req, action, entityType, entityId, details = {}) {
  await client.query(
    `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.email, action, entityType, entityId, JSON.stringify(details)]
  );
}

module.exports = { createAuditLog };
