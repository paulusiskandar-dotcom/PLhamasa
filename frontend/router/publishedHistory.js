module.exports = function (req, res) {
    res.render("publishedHistory", {
        page: {
            title: "Published History — PLhamasa",
            data: {
                controller: "/js/controller/publishedHistory/listController.js",
                services: [
                    "/js/services/auth.js",
                    "/js/services/pdfTemplate.js",
                ]
            }
        }
    });
};
