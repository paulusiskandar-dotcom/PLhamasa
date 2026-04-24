-- ============================================================
-- PLhamasa DB Schema — Final
-- Database TERPISAH dari ERP.
-- ============================================================

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    u_id        SERIAL PRIMARY KEY,
    u_username  VARCHAR(50)  NOT NULL UNIQUE,
    u_password  VARCHAR(255) NOT NULL,
    u_role      VARCHAR(20)  NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ── item_price (harga per kg dari PLM) ────────────────────────
CREATE TABLE IF NOT EXISTS item_price (
    ip_id      SERIAL PRIMARY KEY,
    ig_id      INTEGER      NOT NULL,
    pr_id      INTEGER      NOT NULL,
    i_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TIMESTAMPTZ  DEFAULT NOW(),
    updated_by INTEGER,
    updated_at TIMESTAMPTZ,
    UNIQUE (ig_id, pr_id)
);
CREATE INDEX IF NOT EXISTS idx_item_price_ig_id ON item_price(ig_id);

-- ── price_log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_log (
    plog_id   SERIAL PRIMARY KEY,
    ig_id     INTEGER NOT NULL,
    pr_id     INTEGER NOT NULL,
    plog_from NUMERIC(15,2),
    plog_to   NUMERIC(15,2),
    u_id      INTEGER,
    plog_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_log_ig_id ON price_log(ig_id);
CREATE INDEX IF NOT EXISTS idx_price_log_date  ON price_log(plog_date DESC);

-- ── export_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_log (
    id            SERIAL PRIMARY KEY,
    export_type   VARCHAR(20)  NOT NULL,
    cat_id        VARCHAR(50),
    cat_name      VARCHAR(100),
    ig_ids        INTEGER[]    NOT NULL DEFAULT '{}',
    item_count    INTEGER      NOT NULL DEFAULT 0,
    exported_by   INTEGER,
    exporter_name VARCHAR(100),
    exported_at   TIMESTAMPTZ  DEFAULT NOW(),
    file_name     VARCHAR(150),
    file_size     INTEGER,
    file_path     VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_export_log_cat_id      ON export_log(cat_id);
CREATE INDEX IF NOT EXISTS idx_export_log_exported_at ON export_log(exported_at DESC);

-- ── settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key         VARCHAR(50) PRIMARY KEY,
    value       JSONB        NOT NULL,
    updated_by  INTEGER,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed ──────────────────────────────────────────────────────
INSERT INTO users (u_username, u_password, u_role) VALUES
    ('admin', 'admin123', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO settings (key, value) VALUES
    ('extended_categories', '[]'::jsonb)
ON CONFLICT DO NOTHING;
