module.exports = function (req, res) {
    res.render("settings", {
        page: {
            title: "Settings — PLhamasa",
            data: {
                controller: "/js/controller/settings/settingsController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/master.js",
                    "/js/services/subcategory.js",
                    "/js/services/erpTarget.js",
                ]
            }
        }
    });
};
