const pgp = require("pg-promise")();

// ─── DB 1: ERP (READ ONLY — master data item, kategori, merek, harga lama) ────
const configERP = {
    host:     process.env.ERP_DB_HOST     || "localhost",
    port:     process.env.ERP_DB_PORT     || 5432,
    database: process.env.ERP_DB_NAME     || "erp_db",
    user:     process.env.ERP_DB_USER     || "postgres",
    password: process.env.ERP_DB_PASS     || "",
};

// ─── DB 2: PLhamasa (READ + WRITE — harga per kg & price log) ─────────────────
const configPLM = {
    host:     process.env.PLM_DB_HOST     || "localhost",
    port:     process.env.PLM_DB_PORT     || 5432,
    database: process.env.PLM_DB_NAME     || "plhamasa_db",
    user:     process.env.PLM_DB_USER     || "postgres",
    password: process.env.PLM_DB_PASS     || "",
};

const dbERP = pgp(configERP);
const dbPLM = pgp(configPLM);

module.exports = { dbERP, dbPLM, pgp };
