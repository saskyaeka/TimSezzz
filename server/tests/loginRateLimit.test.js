const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createLoginRateLimiter } = require('../src/middlewares/loginRateLimit');

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createTestApp(limiter) {
  const app = express();
  app.use(express.json());
  app.post('/login', limiter, (req, res) => {
    if (req.body.successful) {
      return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Email atau kata sandi salah.' });
  });
  return app;
}

async function login(url, body = {}) {
  return fetch(`${url}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('login membatasi percobaan gagal dan mengirim respons API 429', async () => {
  const app = createTestApp(createLoginRateLimiter({ limit: 2, windowMs: 60_000 }));

  await withServer(app, async (url) => {
    assert.equal((await login(url)).status, 401);
    assert.equal((await login(url)).status, 401);

    const limited = await login(url);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('ratelimit-limit'), '2');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.deepEqual(await limited.json(), {
      success: false,
      message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
    });
  });
});

test('login sukses tidak memakai jatah percobaan gagal', async () => {
  const app = createTestApp(createLoginRateLimiter({ limit: 1, windowMs: 60_000 }));

  await withServer(app, async (url) => {
    assert.equal((await login(url, { successful: true })).status, 200);
    assert.equal((await login(url, { successful: true })).status, 200);
    assert.equal((await login(url)).status, 401);
    assert.equal((await login(url)).status, 429);
  });
});

test('batas percobaan login pulih setelah jendela waktunya lewat', async () => {
  const app = createTestApp(createLoginRateLimiter({ limit: 1, windowMs: 100 }));

  await withServer(app, async (url) => {
    assert.equal((await login(url)).status, 401);
    assert.equal((await login(url)).status, 429);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal((await login(url)).status, 401);
  });
});
