const auth             = require("./middleware/auth");
const requireSuperadmin = require("./middleware/requireSuperadmin");

module.exports = function (app) {

    // ─── Auth ──────────────────────────────────────────────────────────────────
    app.post("/auth/login",  require("./controllers/authentication")._login);
    app.post("/auth/logout", auth.verifyToken, require("./controllers/authentication")._logout);

    // ─── User Management ───────────────────────────────────────────────────────
    const userCtrl = require("./controllers/user");
    app.get("/users",                     auth.verifyToken, requireSuperadmin, userCtrl._list);
    app.post("/users",                    auth.verifyToken, requireSuperadmin, userCtrl._create);
    app.put("/users/:id",                 auth.verifyToken, requireSuperadmin, userCtrl._update);
    app.post("/users/:id/reset-password", auth.verifyToken, requireSuperadmin, userCtrl._resetPassword);
    app.delete("/users/:id",              auth.verifyToken, requireSuperadmin, userCtrl._delete);
    app.post("/me/change-password",       auth.verifyToken, userCtrl._changeOwnPassword);

    // ─── Items ─────────────────────────────────────────────────────────────────
    app.get("/items",        auth.verifyToken, require("./controllers/item")._getItems);
    app.get("/items/:ig_id", auth.verifyToken, require("./controllers/item")._getItemById);

    // ─── Price ─────────────────────────────────────────────────────────────────
    app.get("/price/types",         auth.verifyToken, require("./controllers/price")._getPriceTypes);
    app.get("/price/info",          auth.verifyToken, require("./controllers/price")._getPricesInfoGet);
    app.post("/price/info",         auth.verifyToken, require("./controllers/price")._getPricesInfo);    // legacy
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

    // ─── Settings ──────────────────────────────────────────────────────────────
    app.get("/settings/extended-categories",  auth.verifyToken, require("./controllers/settings")._getExtendedCategories);
    app.post("/settings/extended-categories", auth.verifyToken, require("./controllers/settings")._setExtendedCategories);

    // ── PRICE LIST V2 ──────────────────────────────────────────────────────────
    app.get("/price-list",                        auth.verifyToken, require("./controllers/priceList")._list);
    app.post("/price-list/start",                 auth.verifyToken, require("./controllers/priceList")._start);
    app.get("/price-list/:id",                    auth.verifyToken, require("./controllers/priceList")._getById);
    app.post("/price-list/:id/lock",              auth.verifyToken, require("./controllers/priceList")._lock);
    app.post("/price-list/:id/heartbeat",         auth.verifyToken, require("./controllers/priceList")._heartbeat);
    app.post("/price-list/:id/release-lock",      auth.verifyToken, require("./controllers/priceList")._releaseLock);
    app.post("/price-list/:id/take-over",         auth.verifyToken, require("./controllers/priceList")._takeover);
    app.put("/price-list/:id/item",               auth.verifyToken, require("./controllers/priceList")._updateItem);
    app.put("/price-list/:id/items/bulk",         auth.verifyToken, require("./controllers/priceList")._bulkUpdate);
    app.get("/price-list/:id/log",                auth.verifyToken, require("./controllers/priceList")._getLog);
    app.post("/price-list/:id/post-to-erp",       auth.verifyToken, require("./controllers/priceList")._postToErp);
    app.get("/price-list/:id/post-preview",       auth.verifyToken, require("./controllers/priceList")._postPreview);
    app.post("/price-list/:id/post",              auth.verifyToken, require("./controllers/priceList")._postExecute);
    app.get("/price-list/:id/cross-check",        auth.verifyToken, require("./controllers/priceList")._crossCheck);
    app.get("/price-list/:id/post-report",        auth.verifyToken, require("./controllers/priceList")._downloadPostReport);
    app.get("/price-list/:id/export-excel",       auth.verifyToken, require("./controllers/priceList")._exportExcel);

    // ── SUBCATEGORY ────────────────────────────────────────────────────────────
    app.get("/subcategory",                                   auth.verifyToken, require("./controllers/subcategory")._list);
    app.get("/subcategory/category/:cat_id/assignments",      auth.verifyToken, require("./controllers/subcategory")._assignments);
    app.get("/subcategory/:id",                               auth.verifyToken, require("./controllers/subcategory")._getById);
    app.post("/subcategory",                                  auth.verifyToken, require("./controllers/subcategory")._create);
    app.put("/subcategory/:id",                               auth.verifyToken, require("./controllers/subcategory")._update);
    app.delete("/subcategory/:id",                            auth.verifyToken, require("./controllers/subcategory")._delete);
    app.post("/subcategory/:id/items",                        auth.verifyToken, require("./controllers/subcategory")._assignItems);
    app.delete("/subcategory/:id/items/:ig_id",               auth.verifyToken, require("./controllers/subcategory")._removeItem);

    // ── BLACKLIST ──────────────────────────────────────────────────────────────
    app.get("/blacklist",              auth.verifyToken, require("./controllers/blacklist")._list);
    app.get("/blacklist/items",        auth.verifyToken, require("./controllers/blacklist")._itemsForCat);
    app.post("/blacklist",             auth.verifyToken, require("./controllers/blacklist")._add);
    app.delete("/blacklist/:ig_id",    auth.verifyToken, require("./controllers/blacklist")._remove);

    // ── PDF TEMPLATE ───────────────────────────────────────────────────────────
    app.get("/pdf-template/list",              auth.verifyToken, require("./controllers/pdfTemplate")._list);
    app.get("/pdf-template/:key/items",        auth.verifyToken, require("./controllers/pdfTemplate")._getTemplateItems);
    app.post("/pdf-template/:key/value",       auth.verifyToken, require("./controllers/pdfTemplate")._setValue);
    app.post("/pdf-template/:key/render",      auth.verifyToken, require("./controllers/pdfTemplate")._render);

    // ── ERP TARGET ─────────────────────────────────────────────────────────────
    app.get("/erp-target",                  auth.verifyToken, require("./controllers/erpTarget")._list);
    app.get("/erp-target/active",           auth.verifyToken, require("./controllers/erpTarget")._getActive);
    app.post("/erp-target/test",            auth.verifyToken, requireSuperadmin, require("./controllers/erpTarget")._testConnection);
    app.post("/erp-target",                 auth.verifyToken, requireSuperadmin, require("./controllers/erpTarget")._create);
    app.put("/erp-target/:id",              auth.verifyToken, requireSuperadmin, require("./controllers/erpTarget")._update);
    app.delete("/erp-target/:id",           auth.verifyToken, requireSuperadmin, require("./controllers/erpTarget")._delete);
    app.post("/erp-target/:id/activate",    auth.verifyToken, requireSuperadmin, require("./controllers/erpTarget")._activate);

    // ── GROUPING ───────────────────────────────────────────────────────────────
    const groupCtrl = require("./controllers/group");
    app.get("/group/category-config",                    auth.verifyToken, requireSuperadmin, groupCtrl._listConfigs);
    app.post("/group/enable",                            auth.verifyToken, requireSuperadmin, groupCtrl._enableGrouping);
    app.delete("/group/disable/:cat_id",                 auth.verifyToken, requireSuperadmin, groupCtrl._disableGrouping);
    app.get("/price-list/:id/group/preview-init",        auth.verifyToken, groupCtrl._previewInit);
    app.post("/price-list/:id/group/init",               auth.verifyToken, groupCtrl._applyInit);
    app.get("/price-list/:id/group",                     auth.verifyToken, groupCtrl._getGroups);
    app.post("/price-list/:id/group/move-item",          auth.verifyToken, groupCtrl._moveItem);
    app.get("/price-list/:id/group/new-items",           auth.verifyToken, groupCtrl._detectNewItems);
    app.post("/price-list/:id/group/confirm-new-item",   auth.verifyToken, groupCtrl._confirmNewItem);
    app.post("/price-list/:id/group/create",             auth.verifyToken, groupCtrl._createGroup);
    app.put('/group/:group_id/price',                    auth.verifyToken, groupCtrl._updateGroupPrice);
    app.get('/price-list/:id/group/detect-changes',  auth.verifyToken, groupCtrl._detectChanges);
    app.post('/price-list/:id/group/confirm-batch',  auth.verifyToken, groupCtrl._confirmBatch);
    app.get('/price-list/:id/group/validate-post',   auth.verifyToken, groupCtrl._validatePostReadiness);
    app.delete('/group/:group_id',                   auth.verifyToken, groupCtrl._deleteEmptyGroup);

};
