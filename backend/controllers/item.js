const response   = require("../utils/response");
const $itemModel = require("../models/item");

/*
 * GET /items
 * Query: cat_id, brand_id, group_id, grade_id, item_name
 * Data diambil dari DB ERP
 */
module.exports._getItems = async function (req, res) {
    try {
        const params = {
            cat_id:    req.query.cat_id    || null,
            brand_id:  req.query.brand_id  || null,
            group_id:  req.query.group_id  || null,
            grade_id:  req.query.grade_id  || null,
            item_name: req.query.item_name || null,
        };

        // Validasi: minimal salah satu filter harus diisi
        if (!params.cat_id && !params.item_name) {
            return response.error(res, "Isi kategori atau nama barang terlebih dahulu", null, 400);
        }

        const items = await $itemModel.getItemByQuery(params);

        // Map ke format yang dipakai frontend
        const result = items.map(it => ({
            ig_id:  it.ig_id,
            id:     it.i_id,
            name:   it.i_name,
            weight: parseFloat(it.i_weight) || 0,
            group:  it.i_group,
            brand:  it.i_brand,
            serial: it.serial_id,
            grade:  it.grade,
            unit:   it.unit,
            category: {
                id:   it.cat_id,
                name: it.cat_name,
            },
        }));

        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /items/:ig_id
 */
module.exports._getItemById = async function (req, res) {
    try {
        const ig_id = parseInt(req.params.ig_id);
        const result = await $itemModel.getItemById([ig_id]);
        return response.success(res, result[0] || null);
    } catch (err) {
        return response.error(res, null, err);
    }
};
