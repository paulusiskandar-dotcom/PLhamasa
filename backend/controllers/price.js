const response         = require("../utils/response");
const $itemModel       = require("../models/item");
const $priceModel      = require("../models/price");
const $settingsModel   = require("../models/settings");

// ── Constants ─────────────────────────────────────────────────────────────────
const PR_CODE_MAP = {
    1: "cash_pabrik",
    2: "cash_gudang",
    3: "kredit_pabrik",
    4: "kredit_gudang",
};

const STANDARD_PRICE_TYPES = [
    { pr_id: 2, code: "cash_gudang",   label: "Cash",   group: "Cash"   },
    { pr_id: 4, code: "kredit_gudang", label: "Kredit", group: "Kredit" },
];

const EXTENDED_PRICE_TYPES = [
    { pr_id: 2, code: "cash_gudang",   label: "Cash",   group: "Gudang" },
    { pr_id: 4, code: "kredit_gudang", label: "Kredit", group: "Gudang" },
    { pr_id: 1, code: "cash_pabrik",   label: "Cash",   group: "Pabrik" },
    { pr_id: 3, code: "kredit_pabrik", label: "Kredit", group: "Pabrik" },
];

// Round ERP baseline price (50-50 split)
function roundERP(raw) {
    const r = raw % 100;
    return r <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

// Round PLM price generation (same as existing round100)
function round100(raw) {
    const r = raw % 100;
    return r <= 10 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

/*
 * GET /price/info?cat_id=BP&brand_id=X&grade_id=Y&group_id=Z&item_name=foo
 *
 * Combined endpoint: items + prices + category meta + is_extended.
 * One call replaces /items + /price/info (old POST) + /price/category-info.
 */
module.exports._getPricesInfoGet = async function (req, res) {
    try {
        const { cat_id, brand_id, grade_id, group_id, item_name } = req.query;

        if (!cat_id && !item_name) {
            return response.error(res, "Isi kategori atau nama barang", null, 400);
        }

        // 1. Items from ERP
        const itemRows = await $itemModel.getItemByQuery({ cat_id, brand_id, grade_id, group_id, item_name });

        if (!itemRows.length) {
            return response.success(res, {
                category:    { id: cat_id || null, name: null, is_extended: false },
                price_types: STANDARD_PRICE_TYPES,
                cat_max_updated_at: null,
                last_export: null,
                items:       [],
            });
        }

        const ig_ids = itemRows.map(r => r.ig_id);

        // 2. Check extended_categories setting
        const extCats   = await $settingsModel.getExtendedCategories();
        const isExtended = cat_id ? extCats.includes(cat_id) : false;
        const priceTypes = isExtended ? EXTENDED_PRICE_TYPES : STANDARD_PRICE_TYPES;
        const pr_ids     = priceTypes.map(pt => pt.pr_id);

        // 3. Parallel: PLM prices, ERP prices, ERP updated_at, cat info
        const [plmRows, erpPriceRows, erpUpdRows, catInfo, lastExport] = await Promise.all([
            $priceModel.getPlmPricesMulti(ig_ids, pr_ids),
            $itemModel.getItemPriceERP(ig_ids),
            $itemModel.getErpUpdatedAt(ig_ids),
            cat_id ? $itemModel.getCategoryMaxUpdatedAt(cat_id) : Promise.resolve(null),
            cat_id ? $priceModel.getLastExportInfo(cat_id)     : Promise.resolve(null),
        ]);

        // Build lookup maps
        const weightMap = {};
        const catNameMap = {};
        itemRows.forEach(r => {
            weightMap[r.ig_id]  = parseFloat(r.i_weight) || 0;
            catNameMap[r.ig_id] = r.cat_name;
        });

        const plmMap = {}; // { ig_id: { pr_id: { price, last_update } } }
        plmRows.forEach(r => {
            if (!plmMap[r.ig_id]) plmMap[r.ig_id] = {};
            plmMap[r.ig_id][r.pr_id] = { price: parseFloat(r.i_price), last_update: r.last_update };
        });

        const erpMap = {}; // { ig_id: { pr_id: final_unit_price } }
        erpPriceRows.forEach(r => {
            if (!erpMap[r.ig_id]) erpMap[r.ig_id] = {};
            erpMap[r.ig_id][r.pr_id] = parseFloat(r.i_price);
        });

        const erpUpdMap = {};
        erpUpdRows.forEach(r => { erpUpdMap[r.ig_id] = r.updated_at; });

        // 4. Build items
        const items = itemRows.map(row => {
            const ig_id  = row.ig_id;
            const weight = weightMap[ig_id];
            const plm    = plmMap[ig_id] || {};
            const erp    = erpMap[ig_id] || {};

            const prices = {};
            priceTypes.forEach(pt => {
                if (plm[pt.pr_id] != null) {
                    prices[pt.code] = { current: plm[pt.pr_id].price, source: "plm" };
                } else if (erp[pt.pr_id] != null && weight > 0) {
                    prices[pt.code] = { current: roundERP(erp[pt.pr_id] / weight), source: "erp" };
                } else {
                    prices[pt.code] = { current: null, source: null };
                }
            });

            return {
                ig_id,
                name:           row.i_name,
                weight,
                erp_updated_at: erpUpdMap[ig_id] || null,
                prices,
            };
        });

        const catName = catInfo ? catInfo.cat_name : (itemRows[0] ? catNameMap[itemRows[0].ig_id] : null);

        return response.success(res, {
            category: {
                id:          cat_id || null,
                name:        catName,
                is_extended: isExtended,
            },
            price_types:        priceTypes,
            cat_max_updated_at: catInfo ? catInfo.max_updated_at : null,
            last_export:        lastExport,
            items,
        });
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /price/info (legacy — kept for backward compat)
 * Body: { ig_ids: [], cat_id: "BP" (optional) }
 */
module.exports._getPricesInfo = async function (req, res) {
    try {
        const { ig_ids, cat_id } = req.body;
        if (!ig_ids || !Array.isArray(ig_ids) || ig_ids.length === 0)
            return response.error(res, "miss_param", null, 400);

        const ids = ig_ids.map(Number);
        const [plmMap, erpPriceRows, erpUpdRows] = await Promise.all([
            $priceModel.getPlmPrices(ids),
            $itemModel.getItemPriceERP(ids),
            $itemModel.getErpUpdatedAt(ids),
        ]);

        const erpPriceMap = {};
        erpPriceRows.forEach(r => {
            if (!erpPriceMap[r.ig_id]) erpPriceMap[r.ig_id] = {};
            erpPriceMap[r.ig_id][r.pr_id] = parseFloat(r.i_price);
        });
        const erpUpdMap = {};
        erpUpdRows.forEach(r => { erpUpdMap[r.ig_id] = r.updated_at; });

        let lastExport = null, catMaxUpdatedAt = null;
        if (cat_id) {
            [lastExport, catMaxUpdatedAt] = await Promise.all([
                $priceModel.getLastExportInfo(cat_id),
                $itemModel.getCategoryMaxUpdatedAt(cat_id),
            ]);
        }
        const lastExportAt = lastExport ? lastExport.exported_at : null;

        const items = ids.map(ig_id => {
            const plm = plmMap[ig_id] || {};
            const erpUpdAt = erpUpdMap[ig_id] || null;
            const hasPlm = plm.price_cash != null || plm.price_credit != null;
            let syncStatus = "untouched";
            if (hasPlm) {
                if (!lastExportAt) syncStatus = "draft";
                else {
                    const erpUpdated = erpUpdAt && new Date(erpUpdAt) > new Date(lastExportAt);
                    syncStatus = erpUpdated ? "pending" : "synced";
                }
            }
            return {
                ig_id,
                price_cash:    plm.price_cash   ?? null,
                price_credit:  plm.price_credit ?? null,
                erp_updated_at: erpUpdAt,
                sync_status:   syncStatus,
                last_update:   plm.last_update || null,
            };
        });

        return response.success(res, {
            items,
            cat_max_updated_at: catMaxUpdatedAt ? catMaxUpdatedAt.max_updated_at : null,
            last_export: lastExport,
        });
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /price/category-info?cat_id=BP
 */
module.exports._getCategoryInfo = async function (req, res) {
    try {
        const { cat_id } = req.query;
        if (!cat_id) return response.error(res, "miss_param", null, 400);
        const [catInfo, lastExport] = await Promise.all([
            $itemModel.getCategoryMaxUpdatedAt(cat_id),
            $priceModel.getLastExportInfo(cat_id),
        ]);
        return response.success(res, {
            cat_id,
            cat_name:        catInfo ? catInfo.cat_name : null,
            erp_last_update: catInfo ? catInfo.max_updated_at : null,
            last_export:     lastExport,
        });
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* POST /price/autosave */
module.exports._autosave = async function (req, res) {
    try {
        const { ig_id, pr_id, price } = req.body;
        if (!ig_id || !pr_id || price == null) return response.error(res, "miss_param", null, 400);
        await $priceModel.upsertPlmPrice(ig_id, pr_id, price, res.locals.user.id);
        return response.success(res, null, "ok");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* POST /price/save */
module.exports._saveBatch = async function (req, res) {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || !items.length) return response.error(res, "miss_param", null, 400);
        const result = await $priceModel.saveBatch(items, res.locals.user.id);
        return response.success(res, result, "Harga berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* Legacy */
module.exports._getPriceTypes = async function (req, res) {
    try { return response.success(res, await $itemModel.getPriceTypes()); }
    catch (err) { return response.error(res, null, err); }
};
