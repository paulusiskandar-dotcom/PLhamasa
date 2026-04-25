/*
 * subcategory.js — Subcategory controller
 * Routes: /subcategory/*
 */

const response = require('../utils/response');
const $model   = require('../models/subcategory');

// ── GET /subcategory?cat_id= ──────────────────────────────────────────────────

module.exports._list = async function (req, res) {
    try {
        const { cat_id } = req.query;
        if (!cat_id) return response.error(res, 'cat_id required', null, 400);
        const list = await $model.listByCategory(cat_id);
        return response.success(res, list);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /subcategory/category/:cat_id/assignments ─────────────────────────────

module.exports._assignments = async function (req, res) {
    try {
        const { cat_id } = req.params;
        if (!cat_id) return response.error(res, 'cat_id required', null, 400);
        const map = await $model.getItemAssignments(cat_id);
        return response.success(res, map);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /subcategory/:id ──────────────────────────────────────────────────────

module.exports._getById = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const sub = await $model.getById(id);
        if (!sub) return response.error(res, 'not_found', null, 404);
        const items = await $model.getItems(id);
        return response.success(res, { ...sub, items });
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /subcategory ─────────────────────────────────────────────────────────
// Body: { cat_id, cat_name, name }

module.exports._create = async function (req, res) {
    try {
        const { cat_id, cat_name, name } = req.body;
        if (!cat_id || !name) return response.error(res, 'cat_id and name required', null, 400);
        const userId = res.locals.user.id;
        const sub = await $model.create(cat_id, cat_name || cat_id, name, userId);
        return response.success(res, sub, 'Subcategory created');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── PUT /subcategory/:id ──────────────────────────────────────────────────────
// Body: { name }

module.exports._update = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { name } = req.body;
        if (!name) return response.error(res, 'name required', null, 400);
        const userId = res.locals.user.id;
        const sub = await $model.update(id, name, userId);
        return response.success(res, sub, 'Subcategory updated');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── DELETE /subcategory/:id ───────────────────────────────────────────────────

module.exports._delete = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        await $model.delete(id);
        return response.success(res, null, 'Subcategory deleted');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /subcategory/:id/items ───────────────────────────────────────────────
// Body: { ig_ids: [int] }

module.exports._assignItems = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { ig_ids } = req.body;
        if (!ig_ids || !Array.isArray(ig_ids)) {
            return response.error(res, 'ig_ids array required', null, 400);
        }
        const userId = res.locals.user.id;
        await $model.assignItems(id, ig_ids.map(Number), userId);
        return response.success(res, null, 'Items assigned');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── DELETE /subcategory/:id/items/:ig_id ──────────────────────────────────────

module.exports._removeItem = async function (req, res) {
    try {
        const id    = parseInt(req.params.id, 10);
        const ig_id = parseInt(req.params.ig_id, 10);
        if (isNaN(id) || isNaN(ig_id)) return response.error(res, 'invalid_id', null, 400);
        await $model.removeItem(id, ig_id);
        return response.success(res, null, 'Item removed');
    } catch (err) {
        return response.error(res, null, err);
    }
};
