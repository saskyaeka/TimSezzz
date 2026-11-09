const { assert } = require('./httpError');

function text(value, label, { min = 1, max = 200, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  assert(typeof value === 'string', 400, `${label} wajib berupa teks.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 400, `${label} harus berisi ${min}-${max} karakter.`);
  return result;
}

function integer(value, label, { min = 0, max = 10000000 } = {}) {
  assert(value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') && typeof value !== 'boolean',
  400, `${label} wajib berupa angka.`);
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= min && number <= max, 400, `${label} harus bilangan bulat ${min}-${max}.`);
  return number;
}

function decimal(value, label, { min = 0, max = 1000000000 } = {}) {
  assert(value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') && typeof value !== 'boolean',
  400, `${label} wajib berupa angka.`);
  const number = Number(value);
  assert(Number.isFinite(number) && number >= min && number <= max, 400, `${label} harus angka ${min}-${max}.`);
  return number;
}

function enumValue(value, label, values) {
  assert(values.includes(value), 400, `${label} tidak valid. Pilihan: ${values.join(', ')}.`);
  return value;
}

function pagination(query) {
  const limit = integer(query.limit ?? 50, 'limit', { min: 1, max: 100 });
  const offset = integer(query.offset ?? 0, 'offset', { min: 0, max: 10000000 });
  return { limit, offset };
}

function date(value, label) {
  const result = text(value, label, { max: 10 });
  const parsed = new Date(`${result}T00:00:00Z`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(result) &&
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result,
  400, `${label} harus berformat YYYY-MM-DD dan merupakan tanggal valid.`);
  return result;
}

module.exports = { text, integer, decimal, enumValue, pagination, date };
