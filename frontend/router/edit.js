module.exports = function (req, res) {
    res.render("edit", {
        page: {
            title: "Edit Price List — PLhamasa",
            data: {
                priceListId: parseInt(req.params.id),
                controller: "/js/controller/edit/editController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/priceList.js",
                    "/js/services/master.js",
                    "/js/services/subcategory.js",
                    "/js/services/erpTarget.js",
                ]
            }
        }
    });
};
