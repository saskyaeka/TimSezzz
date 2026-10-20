const db = require('../config/db');

const UserModel = {
  async findByEmail(email) {
    const query = `
      SELECT u.id, u.name, u.email, u.password_hash, u.is_active, r.name AS role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1
    `;
    const { rows } = await db.query(query, [email]);
    return rows[0] || null;
  },

  async createUser({ name, email, passwordHash, phone, roleId = 3 }) {
    const query = `
      INSERT INTO users (role_id, name, email, password_hash, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, role_id, name, email, phone, is_active, created_at
    `;
    const values = [roleId, name, email, passwordHash, phone || null];
    const { rows } = await db.query(query, values);
    return rows[0];
  },

  async findById(id) {
    const query = `
      SELECT u.id, u.name, u.email, u.phone, u.is_active, r.name AS role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0] || null;
  },
};

module.exports = UserModel;