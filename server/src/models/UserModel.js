const db = require('../config/db');

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT email, name, role, password_hash, status, partner_id
     FROM users
     WHERE LOWER(email) = $1`,
    [email]
  );
  return rows[0] || null;
}

async function findPublicByEmail(email) {
  const { rows } = await db.query(
    `SELECT email, name, role, status, partner_id
     FROM users
     WHERE LOWER(email) = $1`,
    [email]
  );
  return rows[0] || null;
}

async function createPendingPartner({ name, email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, role, password_hash, status, partner_id)
     VALUES ($1, $2, 'partner', $3, 'pending', NULL)
     RETURNING email, name, role, status, partner_id`,
    [name, email, passwordHash]
  );
  return rows[0];
}

module.exports = { findByEmail, findPublicByEmail, createPendingPartner };