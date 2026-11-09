// Daftar area kerja (peran), tab di tiap area, dan siapa boleh membuka apa.
// Kunci peran disamakan dengan nama peran di database: owner, produksi, kasir, pengantar, mitra.
export const ROLES = {
  owner: {
    label: 'Pemilik',
    sub: 'Akses penuh',
    tabs: ['Ringkasan', 'Mitra & harga', 'Aset dapur', 'Persetujuan', 'Settlement', 'Pengguna'],
  },
  produksi: {
    label: 'Produksi & gudang',
    sub: 'Bahan, resep, batch',
    tabs: ['Bahan baku', 'Produksi (SPK)', 'Batch & kedaluwarsa', 'Catatan pengurangan'],
  },
  kasir: {
    label: 'Kasir',
    sub: 'Gerai toko pusat',
    tabs: ['Kasir', 'Shift & kas'],
  },
  pengantar: {
    label: 'Kurir',
    sub: 'Logistik harian',
    tabs: ['Manifes rute'],
  },
  mitra: {
    label: 'Reseller / mitra',
    sub: 'Gerai titip-jual',
    tabs: ['Stok & penjualan', 'Pesan stok', 'Retur', 'Tagihan'],
  },
};

// Peran akun -> area kerja yang boleh dibuka
export const ACCESS = {
  owner: ['owner', 'produksi', 'kasir', 'pengantar', 'mitra'],
  produksi: ['produksi'],
  kasir: ['kasir'],
  pengantar: ['pengantar'],
  mitra: ['mitra'],
};

// Kalimat pengantar di bawah judul halaman
export const ROLE_HEADS = {
  owner: 'Pantau seluruh jaringan titip-jual dan putuskan dari satu layar.',
  produksi: 'Pastikan bahan cukup, jalankan produksi, dan lacak setiap batch.',
  kasir: 'Layani pembeli di gerai pusat dan jaga kas tetap cocok.',
  pengantar: 'Antar pasokan sesuai rute dan minta bukti serah terima di tiap titik.',
  mitra: 'Catat penjualan, pesan stok, laporkan retur, dan cek tagihan tanpa memasang aplikasi.',
};
