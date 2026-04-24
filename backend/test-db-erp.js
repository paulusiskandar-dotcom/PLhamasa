require("dotenv").config();
const pgp = require("pg-promise")();

const db = pgp({
    host:     process.env.ERP_DB_HOST,
    port:     process.env.ERP_DB_PORT || 5432,
    database: process.env.ERP_DB_NAME,
    user:     process.env.ERP_DB_USER,
    password: process.env.ERP_DB_PASS,
});

const TABLES = ["item", "item_category", "price", "item_price"];

async function checkTable(name) {
    const exists = await db.oneOrNone(
        "SELECT to_regclass($1::text) AS oid",
        [name]
    );
    return exists && exists.oid !== null;
}

async function getColumns(tableName) {
    return db.any(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
    );
}

async function countRows(tableName) {
    const r = await db.one(`SELECT COUNT(*) AS n FROM ${tableName}`);
    return parseInt(r.n, 10);
}

async function main() {
    console.log("=== Test Koneksi DB ERP ===");
    console.log(`Host : ${process.env.ERP_DB_HOST}`);
    console.log(`DB   : ${process.env.ERP_DB_NAME}`);
    console.log(`User : ${process.env.ERP_DB_USER}`);
    console.log("");

    // Ping
    try {
        await db.connect();
        console.log("[OK] Koneksi berhasil\n");
    } catch (err) {
        console.error("[FAIL] Koneksi gagal:", err.message);
        process.exit(1);
    }

    // Cek setiap tabel
    console.log("=== Cek Tabel ===");
    for (const tbl of TABLES) {
        const found = await checkTable(tbl);
        if (found) {
            const n = await countRows(tbl);
            console.log(`[OK] ${tbl.padEnd(16)} — ${n} baris`);
        } else {
            console.log(`[MISSING] ${tbl}`);
        }
    }

    // Tampilkan kolom tabel item
    console.log("\n=== Kolom Tabel: item ===");
    const cols = await getColumns("item");
    if (cols.length === 0) {
        console.log("(tabel tidak ditemukan atau kosong)");
    } else {
        cols.forEach(c => console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`));
    }

    await pgp.end();
}

main().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});
