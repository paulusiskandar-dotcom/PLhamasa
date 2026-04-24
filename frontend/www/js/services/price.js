plmApp.factory("$priceService", function ($http) {
    return {
        getPricesInfo: function (ig_ids) {
            return $http.post(api.url + "price/info", { ig_ids: ig_ids })
                .then(function (r) { return r.data; });
        },

        saveDraft: function (ig_id, pr_id, price) {
            return $http.post(api.url + "price/draft/save", { ig_id: ig_id, pr_id: pr_id, price: price })
                .then(function (r) { return r.data; });
        },

        commitDrafts: function () {
            return $http.post(api.url + "price/draft/commit")
                .then(function (r) { return r.data; });
        },

        getDraftChanges: function (since) {
            return $http.get(api.url + "price/draft/changes", { params: { since: since } })
                .then(function (r) { return r.data; });
        },

        // legacy
        savePrices: function (item_prices) {
            return $http.post(api.url + "price/save", { item_prices: item_prices })
                .then(function (r) { return r.data; });
        }
    };
});
