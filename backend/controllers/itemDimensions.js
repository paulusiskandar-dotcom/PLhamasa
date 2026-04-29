const service  = require('../services/itemDimensionsService');
const response = require('../utils/response');

module.exports._getTebalMap = async function (req, res) {
    try {
        const plId = parseInt(req.params.id, 10);
        if (isNaN(plId)) return response.error(res, 'invalid_id', null, 400);
        const result = await service.getTebalMap(plId);
        return response.success(res, result);
    } catch (err) {
        return response.error(res, err.message, null, 500);
    }
};

module.exports._updateTebal = async function (req, res) {
    try {
        const igId = parseInt(req.params.ig_id, 10);
        if (isNaN(igId)) return response.error(res, 'invalid_ig_id', null, 400);
        var tebal = req.body.tebal;
        var tebalNum = (tebal === null || tebal === '' || tebal === undefined)
            ? null
            : parseFloat(tebal);
        if (tebalNum !== null && isNaN(tebalNum)) {
            return response.error(res, 'tebal tidak valid', null, 400);
        }
        await service.updateTebal(igId, tebalNum, res.locals.user.id);
        return response.success(res, { ok: true });
    } catch (err) {
        return response.error(res, err.message, null, 400);
    }
};
