module.exports = function (req, res) {
    if (req.cookies && req.cookies.accessToken) {
        return res.redirect("/price-list");
    }
    res.render("login", {
        page: { title: "Login — Price List Manager" }
    });
};
