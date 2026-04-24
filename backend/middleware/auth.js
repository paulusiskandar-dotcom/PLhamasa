const jwt = require("jsonwebtoken");
const response = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET || "price_list_secret";

module.exports.verifyToken = function (req, res, next) {
    const token = req.query.accessToken || req.headers["x-access-token"] || req.body.accessToken;

    if (!token) {
        return response.error(res, "unauthorized", null, 401);
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.locals.user = decoded;
        next();
    } catch (err) {
        return response.error(res, "token_invalid", null, 401);
    }
};
