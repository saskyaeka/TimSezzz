// Format angka dan rupiah
export const rp = (n) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
export const nf = (n) => Math.round(n || 0).toLocaleString('id-ID');
export const nf2 = (n) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
export const pct = (n) => ((n || 0) * 100).toFixed(1).replace('.', ',') + '%';

// Helper parsing tanggal aman
export const toDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Tanggal hari ini
export const TODAY = new Date();

export const dstr = (d) => {
  const dateObj = toDate(d);
  if (!dateObj) return '-';
  return dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const addDays = (d, n) => {
  const base = toDate(d) || new Date();
  const x = new Date(base);
  x.setDate(x.getDate() + n);
  return x;
};

export const pad2 = (n) => String(n).padStart(2, '0');

// Nomor batch: BPK-TAHUNBULANTANGGAL-URUTAN, contoh BPK-20261005-01
export const batchNo = (d, seq) => {
  const dateObj = toDate(d) || new Date();
  return (
    'BPK-' +
    dateObj.getFullYear() +
    pad2(dateObj.getMonth() + 1) +
    pad2(dateObj.getDate()) +
    '-' +
    pad2(seq)
  );
};

// Selisih pemakaian bahan, contoh: "+800 g", "−10 g", atau "Sesuai"
export const diffTxt = (d, unit) =>
  Math.abs(d) < 1e-9 ? 'Sesuai' : (d > 0 ? '+' : '−') + nf2(Math.abs(d)) + ' ' + unit;

// Waktu singkat, contoh: "3 Okt, 09.15"
export const fmtT = (t) => {
  const dateObj = toDate(t);
  if (!dateObj) return '-';
  return dateObj.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
