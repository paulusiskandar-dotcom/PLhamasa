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

// ─── Database ─────────────────────────────────────────────────────────────────
const { db } = require("./configs/database");
global.db = db;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ───────────────────────────────────────────────────────────────────
require("./router")(app);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`[Price List Manager] Backend running on port ${port}`);
});

module.exports = app;
