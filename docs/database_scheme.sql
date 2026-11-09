-- 1. Tabel Partners (Gerai Mitra)
-- Menyimpan data dari S.partners
CREATE TABLE partners (
    id VARCHAR(50) PRIMARY KEY, -- Contoh dari web: 'p1', 'p2'
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- Kedai kopi, Kantin, dll
    zone VARCHAR(50) NOT NULL, -- Zona Pusat, Zona Selatan
    pin VARCHAR(4) NOT NULL, -- 4 digit PIN gerai
    sent INT DEFAULT 0,
    sold INT DEFAULT 0,
    returned INT DEFAULT 0
);

-- 2. Tabel Users (Pengguna Sistem)
-- Menyimpan data dari USERS array / S.user
CREATE TABLE users (
    email VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'owner', 'kitchen', 'pos', 'courier', 'partner'
    password_hash TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'aktif',
    partner_id VARCHAR(50) REFERENCES partners(id) ON DELETE SET NULL
    -- partner_id wajib diisi jika role = 'partner'
);

-- 3. Tabel Ingredients (Bahan Baku)
-- Menyimpan data dari S.ingredients
CREATE TABLE ingredients (
    id VARCHAR(50) PRIMARY KEY, -- 'tepung', 'gula', dll
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(10) NOT NULL, -- 'g', 'pcs'
    stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    rop DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Reorder Point
    price DECIMAL(12, 2) NOT NULL
);

-- 4. Tabel Batches (Stok Produksi Beku)
-- Menyimpan data dari S.batches
CREATE TABLE batches (
    id VARCHAR(50) PRIMARY KEY, -- Format: 'BPK-20261005-01'
    made_date DATE NOT NULL,
    exp_date DATE NOT NULL,
    qty INT NOT NULL,
    left_qty INT NOT NULL
);

-- 5. Tabel Manifests (Rute Pengiriman Kurir)
-- Menyimpan data dari S.manifest
CREATE TABLE manifests (
    id VARCHAR(50) PRIMARY KEY,
    partner_id VARCHAR(50) NOT NULL REFERENCES partners(id),
    qty INT NOT NULL,
    is_done BOOLEAN DEFAULT FALSE,
    photo_url TEXT, -- Bukti e-POD kamera
    photo_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabel Claims (Retur Mitra)
-- Menyimpan data dari S.claims
CREATE TABLE claims (
    id VARCHAR(50) PRIMARY KEY,
    partner_id VARCHAR(50) NOT NULL REFERENCES partners(id),
    qty INT NOT NULL,
    status VARCHAR(20) DEFAULT 'menunggu' 
        CHECK (status IN ('menunggu', 'dikonfirmasi', 'ditolak')), -- 'menunggu', 'dikonfirmasi', 'ditolak'
    claim_date DATE NOT NULL
);

-- 7. Tabel Orders (Pesanan Stok dari Mitra)
-- Menyimpan data dari S.orders
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    partner_id VARCHAR(50) NOT NULL REFERENCES partners(id),
    qty INT NOT NULL,
    note TEXT,
    status VARCHAR(20) DEFAULT 'menunggu' 
        CHECK (status IN ('menunggu', 'disetujui', 'ditolak')), -- 'menunggu', 'disetujui', 'ditolak'
    order_date DATE NOT NULL
);