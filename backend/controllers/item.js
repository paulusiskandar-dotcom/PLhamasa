const response = require("../utils/response");
const $itemModel = require("../models/item");

/*
 * GET /items
 * Query: category_id, brand_id, grade_id, group_id, item_name, limit, offset
 */
module.exports._getItems = async function (req, res) {
    try {
        const params = {
            cat_id:    req.query.category_id || null,
            brand_id:  req.query.brand_id    || null,
            grade_id:  req.query.grade_id    || null,
            group_id:  req.query.group_id    || null,
            item_name: req.query.item_name   || null,
            limit:     req.query.limit       || 50,
            offset:    req.query.offset      || 0,
        };

        const result = await $itemModel.getItems(params);
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
        const result = await $itemModel.getItemById(ig_id);
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};
