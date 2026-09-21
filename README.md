Domain Manajemen Rantai Pasok Mikro / Kuliner Titip-Jual (Konsinyasi) (Enterprise Resource Planning & POS Hibrida untuk UMKM Kuliner).
Paolotory Platform Rantai Pasok Mikro ERP dan Manajemen Titip-Jual (Konsinyasi) Bakpau Berbasis Web Multiplatform

1.  Latar Belakang
    Model bisnis kuliner berbasis snack mengenyangkan khususnya produk bakpau sangat bertumpu pada strategi titip-jual (reseller). Skema ini dijalankan dengan menitipkan produk bakpau di berbagai titik strategis seperti kedai kopi, kantin sekolah/perkantoran, minimarket lokal, dan toko oleh-oleh. Konsumen bertransaksi langsung di lokasi reseller, sementara pasokan makanan dikirim secara berkala dari dapur pusat.

    Meskipun model ini memiliki potensi ekspansi titik penjualan yang cepat dengan biaya sewa tempat yang minim, operasional manual di lapangan memicu berbagai risiko kritis:

        •   Ketiadaan Visibilitas Stok Mengambang (Floating Stock): Dapur pusat kesulitan memantau sisa stok riil yang tersedia di reseller, sehingga jadwal restok sering terlambat atau justru berlebihan.
        •	Kerentanan Kehilangan dan Kerusakan Aset Fisik: Unit box tempat bakpau yang dipinjamkan rawan mengalami kerusakan, tertukar, atau hilang. Pemilik usaha juga dapat memiliki data kondisi aset fisik.
        •	Sengketa Klaim Retur Basi: Penanganan produk kedaluwarsa sering menjadi sumber konflik antara pemilik dan mitra akibat ketiadaan bukti fisik yang dapat diverifikasi saat penghitungan retur.
        •	Rekonsiliasi Keuangan yang Rumit: Perhitungan bagi hasil mingguan atau bulanan yang dilakukan secara manual menggunakan nota kertas rentan terhadap selisih hitung dan manipulasi setoran kas.
        •	Fragmentasi Dapur dan Toko Pusat: Ketiadaan integrasi antara data kebutuhan bahan baku mentah di dapur, penjualan langsung di gerai utama (flagship store), dan kebutuhan pasokan pada reseller menyebabkan pemborosan bahan mentah (food waste) atau terhentinya lini produksi.

2.  Solusi Aplikasi
    BaoStation Enterprise hadir sebagai platform web terintegrasi yang menggabungkan kapabilitas Enterprise Resource Planning (ERP) rantai pasok mikro dan Point of Sale (POS) hibrida. Sistem ini menghubungkan lima mata rantai operasional secara terpusat: pengadaan bahan baku, proses produksi dapur, kasir ritel toko pusat, logistik distribusi kurir, hingga portal mandiri mitra titip-jual.

    Dengan mendigitalkan pencatatan mutasi stok menggunakan prinsip buku besar (inventory ledger), melacak kondisi aset kukusan berbasis kode identitas fisik, dan mengotomatisasi penghitungan setoran bagi hasil, BaoStation mentransformasi pengelolaan titip-jual tradisional menjadi ekosistem distribusi yang transparan, akuntabel, dan minim kebocoran pendapatan.

3.  Target Pengguna & Hak Akses (RBAC)
    Sistem menerapkan kontrol akses berbasis peran (Role-Based Access Control) bertingkat untuk menjaga isolasi data antar-entitas bisnis:

    Peran Pengguna Deskripsi Pengguna Ruang Lingkup Hak Akses
    • Superadmin (Owner / Manajemen) Pemilik usaha dan jajaran manajemen utama. Otoritas penuh atas seluruh sistem: memonitor neraca laba-rugi global, menentukan rasio komisi konsinyasi per mitra, menyetujui mutasi/penghapusan aset kukusan, dan mengelola hak akses pengguna lain.
    • Kitchen & Warehouse Manager Penanggung jawab operasional gudang dan dapur produksi. Mengelola data pemasok, menerbitkan Purchase Order (PO) bahan mentah, memvalidasi bahan masuk, mengeksekusi Surat Perintah Kerja (SPK) produksi berbasis resep, dan mencatat stock opname bahan baku.
    • Kasir Toko Pusat Staf operasional gerai ritel/flagship dapur utama. Menjalankan transaksi penjualan langsung (walk-in customer), mengelola pembukaan dan penutupan shift kasir (cash drawer), menerima pembayaran tunai/non-tunai, serta mencatat produk rusak di etalase toko pusat.
    • Kurir Lapangan (Logistik) Tim distribusi pengantaran pasokan harian. Mengakses manifes rute pengantaran harian, memvalidasi bukti serah terima pasokan digital (electronic Proof of Delivery / e-POD) di lokasi mitra, dan mencatat pengembalian boks pendingin.
    • PIC / Operator Reseller Gerai Pengelola kafe, staf kantin, atau pemilik toko konsinyasi. Hak akses terisolasi khusus gerainya: mencatat penerimaan drop barang, melaporkan angka penjualan harian, dan mengunduh lembar tagihan bagi hasil (settlement).

4.  Peta Arsitektur & Alur Fitur Aplikasi
        •   Sistem BaoStation dibangun menggunakan arsitektur modular berlapis (multi-tier architecture) yang memisahkan antarmuka pengguna, logika bisnis, penyimpanan data terstruktur, dan berkas media cloud.
        ┌────────────────────────────────────────────────────────────────────────────────────────┐
        │                                          CLIENT TIER                                   │
        │ [Admin Web Panel]     [Kitchen Dashboard]     [Central POS Touch]     [Partner Portal] │
        └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                    │ HTTPS / REST API
        ┌───────────────────────────────────────────▼────────────────────────────────────────────┐
        │                                   APPLICATION & LOGIC TIER                             │
        │ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌────────────────────────┐     │
        │ │ RBAC & Auth Guard       │ │ Kitchen MRP Engine      │ │ POS & Drawer Logic     │     │
        │ └─────────────────────────┘ └─────────────────────────┘ └────────────────────────┘     │
        │ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌────────────────────────┐     │
        │ │ Logistics & e-POD State │ │ Auto-Settlement Billing │ │ Steamer Lifecycle (QR) │     │
        │ └─────────────────────────┘ └─────────────────────────┘ └────────────────────────┘     │
        └──────────────────────┬────────────────────────────────────────────┬────────────────────┘
                            │                                            │
        ┌──────────────────────▼─────────────────┐        ┌─────────────────▼────────────────────┐
        │ DATA PERSISTENCE TIER                  │        │ CLOUD STORAGE TIER                   │
        │ Relational Database (RDBMS)            │        │ Cloud Media (Bukti Retur, e-POD,     │
        │ (Users, Ledger, Assets, Orders, BOM)   │        │ Tanda Tangan Digital, QR Assets)     │
        └────────────────────────────────────────┘        └──────────────────────────────────────┘
        •   Alur Kerja Operasional Utama
        [1. PENGADAAN & PRODUKSI]
        Penerimaan Bahan Baku ──> Update Stok Gudang ──> SPK Masak Dimulai (Potong Bahan via BOM)
        │
        ├──> Hasil Jadi: Batch Produk Frozen (Lot ID)
        │
        ┌─────────────────────────────────────────────┴──────────────────┐
        ▼                                                                ▼
        [2. PENJUALAN RITEL PUSAT]                          [3. DISTRIBUSILOGISTIK]
        Kasir POS Pusat                                         Manifes Rute Pengantaran Kurir
        ├── Jual Satuan Hangat (Steamer Pusat)              ├── Muat Produk Frozen dari Cold Storage
        └── Jual Pack Beku (Cold Storage Pusat)             └── Drop-Off di Titik Mitra
        │
        ▼
        [4. OPERASIONAL TITIK MITRA]
        Portal Web Mitra (Tablet/HP)
        ├── Konfirmasi Terima Pasokan (e-POD)
        ├── Panaskan Bakpau di Smart Steamer
        ├── Catat Penjualan Harian
        └── Unggah Foto Klaim Retur Basi
        │
        ▼
        [5. REKONSILIASI & SETTLEMENT]
        Audit Sistem Otomatis
        ├── Verifikasi Retur oleh Superadmin
        ├── Kalkulasi Net Settlement Statement
        └── Tagihan Terbit & Restok Terjadwal

5.  Fitur Utama Sistem
    A. Pengendalian Bahan Baku & Produksi Dapur (Kitchen MRP)
    • Pencatatan Bill of Materials (BOM): Konfigurasi resep baku per batch produksi. Setiap kali perintah produksi dijalankan, sistem secara otomatis mengkalkulasi dan memotong saldo bahan mentah (tepung, ragi, isian daging, bumbu, hingga plastik kemasan vakum).

        •	Kalkulasi HPP Aktual Dinamis: Menghitung Harga Pokok Penjualan riil per butir bakpau berdasarkan akumulasi harga beli bahan baku terkini ditambah alokasi biaya operasional batch.

        •	Peringatan Reorder Point (ROP): Notifikasi otomatis kepada manajer dapur saat stok bahan mentah mendekati ambang batas aman pemesanan ulang.

        •	Pelacakan Nomor Batch & Kedaluwarsa: Memberikan identitas unik pada setiap kelompok hasil produksi untuk kemudahan penelusuran mutu (traceability).

    B. Kasir Ritel Toko Pusat (Central POS)
    • Manajemen Produk (Product Management): Mendukung transaksi kasir untuk produk siap konsumsi (ambil dari kukusan toko)

        •	Kontrol Shift Kasir & Rekonsiliasi Kas: Pencatatan modal awal kasir serta pelaporan setoran akhir shift dengan mekanisme blind drop guna meminimalisasi selisih kas fisik.

        •	Penerimaan Pembayaran Terintegrasi: Mendukung transaksi tunai dan non-tunai berbasis QRIS dinamis atau transfer bank.

        •	Pencatatan Produk Rusak Toko (In-Store Spoilage): Pencatatan langsung bakpau yang cacat bentuk atau rusak saat proses pemanasan di toko pusat untuk menjaga akurasi laporan laba-rugi.

    C. Logistik Distribusi & Bukti Serah Terima Digital (e-POD)
    • Manifes Pengantaran per Rute: Pengelompokan surat jalan kurir berdasarkan zona geografis pengiriman untuk efisiensi rute dan ketepatan waktu distribusi pagi.

        •	Konfirmasi Penerimaan Digital: Validasi serah terima di lokasi mitra menggunakan tanda tangan digital langsung pada layar sentuh, input PIN verifikasi, atau pencatatan koordinat GPS kurir.

    D. Portal Reseller & Audit Retur Berbasis Cloud
    • Antarmuka Mandiri Mobile-Friendly: Memungkinkan kasir/pengelola mitra memasukkan data stok terjual harian dan mengecek ketersediaan stok tanpa perlu menginstal aplikasi khusus.

        •	Klaim Retur Berbukti Foto: Mitra wajib mengunggah foto kondisi fisik bakpau basi atau rusak ke penyimpanan cloud sebagai syarat validasi sebelum tagihan dipotong.

        •	Validasi Integritas Sisa Stok: Sistem menolak laporan harian jika formula mutasi menghasilkan nilai negatif atau tidak logis.

    E. Rekonsiliasi Otomatis & Faktur Tagihan (Auto-Settlement)
    • Kalkulasi Hak Bagi Hasil Otomatis: Perhitungan otomatis omzet kotor, potongan komisi mitra, dan pemotongan nilai retur yang sah untuk menghasilkan nilai setoran bersih (Net Payable).

        •	Penerbitan Faktur Digital Periodik: Pembuatan laporan rekapitulasi konsinyasi mingguan atau bulanan dalam format dokumen siap unduh atau kirim via kanal komunikasi resmi.

    F. Dashboard Analitik & Metrik Bisnis
    • Visibilitas Stok Mengambang (Live Floating Stock): Pemantauan jumlah total bakpau yang sedang beredar di seluruh jaringan mitra luar.
    • Rasio Pemborosan Bahan (Waste Ratio): Analisis persentase barang retur terhadap total pasokan kirim per gerai untuk mengevaluasi efektivitas penjualan tiap titik.
    • Peringkat Produktivitas Gerai (Outlet Leaderboard): Pemetaan gerai dengan penjualan tertinggi hingga gerai berkinerja rendah guna mendukung pengambilan keputusan rotasi penempatan box bakpau.

6.  Tumpukan Teknologi (Technology Stack)
    •Lapisan Antarmuka (Frontend):
    o Dashboard Admin & Portal Mitra: Single Page Application (SPA) berbasis JavaScript modern (React.js / Vue.js) dengan Tailwind CSS untuk tampilan responsif dan cepat dibuka melalui tablet maupun ponsel toko.
    o Aplikasi Kasir Toko Pusat: Antarmuka web ramah sentuhan (touch-optimized) yang mendukung cetak struk via Web Thermal Printer (ESC/POS) dan mode antarmuka minim latensi.

    • Lapisan Logika Bisnis & Layanan (Backend):
    o Framework API: RESTful API berbasis PHP (CodeIgniter 4 atau Laravel) / Node.js (Express atau NestJS) yang menerapkan arsitektur clean architecture dan pemisahan service layer.
    o Keamanan & Autentikasi: JSON Web Token (JWT) berbasis masa berlaku singkat, algoritma hashing Bcrypt untuk kredensial kata sandi, serta middleware RBAC yang memvalidasi otorisasi di setiap endpoint.

    • Lapisan Data & Penyimpanan (Database & Storage):
    o Basis Data Relasional: PostgreSQL atau MySQL 8.0 dengan dukungan transaksi atomik (ACID) penuh guna menjamin integritas data mutasi stok dan pembukuan finansial.
    o Penyimpanan Objek Cloud: Integrasi penyimpanan berbasis cloud (seperti Cloudinary, Supabase Storage, atau AWS S3) untuk menyimpan berkas foto bukti retur, tanda tangan kurir, dan dokumen surat jalan.

    • Layanan Pendukung & Integrasi Eksternal:
    o Pemberitahuan Otomatis: Integrasi gateway perpesanan WhatsApp API untuk pengiriman notifikasi pengingat restok bahan, jadwal servis steamer, dan pengiriman lembar tagihan settlement kepada mitra.
    o Payment Gateway: Integrasi modul pembayaran QRIS dinamis untuk memproses transaksi non-tunai pada Kasir Toko Pusat.
