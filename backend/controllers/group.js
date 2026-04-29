const groupService = require('../services/groupService');
const response     = require('../utils/response');

module.exports._listConfigs = async function (req, res) {
    try {
        const list = await groupService.listCategoryConfigs();
        return response.success(res, list);
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._enableGrouping = async function (req, res) {
    try {
        const { cat_id, cat_name } = req.body;
        if (!cat_id) return response.error(res, 'cat_id wajib', null, 400);
        await groupService.enableGrouping(cat_id, cat_name, res.locals.user.id);
        return response.success(res, { ok: true }, 'Grouping enabled');
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._disableGrouping = async function (req, res) {
    try {
        const catId = req.params.cat_id;
        await groupService.disableGrouping(catId);
        return response.success(res, { ok: true }, 'Grouping disabled');
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._previewInit = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const result = await groupService.previewInitGroups(plId);
        return response.success(res, result);
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._applyInit = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const result = await groupService.applyInitGroups(plId, res.locals.user.id);
        return response.success(res, result, 'Groups initialized');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._getGroups = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const groups = await groupService.getGroupsWithItems(plId);
        return response.success(res, groups);
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._moveItem = async function (req, res) {
    try {
        const { ig_id, from_group_id, to_group_id } = req.body;
        if (!ig_id || !from_group_id || !to_group_id) {
            return response.error(res, 'ig_id, from_group_id, to_group_id wajib', null, 400);
        }
        await groupService.moveItemToGroup(ig_id, from_group_id, to_group_id);
        return response.success(res, { ok: true }, 'Item moved');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._detectNewItems = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const newItems = await groupService.detectNewItems(plId);
        return response.success(res, newItems);
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._confirmNewItem = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const { ig_id, group_id } = req.body;
        if (!ig_id || !group_id) {
            return response.error(res, 'ig_id dan group_id wajib', null, 400);
        }
        await groupService.confirmNewItemAssignment(plId, ig_id, group_id, res.locals.user.id);
        return response.success(res, { ok: true }, 'Item assigned');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._createGroup = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const { thickness_value } = req.body;
        if (!thickness_value || isNaN(thickness_value)) {
            return response.error(res, 'thickness_value wajib (numeric)', null, 400);
        }
        const result = await groupService.createGroup(plId, parseFloat(thickness_value), res.locals.user.id);
        return response.success(res, result, 'Group created');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._updateGroupPrice = async function (req, res) {
    try {
        const groupId = parseInt(req.params.group_id, 10);
        if (isNaN(groupId)) return response.error(res, 'invalid_group_id', null, 400);
        const result = await groupService.updateGroupPrice(groupId, req.body, res.locals.user.id);
        return response.success(res, result, 'Group price updated');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};
