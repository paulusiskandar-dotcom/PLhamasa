require("dotenv").config();
const express      = require("express");
const path         = require("path");
const cookieParser = require("cookie-parser");

const app  = express();
const port = process.env.PORT || 3000;

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "www/view"));
app.use(express.static(path.join(__dirname, "www"), {
    setHeaders: function (res, filePath) {
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.pug')) {
            res.set('Cache-Control', 'no-store');
        }
    }
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── No-cache for HTML pages + API URL ───────────────────────────────────────
app.use(function (req, res, next) {
    res.set('Cache-Control', 'no-store');
    res.locals.apiUrl = process.env.API_URL || "http://localhost:3001/";
    next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/",            require("./router/login"));
app.get("/login",       require("./router/login"));
app.get("/price-list",  require("./middleware/auth"), require("./router/priceList"));
app.get("/edit/:id",    require("./middleware/auth"), require("./router/edit"));
app.get("/settings",    require("./middleware/auth"), require("./router/settings"));
app.get("/logout",      require("./router/logout"));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use(function (req, res) {
    res.status(404).send("Halaman tidak ditemukan");
});

app.listen(port, () => {
    console.log(`[Price List Manager] Frontend running on port ${port}`);
});
