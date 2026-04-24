module.exports = function (req, res) {
    if (req.cookies && req.cookies.accessToken) {
        return res.redirect("/price-list");
    }
    res.render("login", {
        page: {
            title: "Login — Price List Manager",
            data: {
                services:   ["/js/services/auth.js"],
                controller: null,
            }
        }
    });
};
