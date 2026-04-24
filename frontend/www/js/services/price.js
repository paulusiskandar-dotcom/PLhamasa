plmApp.factory("$priceService", function ($http) {
    return {
        getPricesInfo: function (ig_ids, cat_id) {
            return $http.post(api.url + "price/info", { ig_ids: ig_ids, cat_id: cat_id || null })
                .then(function (r) { return r.data; });
        },

        getCategoryInfo: function (cat_id) {
            return $http.get(api.url + "price/category-info", { params: { cat_id: cat_id } })
                .then(function (r) { return r.data; });
        },

        autosave: function (ig_id, pr_id, price) {
            return $http.post(api.url + "price/autosave", { ig_id: ig_id, pr_id: pr_id, price: price })
                .then(function (r) { return r.data; });
        },

        saveBatch: function (items) {
            return $http.post(api.url + "price/save", { items: items })
                .then(function (r) { return r.data; });
        }
    };
});
