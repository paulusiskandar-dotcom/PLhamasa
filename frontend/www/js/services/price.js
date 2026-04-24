plmApp.factory("$priceService", function ($http) {
    return {
        getPricesInfo: function (ig_ids) {
            return $http.post(api.url + "price/info", { ig_ids: ig_ids })
                .then(function (r) { return r.data; });
        },
        savePrices: function (item_prices) {
            return $http.post(api.url + "price/save", { item_prices: item_prices })
                .then(function (r) { return r.data; });
        }
    };
});
