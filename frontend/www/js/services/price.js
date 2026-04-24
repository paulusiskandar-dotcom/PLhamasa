plmApp.factory("$priceService", function ($http) {
    return {
        getInfo: function (params) {
            return $http.get(api.url + "price/info", { params: params })
                .then(function (r) { return r.data; });
        },

        getCategoryInfo: function (cat_id) {
            return $http.get(api.url + "price/category-info", { params: { cat_id: cat_id } })
                .then(function (r) { return r.data; });
        },

        // Fire-and-forget: caller doesn't need to await
        autoSave: function (igId, prId, newPricePerKg) {
            return $http.post(api.url + "price/autosave", {
                ig_id: igId, pr_id: prId, price: newPricePerKg
            }).then(function (r) { return r.data; });
        },

        saveAll: function (changes) {
            return $http.post(api.url + "price/save", { changes: changes })
                .then(function (r) { return r.data; });
        }
    };
});
