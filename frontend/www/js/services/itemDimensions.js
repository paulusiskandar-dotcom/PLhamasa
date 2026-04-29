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
    };
});
