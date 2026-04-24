-- ============================================================
-- PLhamasa DB Schema
-- Database TERPISAH dari ERP.
-- Hanya menyimpan harga per kg & log perubahan.
-- Master data item, kategori, brand, dll dibaca dari DB ERP.
-- ============================================================

-- ── Users (opsional, kalau mau auth terpisah) ─────────────────
CREATE TABLE IF NOT EXISTS users (
    u_id        SERIAL PRIMARY KEY,
    u_username  VARCHAR(50)  NOT NULL UNIQUE,
    u_password  VARCHAR(255) NOT NULL,
    u_role      VARCHAR(20)  NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ── item_price (harga PER KG, bukan harga final) ──────────────
-- Referensi ig_id mengacu ke DB ERP (tidak ada FK karena beda DB)
CREATE TABLE IF NOT EXISTS item_price (
    ip_id      SERIAL PRIMARY KEY,
    ig_id      INTEGER NOT NULL,
    pr_id      INTEGER NOT NULL,
    i_price    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER,
    updated_at TIMESTAMPTZ,
    UNIQUE (ig_id, pr_id)
);

CREATE INDEX IF NOT EXISTS idx_item_price_ig_id ON item_price(ig_id);

-- ── price_log (riwayat perubahan harga) ───────────────────────
CREATE TABLE IF NOT EXISTS price_log (
    plog_id   SERIAL PRIMARY KEY,
    ig_id     INTEGER NOT NULL,
    pr_id     INTEGER NOT NULL,
    plog_from NUMERIC(15, 2),
    plog_to   NUMERIC(15, 2),
    u_id      INTEGER,
    plog_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_log_ig_id ON price_log(ig_id);
CREATE INDEX IF NOT EXISTS idx_price_log_date  ON price_log(plog_date DESC);

-- ── Seed user admin ───────────────────────────────────────────
INSERT INTO users (u_username, u_password, u_role) VALUES
    ('admin', 'admin123', 'admin')
ON CONFLICT DO NOTHING;

-- ── Migration: draft/commit workflow ──────────────────────────
ALTER TABLE item_price ADD COLUMN IF NOT EXISTS status   VARCHAR(10)  NOT NULL DEFAULT 'final';
ALTER TABLE item_price ADD COLUMN IF NOT EXISTS draft_by INTEGER;
ALTER TABLE item_price ADD COLUMN IF NOT EXISTS draft_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_item_price_status
    ON item_price(status) WHERE status = 'draft';
