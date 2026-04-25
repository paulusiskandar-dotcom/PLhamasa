/*
 * erpTarget.js — ERP Target controller
 * Routes: /erp-target/*
 * Write operations require superadmin (enforced in router via requireSuperadmin middleware).
 */

const response = require('../utils/response');
const $model   = require('../models/erpTarget');

// ── GET /erp-target ───────────────────────────────────────────────────────────

module.exports._list = async function (req, res) {
    try {
        const list = await $model.listAll();
        return response.success(res, list);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /erp-target/active ────────────────────────────────────────────────────

module.exports._getActive = async function (req, res) {
    try {
        const active = await $model.getActive();
        return response.success(res, active);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /erp-target ──────────────────────────────────────────────────────────
// Body: { name, host, port, db_name, db_user, db_password, is_active?, note? }

module.exports._create = async function (req, res) {
    try {
        const { name, host, port, db_name, db_user, db_password, is_active, note } = req.body;
        if (!name || !host || !db_name || !db_user || !db_password) {
            return response.error(res, 'name, host, db_name, db_user, db_password required', null, 400);
        }
        const userId = res.locals.user.id;
        const erp = await $model.create({ name, host, port, db_name, db_user, db_password, is_active, note }, userId);
        return response.success(res, erp, 'ERP target created');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /erp-target/test ─────────────────────────────────────────────────────
// Body: { host, port, db_name, db_user, db_password }

module.exports._testConnection = async function (req, res) {
    try {
        const { host, port, db_name, db_user, db_password } = req.body;
        if (!host || !db_name || !db_user || !db_password) {
            return response.error(res, 'host, db_name, db_user, db_password required', null, 400);
        }
        const result = await $model.testConnection(host, port, db_name, db_user, db_password);
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── PUT /erp-target/:id ───────────────────────────────────────────────────────
// Body: { name, host, port, db_name, db_user, db_password?, note? }

module.exports._update = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { name, host, port, db_name, db_user, db_password, note } = req.body;
        if (!name || !host || !db_name || !db_user) {
            return response.error(res, 'name, host, db_name, db_user required', null, 400);
        }
        const userId = res.locals.user.id;
        const erp = await $model.update(id, { name, host, port, db_name, db_user, db_password, note }, userId);
        return response.success(res, erp, 'ERP target updated');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── DELETE /erp-target/:id ────────────────────────────────────────────────────

module.exports._delete = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        await $model.delete(id);
        return response.success(res, null, 'ERP target deleted');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /erp-target/:id/activate ────────────────────────────────────────────

module.exports._activate = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const existing = await $model.getById(id);
        if (!existing) return response.error(res, 'not_found', null, 404);
        await $model.setActive(id);
        return response.success(res, { id }, 'ERP target activated');
    } catch (err) {
        return response.error(res, null, err);
    }
};
