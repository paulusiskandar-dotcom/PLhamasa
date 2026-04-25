plmApp.factory("$masterService", function ($http) {
    return {
        getCategories: function () {
            return $http.get(api.url + "master/categories")
                .then(function (r) { return r.data; });
        },
        getBrands: function () {
            return $http.get(api.url + "master/brands")
                .then(function (r) { return r.data; });
        },
        getGrades: function () {
            return $http.get(api.url + "master/grades")
                .then(function (r) { return r.data; });
        },
        getItems: function (catId) {
            return $http.get(api.url + 'items', { params: { cat_id: catId } })
                .then(function (r) { return r.data; });
        },
    };
});
