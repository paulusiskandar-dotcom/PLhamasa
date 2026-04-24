require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const moment = require("moment-timezone");

const app = express();
const port = process.env.PORT || 3001;

// ─── Globals ──────────────────────────────────────────────────────────────────
global.$rootPath = __dirname;
global.moment = moment;
global.moment.tz.setDefault("Asia/Jakarta");

// ─── Database (dual connection) ───────────────────────────────────────────────
const { dbERP, dbPLM } = require("./configs/database");
global.dbERP = dbERP;  // DB ERP (read-only: item, category, brand, price lama)
global.dbPLM = dbPLM;  // DB PLhamasa (read+write: item_price per kg, price_log)

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ───────────────────────────────────────────────────────────────────
require("./router")(app);

// ─── DB Health Check ──────────────────────────────────────────────────────────
async function checkDatabases() {
    const checks = [
        { label: "DB ERP", db: dbERP, name: `${process.env.ERP_DB_NAME}@${process.env.ERP_DB_HOST}` },
        { label: "DB PLM", db: dbPLM, name: `${process.env.PLM_DB_NAME}@${process.env.PLM_DB_HOST}` },
    ];
    let allOk = true;
    for (const { label, db, name } of checks) {
        try {
            await db.connect();
            console.log(`  [OK] ${label} : ${name}`);
        } catch (err) {
            console.error(`  [FAIL] ${label} : ${name} — ${err.message}`);
            allOk = false;
        }
    }
    if (!allOk) {
        console.error("[PLhamasa Backend] Satu atau lebih DB gagal terhubung. Cek .env");
        process.exit(1);
    }
}

// ─── Start ────────────────────────────────────────────────────────────────────
checkDatabases().then(() => {
    app.listen(port, () => {
        console.log(`[PLhamasa Backend] Running on port ${port}`);
    });
});

module.exports = app;
