-- Apply after docs/database_scheme.sql.
-- Adds persistence for the operational REST API without replacing existing tables.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC(12, 2);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS courier_email VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(9, 6);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(9, 6);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS received_by VARCHAR(100);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE claims ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_id VARCHAR(50) REFERENCES manifests(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS partners_name_case_insensitive_unique
  ON partners (LOWER(name));

CREATE TABLE IF NOT EXISTS business_settings (
  key VARCHAR(80) PRIMARY KEY,
  numeric_value NUMERIC(14, 2) NOT NULL CHECK (numeric_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL
);

INSERT INTO business_settings (key, numeric_value)
VALUES ('partner_price', 9000), ('central_price', 12000), ('production_yield', 60), ('production_opex', 45000)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(150) NOT NULL,
  condition VARCHAR(30) NOT NULL CHECK (condition IN ('Baik', 'Layak', 'Tidak layak')),
  last_inspected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  writeoff_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bill_of_materials (
  ingredient_id VARCHAR(50) PRIMARY KEY REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(50) PRIMARY KEY,
  ingredient_id VARCHAR(50) NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_delta NUMERIC(12, 3) NOT NULL CHECK (quantity_delta <> 0),
  reason VARCHAR(80) NOT NULL,
  note TEXT,
  reference_id VARCHAR(50),
  created_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(50) PRIMARY KEY,
  ingredient_id VARCHAR(50) NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'menunggu'
    CHECK (status IN ('menunggu', 'diterima', 'dibatalkan')),
  note TEXT,
  created_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  received_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS production_runs (
  id VARCHAR(50) PRIMARY KEY,
  batch_id VARCHAR(50) NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
  recipe_count INTEGER NOT NULL CHECK (recipe_count > 0),
  yield_qty INTEGER NOT NULL CHECK (yield_qty > 0),
  usage_mode VARCHAR(20) NOT NULL CHECK (usage_mode IN ('auto', 'manual')),
  hpp_per_unit NUMERIC(14, 4) NOT NULL CHECK (hpp_per_unit >= 0),
  note TEXT,
  created_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_run_items (
  id BIGSERIAL PRIMARY KEY,
  production_run_id VARCHAR(50) NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  ingredient_id VARCHAR(50) NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_used NUMERIC(12, 3) NOT NULL CHECK (quantity_used >= 0),
  standard_quantity NUMERIC(12, 3) NOT NULL CHECK (standard_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS pos_shifts (
  id VARCHAR(50) PRIMARY KEY,
  opened_by VARCHAR(100) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
  opening_cash NUMERIC(14, 2) NOT NULL CHECK (opening_cash >= 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  expected_cash NUMERIC(14, 2),
  counted_cash NUMERIC(14, 2),
  cash_difference NUMERIC(14, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_one_open_shift_per_cashier
  ON pos_shifts (opened_by) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS pos_sales (
  id VARCHAR(50) PRIMARY KEY,
  shift_id VARCHAR(50) NOT NULL REFERENCES pos_shifts(id) ON DELETE RESTRICT,
  cashier_email VARCHAR(100) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('tunai', 'qris')),
  total NUMERIC(14, 2) NOT NULL CHECK (total > 0),
  received_amount NUMERIC(14, 2),
  change_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id VARCHAR(50) NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id VARCHAR(30) NOT NULL CHECK (product_id IN ('hangat', 'pack6', 'pack12')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  unit_count INTEGER NOT NULL CHECK (unit_count > 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total > 0)
);

CREATE TABLE IF NOT EXISTS pos_spoilage (
  id VARCHAR(50) PRIMARY KEY,
  cashier_email VARCHAR(100) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
  product_id VARCHAR(30) NOT NULL CHECK (product_id IN ('hangat', 'pack6', 'pack12')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason VARCHAR(100) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_inventory_movements (
  id VARCHAR(50) PRIMARY KEY,
  partner_id VARCHAR(50) NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('pengiriman', 'penjualan', 'retur')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reference_id VARCHAR(50) NOT NULL,
  created_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (movement_type, reference_id, partner_id)
);

CREATE TABLE IF NOT EXISTS partner_sales (
  id VARCHAR(50) PRIMARY KEY,
  partner_id VARCHAR(50) NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  reported_by VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manifest_batch_allocations (
  id BIGSERIAL PRIMARY KEY,
  manifest_id VARCHAR(50) NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  batch_id VARCHAR(50) NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (manifest_id, batch_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email VARCHAR(100) REFERENCES users(email) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON inventory_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_status_created_idx ON purchase_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS production_runs_created_at_idx ON production_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS pos_sales_shift_created_idx ON pos_sales (shift_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_inventory_partner_created_idx ON partner_inventory_movements (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_sales_partner_created_idx ON partner_sales (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manifest_batch_pending_idx ON manifest_batch_allocations (batch_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
