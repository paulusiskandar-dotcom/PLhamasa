module.exports = function (req, res, next) {
    const token = req.cookies && req.cookies.accessToken;
    if (!token) {
        return res.redirect("/login");
    }
    next();
};
