const userModel = require('../models/user');
const response  = require('../utils/response');

module.exports._list = async function (req, res) {
    try {
        const users = await userModel.listAll();
        const safe = users.map(function (u) {
            const { password_hash, ...rest } = u;
            return rest;
        });
        return response.success(res, safe);
    } catch (err) {
        return response.error(res, err.message, null, 500);
    }
};

module.exports._create = async function (req, res) {
    try {
        const { username, password, full_name, role } = req.body;
        const result = await userModel.create({ username, password, full_name, role });
        return response.success(res, result, 'User created');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._update = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { full_name, role } = req.body;
        const result = await userModel.update(id, { full_name, role });
        return response.success(res, result, 'Updated');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._resetPassword = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { new_password } = req.body;
        await userModel.resetPassword(id, new_password);
        return response.success(res, { ok: true }, 'Password reset');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._delete = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        await userModel.softDelete(id, res.locals.user.id);
        return response.success(res, { ok: true }, 'Deleted');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};

module.exports._changeOwnPassword = async function (req, res) {
    try {
        const userId = res.locals.user.id;
        const { old_password, new_password } = req.body;
        await userModel.changeOwnPassword(userId, old_password, new_password);
        return response.success(res, { ok: true }, 'Password changed');
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};
