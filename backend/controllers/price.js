const response    = require("../utils/response");
const $itemModel  = require("../models/item");
const $priceModel = require("../models/price");

/* ── GET /price/types ──────────────────────────────────────────── */
module.exports._getPriceTypes = async function (req, res) {
    try {
        return response.success(res, await $itemModel.getPriceTypes());
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── POST /price/info  body: { ig_ids: [] } ────────────────────── */
module.exports._getPricesInfo = async function (req, res) {
    try {
        const { ig_ids } = req.body;
        if (!ig_ids || !Array.isArray(ig_ids) || ig_ids.length === 0)
            return response.error(res, "miss_param", null, 400);
        return response.success(res, await $priceModel.getPricesInfo(ig_ids.map(Number)));
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── POST /price/save  (legacy)  body: { item_prices: [] } ────── */
module.exports._savePrices = async function (req, res) {
    try {
        const { item_prices } = req.body;
        const created_by = res.locals.user.id;
        const created_at = moment().format();

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0)
            return response.error(res, "miss_param", null, 400);

        const result = await $priceModel.updateAndLogPrices(
            item_prices.map(p => ({ ...p, created_by, created_at }))
        );
        if (!result.success) return response.error(res, "Gagal menyimpan harga");
        return response.success(res, result, "Harga berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── POST /price/draft/save  body: { ig_id, pr_id, price } ─────── */
module.exports._saveDraft = async function (req, res) {
    try {
        const { ig_id, pr_id, price } = req.body;
        const user_id = res.locals.user.id;
        if (!ig_id || !pr_id || price == null)
            return response.error(res, "miss_param", null, 400);
        await $priceModel.saveDraft(ig_id, pr_id, price, user_id);
        return response.success(res, null, "draft saved");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── POST /price/draft/commit ───────────────────────────────────── */
module.exports._commitDrafts = async function (req, res) {
    try {
        const result = await $priceModel.commitDrafts(res.locals.user.id);
        return response.success(res, result, "Harga berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── POST /price/draft/discard ──────────────────────────────────── */
module.exports._discardDrafts = async function (req, res) {
    try {
        await $priceModel.discardDrafts(res.locals.user.id);
        return response.success(res, null, "Drafts discarded");
    } catch (err) {
        return response.error(res, null, err);
    }
};

/* ── GET /price/draft/changes?since=<iso> ───────────────────────── */
module.exports._getDraftChanges = async function (req, res) {
    try {
        const since = req.query.since || new Date(0).toISOString();
        return response.success(res, await $priceModel.getDraftChangesSince(since));
    } catch (err) {
        return response.error(res, null, err);
    }
};
