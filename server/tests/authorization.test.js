const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeRoles } = require('../src/middlewares/authorization');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('authorizeRoles allows an explicitly permitted role', () => {
  const res = response();
  let continued = false;
  authorizeRoles('owner', 'kitchen')(
    { user: { role: 'kitchen' } },
    res,
    () => { continued = true; }
  );
  assert.equal(continued, true);
  assert.equal(res.statusCode, 200);
});

test('authorizeRoles rejects a missing or unpermitted role', () => {
  for (const user of [undefined, { role: 'partner' }]) {
    const res = response();
    let continued = false;
    authorizeRoles('owner', 'kitchen')({ user }, res, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
  }
});
