plmApp.factory("$settingsService", function ($http) {
    return {
        get: function () {
            return $http.get(api.url + "settings/extended-categories")
                .then(function (r) { return r.data; });
        },
        save: function (catIds) {
            return $http.post(api.url + "settings/extended-categories", { cat_ids: catIds })
                .then(function (r) { return r.data; });
        }
    };
});
