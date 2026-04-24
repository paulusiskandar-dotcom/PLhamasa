require("dotenv").config();
const pgp = require("pg-promise")();

const db = pgp({
    host:     process.env.PLM_DB_HOST,
    port:     process.env.PLM_DB_PORT || 5432,
    database: process.env.PLM_DB_NAME,
    user:     process.env.PLM_DB_USER,
    password: process.env.PLM_DB_PASS,
});

const EXPECTED = {
    users: ["u_id", "u_username", "u_password", "u_role", "created_at", "deleted_at"],
    item_price: ["ip_id", "ig_id", "pr_id", "i_price", "created_by", "created_at", "updated_by", "updated_at"],
    price_log: ["plog_id", "ig_id", "pr_id", "plog_from", "plog_to", "u_id", "plog_date"],
};

async function getColumns(tableName) {
    return db.any(
        `SELECT column_name FROM information_schema.columns
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
    console.log("=== Test Koneksi DB PLhamasa ===");
    console.log(`Host : ${process.env.PLM_DB_HOST}`);
    console.log(`DB   : ${process.env.PLM_DB_NAME}`);
    console.log(`User : ${process.env.PLM_DB_USER}`);
    console.log("");

    try {
        await db.connect();
        console.log("[OK] Koneksi berhasil\n");
    } catch (err) {
        console.error("[FAIL] Koneksi gagal:", err.message);
        process.exit(1);
    }

    console.log("=== Cek Tabel & Kolom ===");
    let allGood = true;

    for (const [tbl, expectedCols] of Object.entries(EXPECTED)) {
        const rows = await getColumns(tbl);
        if (rows.length === 0) {
            console.log(`[MISSING] ${tbl}`);
            allGood = false;
            continue;
        }

        const actualCols = rows.map(r => r.column_name);
        const missing = expectedCols.filter(c => !actualCols.includes(c));
        const count = await countRows(tbl);

        if (missing.length > 0) {
            console.log(`[WARN]    ${tbl.padEnd(14)} — ${count} baris | kolom kurang: ${missing.join(", ")}`);
            allGood = false;
        } else {
            console.log(`[OK]      ${tbl.padEnd(14)} — ${count} baris | kolom: ${actualCols.join(", ")}`);
        }
    }

    console.log("\n=== Cek Seed Data ===");
    const adminUser = await db.oneOrNone(
        "SELECT u_username, u_role FROM users WHERE u_username = 'admin'"
    );
    if (adminUser) {
        console.log(`[OK]      User admin seed ada (role: ${adminUser.u_role})`);
    } else {
        console.log("[WARN]    User admin seed tidak ditemukan");
        allGood = false;
    }

    console.log("");
    console.log(allGood
        ? "=== SEMUA OK — DB PLhamasa siap dipakai ==="
        : "=== ADA MASALAH — cek output di atas ==="
    );

    await pgp.end();
}

main().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});
