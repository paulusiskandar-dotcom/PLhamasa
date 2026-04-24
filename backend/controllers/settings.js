const response        = require("../utils/response");
const $settingsModel  = require("../models/settings");
const $masterModel    = require("../models/master");

/*
 * GET /settings/extended-categories
 * Returns { cat_ids: [], categories: [{id, name}] }
 */
module.exports._getExtendedCategories = async function (req, res) {
    try {
        const [cat_ids, allCats] = await Promise.all([
            $settingsModel.getExtendedCategories(),
            $masterModel.getAllCategories(),
        ]);

        const categories = allCats.map(c => ({ id: c.cat_id, name: c.cat_name }));

        return response.success(res, { cat_ids, categories });
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /settings/extended-categories
 * Body: { cat_ids: ["BP", "HH", ...] }
 */
module.exports._setExtendedCategories = async function (req, res) {
    try {
        const { cat_ids } = req.body;
        if (!Array.isArray(cat_ids))
            return response.error(res, "miss_param", null, 400);

        await $settingsModel.setExtendedCategories(cat_ids, res.locals.user.id);
        return response.success(res, { cat_ids }, "Pengaturan berhasil disimpan");
    } catch (err) {
        return response.error(res, null, err);
    }
};
