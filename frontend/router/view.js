module.exports = function (req, res) {
    res.render('view', {
        page: {
            title: 'View Price List — PLhamasa',
            data: {
                priceListId: parseInt(req.params.id),
                controller: '/js/controller/view/viewController.js',
                services: [
                    '/js/services/auth.js',
                    '/js/services/priceList.js',
                    '/js/services/pdfTemplate.js',
                ],
            },
        },
    });
};
