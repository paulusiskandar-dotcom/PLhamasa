module.exports = function (req, res) {
    res.render("editGrouped", {
        page: {
            title: "Edit Grouped — PLhamasa",
            data: {
                priceListId: parseInt(req.params.id),
                controller: "/js/controller/editGrouped/editGroupedController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/priceList.js",
                    "/js/services/group.js",
                ]
            }
        }
    });
};
