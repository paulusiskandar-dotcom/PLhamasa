const auth = require("./middleware/auth");

module.exports = function (app) {

    // ─── Auth ──────────────────────────────────────────────────────────────────
    app.post("/auth/login",  require("./controllers/authentication")._login);
    app.post("/auth/logout", auth.verifyToken, require("./controllers/authentication")._logout);

    // ─── Items ─────────────────────────────────────────────────────────────────
    app.get("/items",        auth.verifyToken, require("./controllers/item")._getItems);
    app.get("/items/:ig_id", auth.verifyToken, require("./controllers/item")._getItemById);

    // ─── Price ─────────────────────────────────────────────────────────────────
    app.get("/price/types",         auth.verifyToken, require("./controllers/price")._getPriceTypes);
    app.post("/price/info",         auth.verifyToken, require("./controllers/price")._getPricesInfo);
    app.get("/price/category-info", auth.verifyToken, require("./controllers/price")._getCategoryInfo);
    app.post("/price/autosave",     auth.verifyToken, require("./controllers/price")._autosave);
    app.post("/price/save",         auth.verifyToken, require("./controllers/price")._saveBatch);

    // ─── Export ────────────────────────────────────────────────────────────────
    app.post("/export/erp",                   auth.verifyToken, require("./controllers/exportPrice")._exportPriceListERP);
    app.post("/export/manual",                auth.verifyToken, require("./controllers/exportPrice")._exportPriceListManual);
    app.post("/export/pdf",                   auth.verifyToken, require("./controllers/exportPrice")._exportPdf);
    app.get("/export/history",                auth.verifyToken, require("./controllers/exportPrice")._getExportHistory);
    app.get("/export/history/:id/download",   auth.verifyToken, require("./controllers/exportPrice")._downloadHistory);

    // ─── Master Data ───────────────────────────────────────────────────────────
    app.get("/master/categories", auth.verifyToken, require("./controllers/master")._getCategories);
    app.get("/master/brands",     auth.verifyToken, require("./controllers/master")._getBrands);
    app.get("/master/grades",     auth.verifyToken, require("./controllers/master")._getGrades);

};
