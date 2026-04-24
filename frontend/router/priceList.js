module.exports = function (req, res) {
    res.render("priceList", {
        page: {
            title: "Price List Manager",
            controllerName: "priceListController",
            data: {
                controller: "/js/controller/priceList/priceListController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/item.js",
                    "/js/services/price.js",
                    "/js/services/exportPrice.js",
                    "/js/services/master.js",
                ]
            }
        }
    });
};
