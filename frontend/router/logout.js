module.exports = function (req, res) {
    res.clearCookie("accessToken");
    res.redirect("/login");
};
