const pool = require('../config/db');

const UserModel = {
  // Mencari user berdasarkan email beserta nama rolenya
  async findByEmail(email) {
    const query = `
      SELECT u.id, u.name, u.email, u.password_hash, u.phone, u.is_active, r.name AS role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1;
    `;
    const { rows } = await pool.query(query, [email.toLowerCase().trim()]);
    return rows[0];
  },

  // Mencari ID role berdasarkan nama role ('owner', 'kasir', 'mitra', 'pengantar')
  async findRoleIdByName(roleName) {
    const query = `SELECT id FROM roles WHERE LOWER(name) = LOWER($1);`;
    const { rows } = await pool.query(query, [roleName]);
    return rows[0] ? rows[0].id : null;
  },

  // Mendaftarkan user baru
  async create({ name, email, passwordHash, roleId, phone = null }) {
    const query = `
      INSERT INTO users (name, email, password_hash, role_id, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, role_id, created_at;
    `;
    const values = [name.trim(), email.toLowerCase().trim(), passwordHash, roleId, phone];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }
};

module.exports = UserModel;