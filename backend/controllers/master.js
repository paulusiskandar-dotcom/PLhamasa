const response   = require("../utils/response");
const $masterModel = require("../models/master");

/*
 * GET /master/categories
 * Ambil semua kategori dari DB ERP
 */
module.exports._getCategories = async function (req, res) {
    try {
        const rows = await $masterModel.getAllCategories();
        const result = rows.map(c => ({
            id:   c.cat_id,
            name: c.cat_name,
        }));
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /master/brands
 * Ambil semua merek dari DB ERP
 */
module.exports._getBrands = async function (req, res) {
    try {
        const rows = await $masterModel.getAllBrands();
        const result = rows.map(b => ({
            id:   b.i_brand,
            name: b.i_brand,
        }));
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /master/grades
 * Ambil semua grade dari DB ERP
 */
module.exports._getGrades = async function (req, res) {
    try {
        const rows = await $masterModel.getAllGrades();
        const result = rows.map(g => ({
            id:   g.g_id || g.grade,
            name: g.g_name || g.grade,
        }));
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};
