import { TODAY, addDays, batchNo } from '../utils/formatters';

// Data contoh untuk dashboard (sementara).
// Server belum punya endpoint bahan, produksi, dan retur, jadi data awal diambil dari prototipe.
// Nanti isi fungsi ini diganti pemanggilan API memakai apiClient.
export function getInitialData() {
  return {
    // Bahan baku: stock = stok sekarang, rop = batas pesan ulang, price = harga per satuan (Rp)
    ingredients: [
      { id: 'tepung', name: 'Tepung terigu', unit: 'g', stock: 42000, rop: 18000, price: 12 },
      { id: 'gula', name: 'Gula pasir', unit: 'g', stock: 14000, rop: 5000, price: 17 },
      { id: 'ragi', name: 'Ragi instan', unit: 'g', stock: 1600, rop: 500, price: 90 },
      { id: 'ayam', name: 'Isian ayam kecap', unit: 'g', stock: 6500, rop: 8000, price: 38 },
      { id: 'bumbu', name: 'Bumbu isian', unit: 'g', stock: 3200, rop: 1000, price: 60 },
      { id: 'plastik', name: 'Plastik vakum', unit: 'pcs', stock: 520, rop: 200, price: 350 },
    ],

    // Resep: yield = butir per adonan, opex = biaya operasional, items = [id bahan, takaran]
    bom: {
      name: 'Bakpau ayam kecap',
      yield: 60,
      opex: 45000,
      items: [
        ['tepung', 6000],
        ['gula', 1200],
        ['ragi', 80],
        ['ayam', 4000],
        ['bumbu', 500],
        ['plastik', 60],
      ],
    },

    // Batch di cold storage: qty = jumlah dibuat, left = sisa
    batches: [
      {
        id: batchNo(addDays(TODAY, -4), 1),
        made: addDays(TODAY, -4),
        exp: addDays(TODAY, 26),
        qty: 120,
        left: 96,
      },
      {
        id: batchNo(addDays(TODAY, -2), 1),
        made: addDays(TODAY, -2),
        exp: addDays(TODAY, 28),
        qty: 180,
        left: 180,
      },
    ],

    // Mitra titip-jual: sent = dikirim, sold = terjual, returned = diretur
    partners: [
      {
        id: 'p1',
        name: 'Rina Wulandari',
        type: 'Kedai kopi',
        zone: 'Zona Selatan',
        sent: 240,
        sold: 196,
        returned: 8,
        pin: '4821',
      },
      {
        id: 'p2',
        name: 'Budi Santoso',
        type: 'Kantin sekolah',
        zone: 'Zona Pusat',
        sent: 300,
        sold: 262,
        returned: 12,
        pin: '1175',
      },
      {
        id: 'p3',
        name: 'Siti Aminah',
        type: 'Toko oleh-oleh',
        zone: 'Zona Pusat',
        sent: 180,
        sold: 121,
        returned: 18,
        pin: '9034',
      },
      {
        id: 'p4',
        name: 'Dedi Prasetyo',
        type: 'Minimarket lokal',
        zone: 'Zona Selatan',
        sent: 150,
        sold: 143,
        returned: 2,
        pin: '5560',
      },
    ],

    // Manifes pengantaran hari ini: p = id mitra tujuan
    manifest: [
      { id: 'm1', p: 'p1', qty: 60, done: false },
      { id: 'm2', p: 'p4', qty: 48, done: false },
      { id: 'm3', p: 'p3', qty: 36, done: false },
      { id: 'm4', p: 'p2', qty: 72, done: false },
    ],

    // Klaim retur dari mitra
    claims: [{ id: 'c1', p: 'p3', qty: 6, status: 'menunggu', date: addDays(TODAY, -1) }],

    // Aset dapur
    assets: [
      {
        id: 'ALT-001',
        name: 'Kukusan industri 5 susun',
        loc: 'Dapur produksi',
        cond: 'Baik',
        scan: addDays(TODAY, -3),
        flag: false,
      },
      {
        id: 'ALT-002',
        name: 'Mixer adonan 20 liter',
        loc: 'Dapur produksi',
        cond: 'Baik',
        scan: addDays(TODAY, -5),
        flag: false,
      },
      {
        id: 'ALT-003',
        name: 'Timbangan digital 30 kg',
        loc: 'Dapur produksi',
        cond: 'Layak',
        scan: addDays(TODAY, -6),
        flag: false,
      },
      {
        id: 'ALT-004',
        name: 'Kompor gas dua tungku',
        loc: 'Dapur produksi',
        cond: 'Layak',
        scan: addDays(TODAY, -6),
        flag: false,
      },
      {
        id: 'ALT-005',
        name: 'Mesin vacuum sealer',
        loc: 'Gudang',
        cond: 'Baik',
        scan: addDays(TODAY, -2),
        flag: false,
      },
      {
        id: 'ALT-006',
        name: 'Freezer cold storage',
        loc: 'Gudang',
        cond: 'Baik',
        scan: addDays(TODAY, -1),
        flag: false,
      },
      {
        id: 'ALT-007',
        name: 'Panci kukus besar',
        loc: 'Dapur produksi',
        cond: 'Tidak layak',
        scan: addDays(TODAY, -1),
        flag: false,
      },
      {
        id: 'ALT-008',
        name: 'Loyang dan nampan stainless',
        loc: 'Dapur produksi',
        cond: 'Layak',
        scan: addDays(TODAY, -4),
        flag: false,
      },
      {
        id: 'ALT-009',
        name: 'Troli rak pendingin',
        loc: 'Gudang',
        cond: 'Tidak layak',
        scan: addDays(TODAY, -2),
        flag: false,
      },
    ],

    // Harga per butir: ke mitra (grosir) dan ke pembeli lewat kasir (eceran)
    price: { mitra: 9000, kasir: 12000 },

    // Riwayat aktivitas (terbaru di atas), kosong saat awal
    ledger: [],

    // Keadaan kasir
    pos: { shift: null, cart: {}, sales: [], pay: 'tunai', lastClose: null, revenue: 0, units: 0 },

    // Draf bukti serah terima kurir
    podDraft: null,
  };
}
