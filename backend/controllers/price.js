const response = require("../utils/response");
const $priceModel = require("../models/price");

/*
 * GET /price/types
 */
module.exports._getPriceTypes = async function (req, res) {
    try {
        const result = await $priceModel.getPriceTypes();
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /price/info
 * Body: { ig_ids: [1,2,3] }
 */
module.exports._getPricesInfo = async function (req, res) {
    try {
        const { ig_ids } = req.body;

        if (!ig_ids || !Array.isArray(ig_ids) || ig_ids.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const result = await $priceModel.getPricesInfo(ig_ids.map(Number));
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /price/save
 * Body: { item_prices: [{ ig_id, pr_id, old_price, new_price }] }
 */
module.exports._savePrices = async function (req, res) {
    try {
        const { item_prices } = req.body;
        const created_by = res.locals.user.id;
        const created_at = moment().format();

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const priceUpdates = item_prices.map(item => ({
            ...item,
            created_by,
            created_at,
        }));

        const result = await $priceModel.updateAndLogPrices(priceUpdates);

        if (!result.success) {
            return response.error(res, "Gagal menyimpan harga");
        }

        return response.success(res, result, "Harga berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};
