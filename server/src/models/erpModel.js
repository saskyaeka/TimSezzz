import { pool } from '../db/connection.js';

export const ErpModel = {
  async getAllInitialData(user) {
    const [products] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    const [batches] = await pool.query(`
      SELECT pb.*, p.name AS product_name 
      FROM production_batches pb 
      JOIN products p ON pb.product_id = p.id 
      ORDER BY pb.created_at DESC
    `);

    let orderQuery = 'SELECT * FROM orders ORDER BY created_at DESC';
    let params = [];

    // Filter khusus jika user adalah mitra atau pengantar
    if (user.role === 'mitra') {
      orderQuery = 'SELECT * FROM orders WHERE mitra_id = ? ORDER BY created_at DESC';
      params = [user.id];
    } else if (user.role === 'pengantar') {
      orderQuery = 'SELECT * FROM orders WHERE status IN ("diproses", "dikirim") ORDER BY created_at DESC';
    }

    const [orders] = await pool.query(orderQuery, params);

    return { products, batches, orders };
  },

  async createProductionBatch({ product_id, qty }) {
    const [result] = await pool.query(
      'INSERT INTO production_batches (product_id, qty, status) VALUES (?, ?, "pending")',
      [product_id, qty]
    );
    return { id: result.insertId, product_id, qty, status: 'pending' };
  },

  async updateProductionStatus(id, status) {
    await pool.query('UPDATE production_batches SET status = ? WHERE id = ?', [status, id]);
    if (status === 'selesai') {
      await pool.query(`
        UPDATE products p 
        JOIN production_batches pb ON p.id = pb.product_id 
        SET p.stock = p.stock + pb.qty 
        WHERE pb.id = ?
      `, [id]);
    }
  },

  async createOrder({ customer_name, mitra_id, total }) {
    const [result] = await pool.query(
      'INSERT INTO orders (customer_name, mitra_id, total, status) VALUES (?, ?, ?, "menunggu")',
      [customer_name, mitra_id || null, total]
    );
    return { id: result.insertId, customer_name, mitra_id, total, status: 'menunggu' };
  },

  async updateOrderStatus(id, status, courier_id = null) {
    if (courier_id) {
      await pool.query(
        'UPDATE orders SET status = ?, courier_id = ? WHERE id = ?',
        [status, courier_id, id]
      );
    } else {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    }
  },
};