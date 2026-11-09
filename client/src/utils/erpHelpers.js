// Rumus turunan dari data dashboard.
// Semua fungsi menerima `data` (isi getInitialData) sebagai parameter pertama.

export const findPartner = (data, id) => data.partners.find((p) => p.id === id);
export const findIngredient = (data, id) => data.ingredients.find((i) => i.id === id);

// Sisa stok di satu mitra
export const stockOf = (p) => p.sent - p.sold - p.returned;

// Total butir di cold storage pusat
export const coldStock = (data) => data.batches.reduce((a, b) => a + b.left, 0);

// Total stok yang sedang berada di mitra
export const floating = (data) => data.partners.reduce((a, p) => a + stockOf(p), 0);

// Total butir yang masih di jalan (manifes belum selesai)
export const inTransit = (data) =>
  data.manifest.filter((m) => !m.done).reduce((a, m) => a + m.qty, 0);

// Harga pokok produksi: bahan + operasional, dan per butir
export function hpp(data) {
  const mat = data.bom.items.reduce((a, [id, q]) => a + findIngredient(data, id).price * q, 0);
  return { mat, total: mat + data.bom.opex, per: (mat + data.bom.opex) / data.bom.yield };
}

// Tagihan satu mitra: hanya bakpau terjual yang ditagih, retur tidak ditagih
export function settle(data, p) {
  const gross = p.sold * data.price.mitra;
  return { gross, net: gross };
}

// Tambah satu catatan ke buku besar (terbaru di atas, maksimal 30 catatan).
// Mengembalikan data baru, jadi dipakai di dalam setData((d) => addLog(d, ...)).
export function addLog(data, kind, text, by = '') {
  return { ...data, ledger: [{ t: new Date(), kind, text, by }, ...data.ledger].slice(0, 30) };
}
