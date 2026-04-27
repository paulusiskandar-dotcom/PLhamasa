const response  = require('../utils/response');
const $blacklist = require('../models/blacklist');

module.exports._list = async function (req, res) {
    try {
        return response.success(res, await $blacklist.listAll());
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._itemsForCat = async function (req, res) {
    try {
        const catId = req.query.cat_id;
        if (!catId) return response.error(res, 'cat_id_required', null, 400);
        const items = await $blacklist.itemsForCategory(catId, req.query.q || '');
        return response.success(res, items);
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._add = async function (req, res) {
    try {
        const { ig_ids, reason } = req.body;
        if (!Array.isArray(ig_ids) || !ig_ids.length) {
            return response.error(res, 'ig_ids_required', null, 400);
        }
        const result = await $blacklist.addMany(ig_ids, reason, res.locals.user.id);
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._remove = async function (req, res) {
    try {
        const igId = parseInt(req.params.ig_id, 10);
        if (isNaN(igId)) return response.error(res, 'ig_id_required', null, 400);
        return response.success(res, await $blacklist.remove(igId));
    } catch (err) {
        return response.error(res, null, err);
    }
};
