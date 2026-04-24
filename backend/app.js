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

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`[PLhamasa Backend] Running on port ${port}`);
    console.log(`  → DB ERP : ${process.env.ERP_DB_NAME || "erp_db"}@${process.env.ERP_DB_HOST || "localhost"}`);
    console.log(`  → DB PLM : ${process.env.PLM_DB_NAME || "plhamasa_db"}@${process.env.PLM_DB_HOST || "localhost"}`);
});

module.exports = app;
