plmApp.factory('itemDimensionsService', function ($http) {
    return {
        getTebalMap: function (priceListId) {
            return $http.get(api.url + 'price-list/' + priceListId + '/tebal-map')
                .then(function (r) { return r.data; });
        },
        updateTebal: function (igId, tebal) {
            return $http.put(api.url + 'item/' + igId + '/tebal', { tebal: tebal })
                .then(function (r) { return r.data; });
        },
        listCategoryStats: function () {
            return $http.get(api.url + 'item-dimensions/categories-stats')
                .then(function (r) { return r.data; });
        },
        reparseCategory: function (catId) {
            return $http.post(api.url + 'item-dimensions/reparse', { cat_id: catId })
                .then(function (r) { return r.data; });
        },
        getCategoryConfig: function (catId) {
            return $http.get(api.url + 'item-dimensions/category/' + catId)
                .then(function (r) { return r.data; });
        },
        setRequireTebal: function (catId, catName, requireTebal) {
            return $http.post(api.url + 'item-dimensions/require-tebal', {
                cat_id: catId,
                cat_name: catName,
                require_tebal: requireTebal
            }).then(function (r) { return r.data; });
        },
    };
});
