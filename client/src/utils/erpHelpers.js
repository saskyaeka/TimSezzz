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

// Katalog produk kasir. cold = butir yang diambil dari cold storage, disc = diskon paket
export const POS_PRODUCTS = [
  { id: 'hangat', name: 'Bakpau hangat', note: 'Satuan, dari kukusan toko', disc: 0, cold: 0 },
  { id: 'pack6', name: 'Pack beku isi 6', note: 'Dari cold storage pusat', disc: 1 / 12, cold: 6 },
  {
    id: 'pack12',
    name: 'Pack beku isi 12',
    note: 'Dari cold storage pusat',
    disc: 0.125,
    cold: 12,
  },
];

// Harga produk kasir mengikuti harga kasir yang diatur pemilik, dibulatkan ke Rp100
export const posPrice = (data, p) =>
  Math.round((data.price.kasir * (p.cold || 1) * (1 - p.disc)) / 100) * 100;

// Total isi keranjang kasir
export const cartTotal = (data) =>
  Object.entries(data.pos.cart).reduce(
    (a, [id, q]) =>
      a +
      posPrice(
        data,
        POS_PRODUCTS.find((p) => p.id === id)
      ) *
        q,
    0
  );

// Pemakaian bahan standar = takaran 1 resep x jumlah resep
export const stdUse = (data, id, resep) => data.bom.items.find((x) => x[0] === id)[1] * resep;

// Kurangi cold storage sebanyak n butir. Batch yang paling dekat kedaluwarsa diambil dulu.
// Mengembalikan daftar batch baru.
export function consumeCold(batches, n) {
  let rest = n;
  const taken = new Map();
  for (const b of [...batches].sort((a, c) => a.exp - c.exp)) {
    if (rest <= 0) break;
    const take = Math.min(b.left, rest);
    taken.set(b.id, take);
    rest -= take;
  }
  return batches.map((b) => (taken.has(b.id) ? { ...b, left: b.left - taken.get(b.id) } : b));
}

// Label status pesanan stok mitra: [warna, teks]
export const ORDER_STATUS = {
  menunggu: ['warn', 'Menunggu persetujuan'],
  disetujui: ['good', 'Disetujui, dijadwalkan kurir'],
  ditolak: ['bad', 'Ditolak'],
};

// Jumlah retur dan pesanan yang menunggu keputusan pemilik
export const pendingApprovals = (data) =>
  data.claims.filter((c) => c.status === 'menunggu').length +
  data.orders.filter((o) => o.status === 'menunggu').length;

// Angka kecil di samping nama tab (0 = tidak ditampilkan)
export const tabBadge = (data, role, i) =>
  role === 'owner' && i === 3 ? pendingApprovals(data) : 0;

// Membuat kode unik untuk data baru, contoh: newId('m') -> "mlr8k2x1a"
export const newId = (prefix) => prefix + Date.now().toString(36);
