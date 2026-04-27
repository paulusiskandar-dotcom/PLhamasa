module.exports = function (req, res) {
    res.render("priceList", {
        page: {
            title: "Price List — PLhamasa",
            data: {
                controller: "/js/controller/priceList/listController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/priceList.js",
                    "/js/services/master.js",
                    "/js/services/pdfTemplate.js",
                ]
            }
        }
    });
};
