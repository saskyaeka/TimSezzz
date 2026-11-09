const test = require('node:test');
const assert = require('node:assert/strict');
const {
  date,
  decimal,
  enumValue,
  integer,
  pagination,
  text,
} = require('../src/utils/operationsValidation');
const { HttpError } = require('../src/utils/httpError');

function assertBadRequest(action) {
  assert.throws(action, (error) => error instanceof HttpError && error.status === 400);
}

test('text input is trimmed and constrained', () => {
  assert.equal(text('  Zona Selatan  ', 'Zona', { max: 30 }), 'Zona Selatan');
  assert.equal(text('', 'Catatan', { optional: true }), null);
  assertBadRequest(() => text(' ', 'Nama', { min: 2 }));
  assertBadRequest(() => text(12, 'Nama'));
});

test('integer and decimal validation reject empty, non-finite, and out-of-range values', () => {
  assert.equal(integer('6', 'Jumlah', { min: 1 }), 6);
  assert.equal(decimal('12.5', 'Harga'), 12.5);
  assertBadRequest(() => integer('', 'Jumlah'));
  assertBadRequest(() => integer(1.5, 'Jumlah'));
  assertBadRequest(() => decimal(Infinity, 'Harga'));
  assertBadRequest(() => decimal(-1, 'Harga'));
});

test('enum and pagination validation enforce allowed values and bounded page size', () => {
  assert.equal(enumValue('tunai', 'Pembayaran', ['tunai', 'qris']), 'tunai');
  assertBadRequest(() => enumValue('transfer', 'Pembayaran', ['tunai', 'qris']));
  assert.deepEqual(pagination({ limit: '10', offset: '20' }), { limit: 10, offset: 20 });
  assertBadRequest(() => pagination({ limit: 101 }));
});

test('date validation accepts real calendar dates only', () => {
  assert.equal(date('2026-11-09', 'Tanggal'), '2026-11-09');
  assertBadRequest(() => date('2026-02-31', 'Tanggal'));
  assertBadRequest(() => date('09-11-2026', 'Tanggal'));
});
