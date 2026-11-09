// Format angka dan rupiah
export const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
export const nf = (n) => Math.round(n).toLocaleString('id-ID');
export const nf2 = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
export const pct = (n) => (n * 100).toFixed(1).replace('.', ',') + '%';

// Tanggal
export const TODAY = new Date(2026, 9, 5);
export const dstr = (d) =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const pad2 = (n) => String(n).padStart(2, '0');

// Nomor batch: BPK-TAHUNBULANTANGGAL-URUTAN, contoh BPK-20261005-01
export const batchNo = (d, seq) =>
  'BPK-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(seq);
