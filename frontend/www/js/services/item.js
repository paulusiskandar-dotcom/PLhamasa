plmApp.factory("$itemService", function ($http) {
    return {
        getAll: function (params) {
            return $http.get(api.url + "items", { params: params })
                .then(function (r) { return r.data; });
        }
    };
});
