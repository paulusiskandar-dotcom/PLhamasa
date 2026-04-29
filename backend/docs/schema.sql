-- ── DROP GROUPING SYSTEM (Phase 1-4 removed) ───────────────────────────────
DROP TABLE IF EXISTS item_pending_assignment CASCADE;
DROP TABLE IF EXISTS item_group_assignment CASCADE;
DROP TABLE IF EXISTS item_group_definition CASCADE;
DROP TABLE IF EXISTS category_grouping_config CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- PLhamasa v2 — Database Schema
-- ═══════════════════════════════════════════════════════════════

-- ── USERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100),
    role            VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    CHECK (role IN ('user', 'superadmin'))
);

-- ── SETTINGS (key-value) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key             VARCHAR(50) PRIMARY KEY,
    value           JSONB NOT NULL,
    updated_by      INTEGER,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRICE LIST (rekaman per kategori) ──────────────────────────
CREATE TABLE price_list (
    id                  SERIAL PRIMARY KEY,
    cat_id              VARCHAR(50) NOT NULL,
    cat_name            VARCHAR(100) NOT NULL,
    revision_no         INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    posted_by           INTEGER REFERENCES users(id),
    posted_at           TIMESTAMPTZ,
    posted_to_erp_id    INTEGER,
    locked_by           INTEGER REFERENCES users(id),
    locked_at           TIMESTAMPTZ,
    locked_heartbeat    TIMESTAMPTZ,
    based_on_id         INTEGER REFERENCES price_list(id),
    UNIQUE (cat_id, revision_no),
    CHECK (status IN ('OPEN', 'POSTING', 'PUBLISHED'))
);

CREATE UNIQUE INDEX idx_open_per_cat
    ON price_list(cat_id)
    WHERE status = 'OPEN';

CREATE INDEX idx_pl_cat    ON price_list(cat_id, status);
CREATE INDEX idx_pl_locked ON price_list(locked_by) WHERE locked_by IS NOT NULL;

-- ── PRICE LIST ITEM (snapshot harga per rekaman) ───────────────
CREATE TABLE price_list_item (
    id              SERIAL PRIMARY KEY,
    price_list_id   INTEGER NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
    ig_id           INTEGER NOT NULL,
    pr_id           INTEGER NOT NULL,
    i_price         NUMERIC(15,2) NOT NULL,
    updated_by      INTEGER REFERENCES users(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (price_list_id, ig_id, pr_id)
);

CREATE INDEX idx_pli_pl ON price_list_item(price_list_id);

-- ── PRICE LIST LOG (change log) ────────────────────────────────
CREATE TABLE price_list_log (
    id              SERIAL PRIMARY KEY,
    price_list_id   INTEGER NOT NULL REFERENCES price_list(id),
    ig_id           INTEGER NOT NULL,
    pr_id           INTEGER NOT NULL,
    old_price       NUMERIC(15,2),
    new_price       NUMERIC(15,2),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    logged_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pll_pl ON price_list_log(price_list_id, logged_at DESC);

-- ── PRICE LIST EXPORT (audit export) ───────────────────────────
CREATE TABLE price_list_export (
    id              SERIAL PRIMARY KEY,
    price_list_id   INTEGER NOT NULL REFERENCES price_list(id),
    export_type     VARCHAR(20) NOT NULL,
    template_id     INTEGER,
    file_name       VARCHAR(200),
    file_path       VARCHAR(500),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    exported_at     TIMESTAMPTZ DEFAULT NOW(),
    post_status     VARCHAR(20),
    duration_ms     INTEGER,
    error_msg       TEXT,
    snapshot        JSONB,
    CHECK (export_type IN ('pdf', 'excel', 'erp'))
);

CREATE INDEX idx_ple_pl        ON price_list_export(price_list_id, exported_at DESC);
CREATE INDEX idx_export_pl_type ON price_list_export(price_list_id, export_type);

-- ── SUBCATEGORY ────────────────────────────────────────────────
CREATE TABLE subcategory (
    id              SERIAL PRIMARY KEY,
    cat_id          VARCHAR(50) NOT NULL,
    cat_name        VARCHAR(100) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      INTEGER REFERENCES users(id),
    updated_at      TIMESTAMPTZ,
    UNIQUE (cat_id, name)
);

CREATE INDEX idx_sub_cat ON subcategory(cat_id);

-- ── SUBCATEGORY ITEM (1 item bisa di 1 subkategori) ────────────
CREATE TABLE subcategory_item (
    id              SERIAL PRIMARY KEY,
    subcategory_id  INTEGER NOT NULL REFERENCES subcategory(id) ON DELETE CASCADE,
    ig_id           INTEGER NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subitem_sub ON subcategory_item(subcategory_id);

-- ── ERP TARGET (multiple DB ERP option) ────────────────────────
CREATE TABLE erp_target (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    host            VARCHAR(200) NOT NULL,
    port            INTEGER NOT NULL DEFAULT 5432,
    db_name         VARCHAR(100) NOT NULL,
    db_user         VARCHAR(100) NOT NULL,
    db_password     VARCHAR(500) NOT NULL,
    is_active       BOOLEAN DEFAULT FALSE,
    note            TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      INTEGER REFERENCES users(id),
    updated_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_erp_active
    ON erp_target(is_active) WHERE is_active = TRUE;

-- ── PDF TEMPLATE CUSTOM FIELD VALUES ──────────────────────────
CREATE TABLE IF NOT EXISTS pdf_template_field_value (
    id              SERIAL PRIMARY KEY,
    template_key    VARCHAR(50) NOT NULL,
    ig_id           INTEGER NOT NULL,
    field_key       VARCHAR(50) NOT NULL,
    value           TEXT,
    updated_by      INTEGER REFERENCES users(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (template_key, ig_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_ptfv_template_item
    ON pdf_template_field_value(template_key, ig_id);

-- ── ITEM BLACKLIST ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_blacklist (
    id              SERIAL PRIMARY KEY,
    ig_id           INTEGER NOT NULL UNIQUE,
    reason          TEXT,
    blacklisted_by  INTEGER REFERENCES users(id),
    blacklisted_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_ig_id ON item_blacklist(ig_id);

-- ── ITEM DIMENSIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_dimensions (
    ig_id           INTEGER PRIMARY KEY,
    tebal           NUMERIC(10,3),
    tebal_label     VARCHAR(50),
    is_tebal_manual BOOLEAN DEFAULT FALSE,
    updated_by      INTEGER REFERENCES users(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── CATEGORY DIMENSION CONFIG ──────────────────────────────────
CREATE TABLE IF NOT EXISTS category_dimension_config (
    cat_id          VARCHAR(50) PRIMARY KEY,
    cat_name        VARCHAR(255),
    require_tebal   BOOLEAN DEFAULT FALSE,
    enabled_by      INTEGER REFERENCES users(id),
    enabled_at      TIMESTAMPTZ
);

-- ── USER MANAGEMENT ENHANCEMENTS ──────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW();

-- Demote existing 'admin' user to role 'user'
UPDATE users SET role = 'user' WHERE username = 'admin' AND role = 'superadmin';

-- Insert superadmin user (idempotent)
INSERT INTO users (username, password_hash, full_name, role)
SELECT 'superadmin', '$2b$10$3lMcPNJ3.6fQXtMQ5wWSRutvhktYkhafyXYoBfr1yxh5Df92eB.ay', 'Super Admin', 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'superadmin');

-- ── POST REPORT PATH ───────────────────────────────────────────
ALTER TABLE price_list
    ADD COLUMN IF NOT EXISTS post_report_path VARCHAR(500);

-- ── ITEM DIMENSIONS (Tebal filter system) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS item_dimensions (
    ig_id           INTEGER PRIMARY KEY,
    tebal           NUMERIC(10, 3),
    tebal_label     VARCHAR(50),
    is_tebal_manual BOOLEAN DEFAULT FALSE,
    detected_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_item_dim_tebal ON item_dimensions(tebal);
