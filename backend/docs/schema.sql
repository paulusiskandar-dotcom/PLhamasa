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
    cat_id              INTEGER NOT NULL,
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
    CHECK (status IN ('OPEN', 'PUBLISHED'))
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
    CHECK (export_type IN ('pdf', 'excel', 'erp'))
);

CREATE INDEX idx_ple_pl ON price_list_export(price_list_id, exported_at DESC);

-- ── SUBCATEGORY ────────────────────────────────────────────────
CREATE TABLE subcategory (
    id              SERIAL PRIMARY KEY,
    cat_id          INTEGER NOT NULL,
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
