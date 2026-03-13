-- ============================================================
-- SCORPION IT PURCHASE ORDER MODULE
-- Complete Supabase Database Schema v1.0
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SEQUENCES FOR AUTO-NUMBERING
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS pr_seq START 1;
CREATE SEQUENCE IF NOT EXISTS qt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS po_seq START 1;
CREATE SEQUENCE IF NOT EXISTS grn_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inv_seq START 1;
CREATE SEQUENCE IF NOT EXISTS vendor_seq START 1;
CREATE SEQUENCE IF NOT EXISTS sku_seq START 1;
CREATE SEQUENCE IF NOT EXISTS asset_seq START 1;

-- ============================================================
-- TABLE 1: BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  branch_id     SERIAL PRIMARY KEY,
  branch_code   VARCHAR(20) NOT NULL UNIQUE,
  branch_name   VARCHAR(100) NOT NULL,
  city          VARCHAR(60),
  state         VARCHAR(60),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code VARCHAR(20) UNIQUE,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('branch_user','it_staff','it_head','finance_head')),
  branch_id     INT REFERENCES branches(branch_id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ============================================================
-- TABLE 3: VENDOR MASTER
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_master (
  vendor_id       SERIAL PRIMARY KEY,
  vendor_code     VARCHAR(20) NOT NULL UNIQUE DEFAULT ('VND-' || LPAD(nextval('vendor_seq')::TEXT, 4, '0')),
  vendor_name     VARCHAR(150) NOT NULL,
  contact_person  VARCHAR(100),
  email           VARCHAR(150) NOT NULL,
  phone           VARCHAR(20),
  address         TEXT,
  gstin           VARCHAR(20),
  pan             VARCHAR(15),
  payment_terms   VARCHAR(100),
  bank_account_no VARCHAR(30),
  bank_ifsc       VARCHAR(15),
  vendor_category VARCHAR(20) NOT NULL DEFAULT 'assets' CHECK (vendor_category IN ('assets','consumables','repairs','all')),
  is_blacklisted  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: SKU MASTER
-- ============================================================
CREATE TABLE IF NOT EXISTS sku_master (
  sku_id        SERIAL PRIMARY KEY,
  sku_code      VARCHAR(30) NOT NULL UNIQUE,
  sku_name      VARCHAR(150) NOT NULL,
  description   TEXT,
  category      VARCHAR(20) NOT NULL CHECK (category IN ('asset','consumable','repair_service')),
  sub_category  VARCHAR(60),
  uom           VARCHAR(20) NOT NULL DEFAULT 'Nos',
  hsn_sac_code  VARCHAR(20),
  is_asset      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate SKU code via trigger
CREATE OR REPLACE FUNCTION generate_sku_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sku_code IS NULL OR NEW.sku_code = '' THEN
    NEW.sku_code := CASE NEW.category
      WHEN 'asset'          THEN 'SKU-ASSET-' || LPAD(nextval('sku_seq')::TEXT, 4, '0')
      WHEN 'consumable'     THEN 'SKU-CONS-'  || LPAD(nextval('sku_seq')::TEXT, 4, '0')
      WHEN 'repair_service' THEN 'SKU-REPR-'  || LPAD(nextval('sku_seq')::TEXT, 4, '0')
      ELSE                       'SKU-'       || LPAD(nextval('sku_seq')::TEXT, 4, '0')
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sku_code
  BEFORE INSERT ON sku_master
  FOR EACH ROW EXECUTE FUNCTION generate_sku_code();

-- ============================================================
-- TABLE 5: PURCHASE REQUISITIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requisitions (
  pr_id             SERIAL PRIMARY KEY,
  pr_number         VARCHAR(20) NOT NULL UNIQUE,
  pr_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  raised_by         UUID NOT NULL REFERENCES users(id),
  branch_id         INT REFERENCES branches(branch_id),
  pr_type           VARCHAR(20) NOT NULL CHECK (pr_type IN ('asset','consumable','repair')),
  priority          VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  justification     TEXT NOT NULL,
  ticket_ref        VARCHAR(50),
  required_by_date  DATE,
  status            VARCHAR(30) NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('draft','submitted','quotation_pending','quotation_received','approved','po_raised','delivered','closed','cancelled')),
  remarks           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate PR number
CREATE OR REPLACE FUNCTION generate_pr_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pr_number := 'PR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('pr_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_pr_number
  BEFORE INSERT ON purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION generate_pr_number();

-- ============================================================
-- TABLE 6: PR LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS pr_line_items (
  line_id         SERIAL PRIMARY KEY,
  pr_id           INT NOT NULL REFERENCES purchase_requisitions(pr_id) ON DELETE CASCADE,
  sku_id          INT NOT NULL REFERENCES sku_master(sku_id),
  quantity        DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
  estimated_cost  DECIMAL(14,2),
  asset_tag_old   VARCHAR(50),
  notes           TEXT
);

-- ============================================================
-- TABLE 7: QUOTATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS quotations (
  quotation_id    SERIAL PRIMARY KEY,
  quotation_number VARCHAR(20) NOT NULL UNIQUE,
  pr_id           INT NOT NULL REFERENCES purchase_requisitions(pr_id),
  vendor_id       INT NOT NULL REFERENCES vendor_master(vendor_id),
  quotation_date  DATE NOT NULL,
  vendor_ref_no   VARCHAR(50),
  validity_date   DATE,
  total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  grand_total     DECIMAL(14,2) NOT NULL DEFAULT 0,
  delivery_days   INT,
  payment_terms   VARCHAR(100),
  document_path   VARCHAR(500),
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review','approved','rejected','expired')),
  approved_by     UUID REFERENCES users(id),
  approval_date   TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_qt_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.quotation_number := 'QT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('qt_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_qt_number
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION generate_qt_number();

-- ============================================================
-- TABLE 8: QUOTATION LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS quotation_line_items (
  qt_line_id    SERIAL PRIMARY KEY,
  quotation_id  INT NOT NULL REFERENCES quotations(quotation_id) ON DELETE CASCADE,
  pr_line_id    INT REFERENCES pr_line_items(line_id),
  sku_id        INT NOT NULL REFERENCES sku_master(sku_id),
  quantity      DECIMAL(10,2) NOT NULL,
  unit_price    DECIMAL(14,2) NOT NULL,
  gst_percent   DECIMAL(5,2) NOT NULL DEFAULT 18,
  total_price   DECIMAL(14,2) NOT NULL
);

-- ============================================================
-- TABLE 9: PURCHASE ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id                 SERIAL PRIMARY KEY,
  po_number             VARCHAR(20) NOT NULL UNIQUE,
  po_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  pr_id                 INT NOT NULL REFERENCES purchase_requisitions(pr_id),
  quotation_id          INT NOT NULL REFERENCES quotations(quotation_id),
  vendor_id             INT NOT NULL REFERENCES vendor_master(vendor_id),
  billing_address       TEXT NOT NULL,
  shipping_address      TEXT NOT NULL,
  expected_delivery_date DATE,
  payment_terms         VARCHAR(100),
  total_amount          DECIMAL(14,2) NOT NULL,
  tax_amount            DECIMAL(14,2) NOT NULL,
  grand_total           DECIMAL(14,2) NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','acknowledged','partially_delivered','delivered','cancelled','amended')),
  po_email_sent_at      TIMESTAMPTZ,
  created_by            UUID NOT NULL REFERENCES users(id),
  special_instructions  TEXT,
  amendment_count       INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.po_number := 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('po_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION generate_po_number();

-- ============================================================
-- TABLE 10: PO LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS po_line_items (
  po_line_id    SERIAL PRIMARY KEY,
  po_id         INT NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
  sku_id        INT NOT NULL REFERENCES sku_master(sku_id),
  ordered_qty   DECIMAL(10,2) NOT NULL,
  received_qty  DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_price    DECIMAL(14,2) NOT NULL,
  gst_percent   DECIMAL(5,2) NOT NULL DEFAULT 18,
  total_price   DECIMAL(14,2) NOT NULL
);

-- ============================================================
-- TABLE 11: GOODS RECEIPT NOTES (GRN)
-- ============================================================
CREATE TABLE IF NOT EXISTS goods_receipt_notes (
  grn_id              SERIAL PRIMARY KEY,
  grn_number          VARCHAR(20) NOT NULL UNIQUE,
  grn_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  po_id               INT NOT NULL REFERENCES purchase_orders(po_id),
  vendor_id           INT NOT NULL REFERENCES vendor_master(vendor_id),
  delivery_challan_no VARCHAR(50),
  received_by         UUID NOT NULL REFERENCES users(id),
  delivery_location   INT REFERENCES branches(branch_id),
  condition           VARCHAR(20) NOT NULL DEFAULT 'good'
                      CHECK (condition IN ('good','damaged','partial','rejected')),
  remarks             TEXT,
  document_path       VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.grn_number := 'GRN-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('grn_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_grn_number
  BEFORE INSERT ON goods_receipt_notes
  FOR EACH ROW EXECUTE FUNCTION generate_grn_number();

-- ============================================================
-- TABLE 12: GRN LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS grn_line_items (
  grn_line_id   SERIAL PRIMARY KEY,
  grn_id        INT NOT NULL REFERENCES goods_receipt_notes(grn_id) ON DELETE CASCADE,
  po_line_id    INT NOT NULL REFERENCES po_line_items(po_line_id),
  sku_id        INT NOT NULL REFERENCES sku_master(sku_id),
  received_qty  DECIMAL(10,2) NOT NULL,
  accepted_qty  DECIMAL(10,2) NOT NULL,
  rejected_qty  DECIMAL(10,2) NOT NULL DEFAULT 0,
  serial_numbers TEXT,
  remarks       TEXT
);

-- ============================================================
-- TABLE 13: ASSET REGISTER
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_register (
  asset_id        SERIAL PRIMARY KEY,
  asset_tag       VARCHAR(30) NOT NULL UNIQUE DEFAULT ('SCORP-IT-' || LPAD(nextval('asset_seq')::TEXT, 4, '0')),
  sku_id          INT NOT NULL REFERENCES sku_master(sku_id),
  grn_id          INT REFERENCES goods_receipt_notes(grn_id),
  serial_number   VARCHAR(100),
  make_model      VARCHAR(150),
  assigned_to     UUID REFERENCES users(id),
  branch_id       INT REFERENCES branches(branch_id),
  status          VARCHAR(20) NOT NULL DEFAULT 'in_store'
                  CHECK (status IN ('in_store','assigned','under_repair','disposed')),
  warranty_expiry DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 14: VENDOR INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_invoices (
  invoice_id            SERIAL PRIMARY KEY,
  invoice_ref           VARCHAR(20) NOT NULL UNIQUE,
  po_id                 INT NOT NULL REFERENCES purchase_orders(po_id),
  grn_id                INT REFERENCES goods_receipt_notes(grn_id),
  vendor_id             INT NOT NULL REFERENCES vendor_master(vendor_id),
  vendor_invoice_no     VARCHAR(50) NOT NULL,
  vendor_invoice_date   DATE NOT NULL,
  invoice_amount        DECIMAL(14,2) NOT NULL,
  tax_amount            DECIMAL(14,2) NOT NULL DEFAULT 0,
  grand_total           DECIMAL(14,2) NOT NULL,
  document_path         VARCHAR(500),
  uploaded_by           UUID NOT NULL REFERENCES users(id),
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  it_head_status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (it_head_status IN ('pending','approved','rejected')),
  it_head_approved_by   UUID REFERENCES users(id),
  it_head_approval_date TIMESTAMPTZ,
  it_head_remarks       TEXT,
  finance_status        VARCHAR(20) NOT NULL DEFAULT 'not_sent'
                        CHECK (finance_status IN ('not_sent','pending','approved','rejected','paid')),
  finance_approved_by   UUID REFERENCES users(id),
  finance_approval_date TIMESTAMPTZ,
  finance_remarks       TEXT,
  payment_date          DATE,
  payment_reference     VARCHAR(100),
  payment_mode          VARCHAR(20) CHECK (payment_mode IN ('neft','rtgs','cheque','upi','cash'))
);

CREATE OR REPLACE FUNCTION generate_inv_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_ref := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('inv_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_inv_number
  BEFORE INSERT ON vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_inv_number();

-- ============================================================
-- TABLE 15: AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  log_id        SERIAL PRIMARY KEY,
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     INT,
  action        VARCHAR(100) NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  performed_by  UUID NOT NULL REFERENCES users(id),
  ip_address    VARCHAR(50),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remarks       TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pr_status    ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_pr_raised_by ON purchase_requisitions(raised_by);
CREATE INDEX IF NOT EXISTS idx_pr_branch    ON purchase_requisitions(branch_id);
CREATE INDEX IF NOT EXISTS idx_qt_pr        ON quotations(pr_id);
CREATE INDEX IF NOT EXISTS idx_qt_status    ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_po_status    ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_vendor    ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_grn_po       ON goods_receipt_notes(po_id);
CREATE INDEX IF NOT EXISTS idx_inv_status   ON vendor_invoices(it_head_status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(timestamp DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_master           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_master              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_line_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_line_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_register          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_branch()
RETURNS INT AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- USERS: everyone can see their own profile; HO staff can see all
CREATE POLICY "users_select" ON users FOR SELECT USING (
  id = auth.uid() OR current_user_role() IN ('it_staff','it_head','finance_head')
);
CREATE POLICY "users_update" ON users FOR UPDATE USING (id = auth.uid());

-- BRANCHES: all authenticated users can see branches
CREATE POLICY "branches_select" ON branches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "branches_modify" ON branches FOR ALL USING (current_user_role() = 'it_head');

-- VENDOR: HO staff and heads
CREATE POLICY "vendor_select"   ON vendor_master FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "vendor_insert"   ON vendor_master FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "vendor_update"   ON vendor_master FOR UPDATE USING (current_user_role() IN ('it_staff','it_head'));

-- SKU: all can view, HO can edit
CREATE POLICY "sku_select" ON sku_master FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sku_modify" ON sku_master FOR ALL USING (current_user_role() IN ('it_staff','it_head'));

-- PR: branch users see own, HO sees all
CREATE POLICY "pr_select" ON purchase_requisitions FOR SELECT USING (
  raised_by = auth.uid() OR current_user_role() IN ('it_staff','it_head','finance_head')
);
CREATE POLICY "pr_insert" ON purchase_requisitions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pr_update" ON purchase_requisitions FOR UPDATE USING (
  raised_by = auth.uid() OR current_user_role() IN ('it_staff','it_head')
);

-- PR LINE ITEMS
CREATE POLICY "pr_lines_select" ON pr_line_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pr_lines_insert" ON pr_line_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- QUOTATIONS: HO only
CREATE POLICY "qt_select" ON quotations FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "qt_insert" ON quotations FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "qt_update" ON quotations FOR UPDATE USING (current_user_role() IN ('it_staff','it_head'));

-- QUOTATION LINES
CREATE POLICY "qt_lines_select" ON quotation_line_items FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "qt_lines_insert" ON quotation_line_items FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));

-- PO
CREATE POLICY "po_select" ON purchase_orders FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "po_insert" ON purchase_orders FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "po_update" ON purchase_orders FOR UPDATE USING (current_user_role() IN ('it_staff','it_head'));

-- PO LINES
CREATE POLICY "po_lines_select" ON po_line_items FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "po_lines_insert" ON po_line_items FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "po_lines_update" ON po_line_items FOR UPDATE USING (current_user_role() IN ('it_staff','it_head'));

-- GRN
CREATE POLICY "grn_select" ON goods_receipt_notes FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "grn_insert" ON goods_receipt_notes FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));

-- GRN LINES
CREATE POLICY "grn_lines_select" ON grn_line_items FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "grn_lines_insert" ON grn_line_items FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));

-- ASSETS
CREATE POLICY "asset_select" ON asset_register FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "asset_insert" ON asset_register FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "asset_update" ON asset_register FOR UPDATE USING (current_user_role() IN ('it_staff','it_head'));

-- INVOICES
CREATE POLICY "inv_select" ON vendor_invoices FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "inv_insert" ON vendor_invoices FOR INSERT WITH CHECK (current_user_role() IN ('it_staff','it_head'));
CREATE POLICY "inv_update" ON vendor_invoices FOR UPDATE USING (current_user_role() IN ('it_staff','it_head','finance_head'));

-- AUDIT LOG
CREATE POLICY "audit_select" ON audit_log FOR SELECT USING (current_user_role() IN ('it_staff','it_head','finance_head'));
CREATE POLICY "audit_insert" ON audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- TRIGGER: auto-update updated_at on PR
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_pr_updated_at
  BEFORE UPDATE ON purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: create user profile on auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'), COALESCE(NEW.raw_user_meta_data->>'role', 'branch_user'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Branches
INSERT INTO branches (branch_code, branch_name, city, state) VALUES
  ('HO', 'Head Office', 'Mumbai', 'Maharashtra'),
  ('MUM-01', 'Mumbai Branch 1', 'Mumbai', 'Maharashtra'),
  ('DEL-01', 'Delhi Branch 1', 'New Delhi', 'Delhi'),
  ('PUN-01', 'Pune Branch 1', 'Pune', 'Maharashtra'),
  ('BLR-01', 'Bangalore Branch 1', 'Bangalore', 'Karnataka'),
  ('CHN-01', 'Chennai Branch 1', 'Chennai', 'Tamil Nadu'),
  ('HYD-01', 'Hyderabad Branch 1', 'Hyderabad', 'Telangana')
ON CONFLICT DO NOTHING;

-- SKUs
INSERT INTO sku_master (sku_name, description, category, sub_category, uom, hsn_sac_code, is_asset) VALUES
  ('Laptop 14" Intel i5 16GB 512SSD',  'Business laptop, 14 inch, Intel i5 12th Gen, 16GB RAM, 512GB SSD', 'asset', 'Laptop', 'Nos', '84713010', TRUE),
  ('Laptop 15.6" Intel i7 16GB 1TB',   'Performance laptop, 15.6 inch, Intel i7, 16GB RAM, 1TB SSD',     'asset', 'Laptop', 'Nos', '84713010', TRUE),
  ('Desktop PC Core i5 8GB 256SSD',    'Desktop computer, Intel Core i5, 8GB RAM, 256GB SSD',            'asset', 'Desktop', 'Nos', '84713020', TRUE),
  ('Monitor 24" FHD IPS',              '24 inch Full HD IPS display, HDMI + VGA ports',                  'asset', 'Monitor', 'Nos', '84713090', TRUE),
  ('Monitor 27" QHD IPS',              '27 inch Quad HD IPS display',                                    'asset', 'Monitor', 'Nos', '84713090', TRUE),
  ('Network Switch 24-Port',           '24-Port Gigabit managed switch',                                  'asset', 'Networking', 'Nos', '85176990', TRUE),
  ('UPS 1KVA',                         '1KVA offline UPS with 30 min backup',                            'asset', 'Power', 'Nos', '85044090', TRUE),
  ('Printer Cartridge HP-83A',         'HP LaserJet black toner cartridge 83A',                          'consumable', 'Printer Supply', 'Nos', '84439910', FALSE),
  ('Printer Cartridge HP-CF226A',      'HP LaserJet black toner 26A',                                    'consumable', 'Printer Supply', 'Nos', '84439910', FALSE),
  ('USB Hub 4-Port 3.0',               '4-port USB 3.0 hub with power adapter',                          'consumable', 'Accessories', 'Nos', '85444290', FALSE),
  ('Wireless Keyboard + Mouse Combo',  'Wireless keyboard and mouse set',                                 'consumable', 'Peripherals', 'Set', '84716090', FALSE),
  ('HDMI Cable 2m',                    'HDMI 2.0 cable, 2 metre',                                        'consumable', 'Cables', 'Nos', '85444290', FALSE),
  ('Network Cable CAT6 (box 305m)',    'CAT6 UTP LAN cable, 305m pull box',                              'consumable', 'Networking', 'Box', '85444290', FALSE),
  ('Laptop On-Site Repair Service',    'On-site repair and diagnostics for laptops',                      'repair_service', 'Repair', 'Hours', '998719', FALSE),
  ('Desktop On-Site Repair Service',  'On-site repair and diagnostics for desktops',                     'repair_service', 'Repair', 'Hours', '998719', FALSE),
  ('Printer Maintenance Service',      'Preventive maintenance and repair for printers',                  'repair_service', 'Repair', 'Visit', '998719', FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- HOW TO CREATE USERS:
-- In Supabase Dashboard → Authentication → Users → Add User
-- Then in SQL Editor run:
--   UPDATE users SET role = 'it_head', full_name = 'Your Name' WHERE email = 'your@email.com';
-- Or use the user creation script in README.md
-- ============================================================

SELECT 'Scorpion DB Schema installed successfully! Tables: ' || count(*) || ' created.'
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
