const response = require('../utils/response');

module.exports = function (req, res, next) {
    if (!res.locals.user || res.locals.user.role !== 'superadmin') {
        return response.error(res, 'Forbidden — superadmin only', null, 403);
    }
    next();
};
