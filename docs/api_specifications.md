# Spesifikasi API Paolotory

Base URL lokal: `http://localhost:5001/api`

API operasional memerlukan `Authorization: Bearer <JWT>` dari `/auth/login`.
Peran dicek server-side; menyembunyikan menu di client bukan kontrol akses.
Server membaca konfigurasi PostgreSQL dan JWT dari `server/.env`.

Siapkan database dengan menjalankan `docs/database_scheme.sql`, lalu
`server/src/db/operations_schema.sql`. Untuk membuat owner pertama, atur
`BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_NAME`, dan
`BOOTSTRAP_OWNER_PASSWORD` sementara di `server/.env`, kemudian jalankan
`npm run create:owner` dari folder `server`. Skrip tidak menimpa owner yang
sudah ada. Hapus nilai password bootstrap setelah selesai.

Paginated list mendukung `limit` (1-100, default 50) dan `offset` (default 0).
Error menggunakan `{ "success": false, "message": "..." }`.

## API Autentikasi

## `POST /auth/register`

Menerima `name`, `email`, dan `password`. Registrasi publik **selalu** dibuat
dengan role `partner` dan status `pending`; nilai role atau partner ID yang
dikirim client tidak digunakan. Pemilik harus menghubungkan akun ke gerai
(`partner_id`) dan mengubah status menjadi `aktif` sebelum akun dapat login.

Validasi: nama 2-100 karakter, email valid, dan kata sandi minimal 8 karakter
dengan setidaknya satu huruf dan satu angka. Batas kata sandi 72 byte mengikuti
batas bcrypt.

Respons `201`:

```json
{
  "success": true,
  "message": "Pendaftaran diterima. Akun menunggu persetujuan dan penautan gerai oleh pemilik.",
  "data": {
    "user": {
      "email": "mitra@example.id",
      "name": "Nama Mitra",
      "role": "partner",
      "partnerId": null
    }
  }
}
```

Respons gagal menggunakan `{ "success": false, "message": "..." }`. Email yang
sudah terdaftar menghasilkan `409`; input tidak valid menghasilkan `400`.

## `POST /auth/login`

Menerima `email` dan `password`. Email dinormalisasi menjadi huruf kecil.
Akun dengan status selain `aktif` tidak dapat login.

Respons `200` cocok dengan client React:

```json
{
  "success": true,
  "message": "Login berhasil.",
  "token": "<JWT>",
  "user": {
    "email": "mitra@example.id",
    "name": "Nama Mitra",
    "role": "partner",
    "partnerId": "p1"
  }
}
```

Kredensial salah menghasilkan `401`; akun nonaktif/menunggu persetujuan
menghasilkan `403`.

## `GET /auth/me`

Memerlukan header `Authorization: Bearer <JWT>`. Profil dikembalikan dari
database, sehingga perubahan role/status pada akun langsung berlaku dan akun
yang dinonaktifkan tidak dapat memakai sesi lama.

```json
{
  "success": true,
  "data": {
    "user": {
      "email": "mitra@example.id",
      "name": "Nama Mitra",
      "role": "partner",
      "partnerId": "p1"
    }
  }
}
```

## Menjalankan backend

1. Salin `server/.env.example` menjadi `server/.env`.
2. Isi kredensial PostgreSQL dan `JWT_SECRET` acak minimal 32 karakter.
3. Jalankan `npm install` dan `npm run dev` dari folder `server`.
4. Client Vite memakai proxy `/api` ke `http://localhost:5001`.

`GET /api/health` memeriksa konektivitas database; merespons `503` bila database
tidak dapat diakses.

## Master data dan owner

Semua endpoint berikut hanya untuk role `owner`.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/owner/dashboard` | Ringkasan cold stock, stok berjalan, retur/pesanan menunggu, dan bahan perlu dipesan |
| `GET` | `/owner/audit-logs` | Buku besar tindakan operasional terbaru |
| `GET`, `POST` | `/owner/partners` | Daftar atau buat gerai. Pembuatan menerima `name`, `type`, `zone`, PIN empat digit, `address` opsional, dan `initialQty` opsional |
| `PATCH` | `/owner/partners/:partnerId` | Ubah data gerai atau `pricePerUnit` |
| `GET` | `/owner/prices` | Harga jual mitra dan harga kasir |
| `PATCH` | `/owner/prices` | Ubah salah satu atau keduanya: `partnerPrice`, `centralPrice` |
| `GET`, `POST` | `/owner/assets` | Daftar/buat aset: `id`, `name`, `location`, `condition` |
| `PATCH` | `/owner/assets/:assetId` | Ubah nama/lokasi/kondisi; kondisi baru mengatur ulang persetujuan write-off |
| `POST` | `/owner/assets/:assetId/approve-writeoff` | Setujui write-off aset berkondisi `Tidak layak` |
| `GET`, `POST` | `/owner/users` | Daftar/buat akun staf; pembuatan menerima `name`, `email`, `password`, `role`, dan `partnerId` jika role mitra |
| `PATCH` | `/owner/users/:email` | Ubah `role`, `status` (`aktif`, `nonaktif`, `pending`) atau `partnerId` |
| `GET` | `/owner/orders` | Tinjau pesanan stok mitra |
| `PATCH` | `/owner/orders/:orderId/review` | Terima `decision: "disetujui"` atau `"ditolak"`. Persetujuan membuat manifes dan reservasi batch |
| `GET` | `/owner/claims` | Daftar retur mitra |
| `PATCH` | `/owner/claims/:claimId/review` | Terima `decision: "dikonfirmasi"` atau `"ditolak"` |
| `GET` | `/owner/manifests` | Semua manifes |
| `POST` | `/owner/manifests` | Buat pengiriman langsung dengan `partnerId` dan `quantity` |
| `POST` | `/owner/manifests/:manifestId/cancel` | Batalkan pengiriman yang belum selesai dan lepaskan reservasi stok |
| `GET` | `/owner/partners/:partnerId/inventory` | Stok dan pasokan gerai |
| `GET` | `/owner/partners/:partnerId/sales` | Riwayat laporan penjualan gerai |
| `GET` | `/owner/partners/:partnerId/settlement` | Perhitungan tagihan/setoran; mendukung rentang `from`/`to` |
| `GET` | `/owner/settlements` | Ringkasan settlement seluruh gerai; mendukung rentang `from`/`to` |

`GET /owner/settlements/:partnerId` juga tersedia sebagai alias laporan settlement.
Role owner dapat mengakses endpoint kitchen, POS, dan logistics untuk keperluan
operasional serta supervisi. Akun owner yang sedang login tidak dapat diubah
melalui endpoint manajemen pengguna.

## Dapur dan gudang

Role `kitchen` dan `owner` dapat memakai endpoint dapur, kecuali perubahan resep
yang hanya untuk owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/kitchen/ingredients` | Daftar stok bahan dan status reorder point |
| `POST` | `/kitchen/ingredients` | Buat bahan (`id`, `name`, `unit`, `price`; `stock`/`rop` opsional) |
| `PATCH` | `/kitchen/ingredients/:ingredientId` | Ubah data bahan, ROP, atau harga beli; stok hanya berubah melalui mutasi |
| `GET` | `/kitchen/recipe` | Baca hasil resep, biaya operasi, dan daftar bahan BOM |
| `PUT` | `/kitchen/recipe` | Owner mengubah `yield`, `opex`, dan `items: [{ ingredientId, quantity }]` |
| `GET` | `/kitchen/batches` | Daftar batch dan jumlah cold storage yang belum teralokasi |
| `GET` | `/kitchen/movements` | Buku besar mutasi bahan |
| `GET` | `/kitchen/production` | Riwayat SPK produksi, rincian bahan terpakai, HPP, dan batch |
| `GET`, `POST` | `/kitchen/purchase-orders` | Daftar/buat PO (`ingredientId`, `quantity`, `note` opsional) |
| `POST` | `/kitchen/purchase-orders/:orderId/receive` | Terima PO satu kali; menambah stok dan mencatat mutasi |
| `POST` | `/kitchen/production` | Produksi resep, mengurangi bahan secara transaksional, dan membuat batch |
| `POST` | `/kitchen/adjustments` | Catat pengurangan di luar produksi (`ingredientId`, `quantity`, `reason`, `note` opsional) |

Contoh produksi otomatis:

```json
{ "recipeCount": 2, "usageMode": "auto", "note": "Produksi pagi" }
```

Mode `manual` menerima objek `items` berisi jumlah bahan per ID, contoh
`{ "recipeCount": 1, "usageMode": "manual", "items": { "tepung": 6200 } }`.
Tanggal kedaluwarsa opsional (`expDate`) harus tidak lebih awal dari tanggal
produksi. Setiap run, penyesuaian, penerimaan PO, dan perubahan resep tercatat.

## Kasir toko pusat

Role `pos` dan `owner` dapat memakai endpoint POS.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/pos/products` | Produk dan harga yang dihitung server dari harga pusat |
| `GET` | `/pos/shifts/current` | Shift aktif kasir yang login |
| `POST` | `/pos/shifts/open` | Buka shift (`openingCash`) |
| `POST` | `/pos/shifts/close` | Tutup shift (`countedCash`); server menghitung kas seharusnya |
| `GET` | `/pos/shifts/:shiftId/sales` | Riwayat transaksi; kasir hanya dapat melihat shift sendiri |
| `POST` | `/pos/sales` | Checkout item dan pembayaran |
| `POST` | `/pos/spoilage` | Catat produk rusak; stok batch dikurangi untuk produk beku |

Contoh checkout:

```json
{
  "paymentMethod": "tunai",
  "receivedAmount": 50000,
  "items": [{ "productId": "pack6", "quantity": 1 }]
}
```

`paymentMethod` adalah `tunai` atau `qris`; harga dan total dihitung server.
Integrasi QRIS/payment gateway aktual belum termasuk.

## Kurir dan distribusi

Role `courier` mengakses manifes yang belum ditugaskan atau ditugaskan kepadanya;
role owner dapat mengakses seluruh manifes.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/logistics/manifests` | Daftar manifes dan bukti yang sudah tercatat |
| `POST` | `/logistics/manifests/:manifestId/claim` | Ambil manifes yang belum diambil kurir lain |
| `POST` | `/logistics/manifests/:manifestId/deliver` | Konfirmasi e-POD dengan URL foto HTTPS, lokasi opsional, dan nama penerima opsional |

Contoh konfirmasi: `{ "photoUrl": "https://storage.example/pod.jpg", "latitude": -6.2, "longitude": 106.8, "receivedBy": "PIC gerai" }`.
Unggah foto ke storage cloud dilakukan di luar API ini. Pengantaran mengonsumsi
batch yang telah direservasi; reservasi FEFO dibatalkan bila manifes dibatalkan.

## Portal mitra

Semua endpoint portal berikut khusus role `partner` dan mengambil `partnerId`
dari akun aktif, bukan dari input client.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/partner/inventory` | Stok saat ini, stok yang dapat dilaporkan, klaim tertunda, dan pasokan masuk |
| `POST`, `GET` | `/partner/sales` | Catat penjualan (`quantity`) dan lihat riwayat; daftar mendukung `from`/`to` |
| `POST`, `GET` | `/partner/orders` | Ajukan jumlah pasokan (`quantity`, `note` opsional) dan lihat status |
| `POST`, `GET` | `/partner/claims` | Ajukan retur (`quantity`, `photoUrl` HTTPS opsional) dan lihat status |
| `GET` | `/partner/settlement` | Lihat settlement gerai; mendukung rentang `from`/`to` |

Laporan penjualan dan retur mengunci saldo mitra dalam transaksi. Klaim yang
menunggu persetujuan ikut mengurangi stok yang tersedia untuk laporan penjualan
atau klaim baru, sehingga saldo tidak dapat menjadi negatif.