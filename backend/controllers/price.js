const response    = require("../utils/response");
const $itemModel  = require("../models/item");
const $priceModel = require("../models/price");

function round100(raw) {
    const r = raw % 100;
    return r <= 10 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

/*
 * POST /price/info
 * Body: { ig_ids: [], cat_id: "BP" (optional) }
 *
 * Returns per-item price data with sync status.
 * result: { items: [...], cat_max_updated_at: "..." }
 */
module.exports._getPricesInfo = async function (req, res) {
    try {
        const { ig_ids, cat_id } = req.body;
        if (!ig_ids || !Array.isArray(ig_ids) || ig_ids.length === 0)
            return response.error(res, "miss_param", null, 400);

        const ids = ig_ids.map(Number);

        // Parallel: PLM prices, ERP prices, ERP updated_at
        const [plmMap, erpPriceRows, erpUpdRows] = await Promise.all([
            $priceModel.getPlmPrices(ids),
            $itemModel.getItemPriceERP(ids),
            $itemModel.getErpUpdatedAt(ids),
        ]);

        // ERP price map: { ig_id: { 2: price, 4: price } }
        const erpPriceMap = {};
        erpPriceRows.forEach(r => {
            if (!erpPriceMap[r.ig_id]) erpPriceMap[r.ig_id] = {};
            erpPriceMap[r.ig_id][r.pr_id] = parseFloat(r.i_price);
        });

        // ERP updated_at map: { ig_id: Date }
        const erpUpdMap = {};
        erpUpdRows.forEach(r => { erpUpdMap[r.ig_id] = r.updated_at; });

        // Get last export info and category max updated_at if cat_id provided
        let lastExport = null;
        let catMaxUpdatedAt = null;
        if (cat_id) {
            [lastExport, catMaxUpdatedAt] = await Promise.all([
                $priceModel.getLastExportInfo(cat_id),
                $itemModel.getCategoryMaxUpdatedAt(cat_id),
            ]);
        }

        const lastExportAt = lastExport ? lastExport.exported_at : null;

        // Build per-item result
        const items = ids.map(ig_id => {
            const plm = plmMap[ig_id] || {};
            const erp = erpPriceMap[ig_id] || {};
            const erpUpdAt = erpUpdMap[ig_id] || null;

            // Derive per-kg from ERP if needed (for items not in PLM)
            // ERP stores final price per unit; we need item weight for this,
            // but weight is on item record — skipped for fallback here.
            // The item.js getItemByQuery result carries weight; this endpoint
            // receives ig_ids only, so for ERP-only items price_cash = null.
            const hasCash   = plm.price_cash   != null;
            const hasCredit = plm.price_credit != null;
            const hasPlm    = hasCash || hasCredit;

            // Sync status
            let syncStatus = "untouched";
            if (hasPlm) {
                if (!lastExportAt) {
                    syncStatus = "draft";
                } else {
                    // Compare PLM price vs ERP unit price
                    // We don't have weight here, so compare raw per-kg
                    // (pending = anything after last export or price differs)
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
 * Returns category metadata + last export info.
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

/*
 * POST /price/autosave
 * Body: { ig_id, pr_id, price }
 * Fire-and-forget: upsert without price_log.
 */
module.exports._autosave = async function (req, res) {
    try {
        const { ig_id, pr_id, price } = req.body;
        if (!ig_id || !pr_id || price == null)
            return response.error(res, "miss_param", null, 400);
        await $priceModel.upsertPlmPrice(ig_id, pr_id, price, res.locals.user.id);
        return response.success(res, null, "ok");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /price/save
 * Body: { items: [{ ig_id, pr_id, old_price, new_price }] }
 * Batch save with price_log.
 */
module.exports._saveBatch = async function (req, res) {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0)
            return response.error(res, "miss_param", null, 400);
        const result = await $priceModel.saveBatch(items, res.locals.user.id);
        return response.success(res, result, "Harga berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── Legacy (kept for backward compat) ─────────────────────── */
module.exports._getPriceTypes = async function (req, res) {
    try {
        return response.success(res, await $itemModel.getPriceTypes());
    } catch (err) {
        return response.error(res, null, err);
    }
};
