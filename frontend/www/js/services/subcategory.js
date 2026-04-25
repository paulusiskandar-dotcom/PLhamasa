plmApp.factory('subcategoryService', function ($http) {
    return {
        getByCategory: function (catId) {
            return $http.get(api.url + 'subcategory', { params: { cat_id: catId } })
                .then(function (r) { return r.data; });
        },
        getAssignments: function (catId) {
            return $http.get(api.url + 'subcategory/category/' + catId + '/assignments')
                .then(function (r) { return r.data; });
        },
        create: function (catId, name) {
            return $http.post(api.url + 'subcategory', { cat_id: catId, name: name })
                .then(function (r) { return r.data; });
        },
        update: function (id, name) {
            return $http.put(api.url + 'subcategory/' + id, { name: name })
                .then(function (r) { return r.data; });
        },
        remove: function (id) {
            return $http.delete(api.url + 'subcategory/' + id)
                .then(function (r) { return r.data; });
        },
        assignItems: function (id, igIds) {
            return $http.post(api.url + 'subcategory/' + id + '/items', { ig_ids: igIds })
                .then(function (r) { return r.data; });
        },
    };
});
