module.exports = function (req, res) {
    res.render("settings", {
        page: {
            title: "Settings — Price List Manager",
            data: {
                services:   ["/js/services/settings.js"],
                controller: "/js/controller/settings/settingsController.js",
            }
        }
    });
};
