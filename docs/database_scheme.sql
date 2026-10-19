-- ===================================================
-- SKEMA BASIS DATA PAOLOTORY (PostgreSQL)
-- Berkas: docs/database_schema.sql
-- ===================================================

-- 1. TABEL ROLES
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Seeder Role Dasar
INSERT INTO roles (name) VALUES 
('owner'), 
('kasir'), 
('mitra'), 
('pengantar');

-- 2. TABEL USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL INGREDIENTS (Bahan Baku)
CREATE TABLE ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    current_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(20) NOT NULL, -- contoh: 'gram', 'ml', 'pcs'
    minimum_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABEL PRODUCTS (Katalog Bakpao)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- contoh: 'manis', 'gurih'
    price NUMERIC(12, 2) NOT NULL,
    ready_stock INT NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABEL RECIPES / PRODUCT_INGREDIENTS (BOM Formula)
CREATE TABLE recipes (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_required NUMERIC(10, 2) NOT NULL, -- takaran per 1 pcs produk
    CONSTRAINT uq_product_ingredient UNIQUE (product_id, ingredient_id)
);

-- 6. TABEL PRODUCTIONS (Riwayat Produksi Dapur)
CREATE TABLE productions (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_produced INT NOT NULL,
    production_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- 7. TABEL ORDERS (Transaksi Kasir & Mitra)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(30) NOT NULL, -- 'cash', 'transfer', 'qris'
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed', 'pending', 'delivering', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABEL ORDER_ITEMS (Detail Item Transaksi)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL
);

-- 8. TABEL DELIVERIES & DELIVERY_STOPS (Logistik Pengantaran)
CREATE TABLE deliveries (
    id SERIAL PRIMARY KEY,
    courier_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'in_transit', -- 'in_transit', 'finished'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE delivery_stops (
    id SERIAL PRIMARY KEY,
    delivery_id INT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    destination_name VARCHAR(150) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    sequence_order INT NOT NULL, -- urutan rute (1, 2, 3...)
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'delivered'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABEL CASH_FLOWS (Pencatatan Arus Kas Keuangan)
CREATE TABLE cash_flows (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'income', 'expense'
    category VARCHAR(50) NOT NULL, -- 'penjualan', 'belanja_bahan', 'operasional'
    amount NUMERIC(12, 2) NOT NULL,
    reference_id INT, -- opsional: menampung order_id atau production_id
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indeks untuk optimasi query pencarian & filter
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_recipes_product ON recipes(product_id);
CREATE INDEX idx_delivery_stops_delivery ON delivery_stops(delivery_id);