-- ============================================================
-- Price List Manager - Database Schema
-- PostgreSQL
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    u_id        SERIAL PRIMARY KEY,
    u_username  VARCHAR(50)  NOT NULL UNIQUE,
    u_password  VARCHAR(255) NOT NULL,
    u_role      VARCHAR(20)  NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- Brand
CREATE TABLE IF NOT EXISTS brand (
    b_id    SERIAL PRIMARY KEY,
    b_name  VARCHAR(100) NOT NULL
);

-- Item (barang besi)
CREATE TABLE IF NOT EXISTS item (
    ig_id      SERIAL PRIMARY KEY,
    i_id       VARCHAR(50)  NOT NULL UNIQUE,  -- kode barang
    ig_name    VARCHAR(255) NOT NULL,
    ig_serial  VARCHAR(100),
    ig_grade   VARCHAR(20),
    ig_group   VARCHAR(5),                    -- 'U' / 'N'
    ig_unit    VARCHAR(20),
    ig_weight  NUMERIC(10, 4),               -- berat per unit (kg)
    cat_id     INTEGER,
    brand_id   INTEGER REFERENCES brand(b_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Price Type (Cash Gudang, Kredit Gudang, dll)
CREATE TABLE IF NOT EXISTS price (
    pr_id    SERIAL PRIMARY KEY,
    pr_code  VARCHAR(50)  NOT NULL UNIQUE,
    pr_name  VARCHAR(100) NOT NULL
);

-- Item Price (harga aktif per item per price type)
CREATE TABLE IF NOT EXISTS item_price (
    ip_id      SERIAL PRIMARY KEY,
    ig_id      INTEGER REFERENCES item(ig_id),
    pr_id      INTEGER REFERENCES price(pr_id),
    i_price    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(u_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(u_id),
    updated_at TIMESTAMPTZ,
    UNIQUE (ig_id, pr_id)
);

-- Price Log (riwayat perubahan harga)
CREATE TABLE IF NOT EXISTS price_log (
    plog_id   SERIAL PRIMARY KEY,
    ig_id     INTEGER REFERENCES item(ig_id),
    pr_id     INTEGER REFERENCES price(pr_id),
    plog_from NUMERIC(15, 2),
    plog_to   NUMERIC(15, 2),
    u_id      INTEGER REFERENCES users(u_id),
    plog_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed data ────────────────────────────────────────────────
INSERT INTO price (pr_code, pr_name) VALUES
    ('cash_gudang',   'Cash Gudang'),
    ('kredit_gudang', 'Kredit Gudang')
ON CONFLICT DO NOTHING;

INSERT INTO users (u_username, u_password, u_role) VALUES
    ('admin', 'admin123', 'admin')
ON CONFLICT DO NOTHING;
