const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-with-at-least-32-bytes-length!';
process.env.JWT_EXPIRES_IN = '1d';

const UserModel = require('../src/models/UserModel');
const authController = require('../src/controllers/authController');
const { authenticateToken } = require('../src/middlewares/authMiddleware');
const { getJwtSecret } = require('../src/config/jwt');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

test('registrasi membuat akun partner berstatus pending tanpa mempercayai role dari client', async () => {
  const origFind = UserModel.findByEmail;
  const origCreate = UserModel.createPendingPartner;
  let capturedInput = null;

  UserModel.findByEmail = async () => null;
  UserModel.createPendingPartner = async (payload) => {
    capturedInput = payload;
    return {
      email: payload.email,
      name: payload.name,
      role: 'partner',
      status: 'pending',
      partner_id: null,
    };
  };

  try {
    const res = mockRes();
    await authController.register(
      {
        body: {
          name: 'Mitra Baru',
          email: 'MITRA@Example.id',
          password: 'Password123',
          role: 'owner',
          partnerId: 'p1',
        },
      },
      res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.role, 'partner');
    assert.equal(res.body.data.user.partnerId, null);
    assert.equal(capturedInput.email, 'mitra@example.id');
    assert.equal(await bcrypt.compare('Password123', capturedInput.passwordHash), true);
  } finally {
    UserModel.findByEmail = origFind;
    UserModel.createPendingPartner = origCreate;
  }
});

test('login akun aktif menghasilkan JWT HS256 dan profil user', async () => {
  const origFind = UserModel.findByEmail;
  const hash = await bcrypt.hash('Rahasia123', 10);

  UserModel.findByEmail = async () => ({
    email: 'kasir@example.id',
    name: 'Kasir Pusat',
    role: 'pos',
    status: 'aktif',
    partner_id: null,
    password_hash: hash,
  });

  try {
    const res = mockRes();
    await authController.login({ body: { email: 'KASIR@example.id', password: 'Rahasia123' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.role, 'pos');
    const decoded = jwt.verify(res.body.token, getJwtSecret(), { algorithms: ['HS256'] });
    assert.equal(decoded.sub, 'kasir@example.id');
  } finally {
    UserModel.findByEmail = origFind;
  }
});

test('login menolak akun pending atau nonaktif dengan status 403', async () => {
  const origFind = UserModel.findByEmail;
  const hash = await bcrypt.hash('Rahasia123', 10);

  UserModel.findByEmail = async () => ({
    email: 'pending@example.id',
    name: 'Mitra Pending',
    role: 'partner',
    status: 'pending',
    partner_id: null,
    password_hash: hash,
  });

  try {
    const res = mockRes();
    await authController.login({ body: { email: 'pending@example.id', password: 'Rahasia123' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
  } finally {
    UserModel.findByEmail = origFind;
  }
});

test('authenticateToken memvalidasi Bearer JWT dan menolak akun nonaktif', async () => {
  const origFindPublic = UserModel.findPublicByEmail;
  const token = jwt.sign({ sub: 'owner@example.id' }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '1h' });

  UserModel.findPublicByEmail = async () => ({
    email: 'owner@example.id',
    name: 'Pemilik',
    role: 'owner',
    status: 'aktif',
    partner_id: null,
  });

  try {
    let nextCalled = false;
    const req = {
      get: (header) => (header.toLowerCase() === 'authorization' ? `Bearer ${token}` : ''),
    };
    const res = mockRes();

    await authenticateToken(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.email, 'owner@example.id');
    assert.equal(req.user.role, 'owner');

    UserModel.findPublicByEmail = async () => ({
      email: 'owner@example.id',
      name: 'Pemilik',
      role: 'owner',
      status: 'nonaktif',
      partner_id: null,
    });
    const resInactive = mockRes();
    await authenticateToken(req, resInactive, () => {});
    assert.equal(resInactive.statusCode, 401);
  } finally {
    UserModel.findPublicByEmail = origFindPublic;
  }
});