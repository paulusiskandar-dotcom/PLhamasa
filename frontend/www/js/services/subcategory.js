plmApp.factory('subcategoryService', function ($http) {
    return {
        getByCategory: function (catId) {
            return $http.get(api.url + 'subcategory', { params: { cat_id: catId } })
                .then(function (r) { return r.data; });
        },
        getAssignments: function (catId) {
            return $http.get(api.url + 'subcategory/category/' + catId + '/assignments')
                .then(function (r) { return r.data; });
        }
    };
});
