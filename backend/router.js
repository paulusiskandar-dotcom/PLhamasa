const auth = require("./middleware/auth");

module.exports = function (app) {

    // ─── Auth ──────────────────────────────────────────────────────────────────
    app.post("/auth/login",  require("./controllers/authentication")._login);
    app.post("/auth/logout", auth.verifyToken, require("./controllers/authentication")._logout);

    // ─── Items ─────────────────────────────────────────────────────────────────
    app.get("/items",        auth.verifyToken, require("./controllers/item")._getItems);
    app.get("/items/:ig_id", auth.verifyToken, require("./controllers/item")._getItemById);

    // ─── Price ─────────────────────────────────────────────────────────────────
    app.get("/price/types",          auth.verifyToken, require("./controllers/price")._getPriceTypes);
    app.post("/price/info",          auth.verifyToken, require("./controllers/price")._getPricesInfo);
    app.post("/price/save",          auth.verifyToken, require("./controllers/price")._savePrices);

    // ─── Export ────────────────────────────────────────────────────────────────
    app.post("/export/erp",          auth.verifyToken, require("./controllers/exportPrice")._exportPriceListERP);
    app.post("/export/manual",       auth.verifyToken, require("./controllers/exportPrice")._exportPriceListManual);

};
