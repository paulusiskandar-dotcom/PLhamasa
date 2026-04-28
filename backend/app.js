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
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedExact = [
            'http://16.79.81.18:3000',
        ];
        const allowedPatterns = [
            /^http:\/\/localhost(:\d+)?$/,
            /^http:\/\/127\.0\.0\.1(:\d+)?$/,
            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
            /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
            /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
        ];
        if (allowedExact.includes(origin) || allowedPatterns.some(function (p) { return p.test(origin); })) {
            return callback(null, true);
        }
        return callback(new Error('CORS: origin not allowed: ' + origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
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
    app.listen(port, '0.0.0.0', () => {
        console.log(`[PLhamasa Backend] Running on port ${port} (LAN: 192.168.9.139:${port})`);
    });
});

module.exports = app;
