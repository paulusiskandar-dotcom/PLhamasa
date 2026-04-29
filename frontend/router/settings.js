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
                    "/js/services/pdfTemplate.js",
                    "/js/services/blacklist.js",
                    "/js/services/priceList.js",
                    "/js/services/group.js",
                ]
            }
        }
    });
};
