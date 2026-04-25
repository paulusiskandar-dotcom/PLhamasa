plmApp.factory('priceListService', function ($http) {
    var base = api.url + 'price-list';
    return {
        list: function (catId) {
            var params = catId ? { cat_id: catId } : {};
            return $http.get(base, { params: params }).then(function (r) { return r.data; });
        },
        get: function (id) {
            return $http.get(base + '/' + id).then(function (r) { return r.data; });
        },
        start: function (catId) {
            return $http.post(api.url + 'price-list/start', { cat_id: catId }).then(function (r) { return r.data; });
        },
        lock: function (id) {
            return $http.post(base + '/' + id + '/lock', {}).then(function (r) { return r.data; });
        },
        heartbeat: function (id) {
            return $http.post(base + '/' + id + '/heartbeat', {}).then(function (r) { return r.data; });
        },
        releaseLock: function (id) {
            return $http.post(base + '/' + id + '/release-lock', {}).then(function (r) { return r.data; });
        },
        takeOver: function (id) {
            return $http.post(base + '/' + id + '/take-over', {}).then(function (r) { return r.data; });
        },
        updateItem: function (id, igId, prId, newPrice) {
            return $http.put(base + '/' + id + '/item', { ig_id: igId, pr_id: prId, new_price: newPrice }).then(function (r) { return r.data; });
        },
        bulkUpdate: function (id, items) {
            return $http.put(base + '/' + id + '/items/bulk', { items: items }).then(function (r) { return r.data; });
        },
        getLog: function (id, limit, offset) {
            return $http.get(base + '/' + id + '/log', { params: { limit: limit || 50, offset: offset || 0 } }).then(function (r) { return r.data; });
        },
        postToErp: function (id) {
            return $http.post(base + '/' + id + '/post-to-erp', { confirm: true }).then(function (r) { return r.data; });
        },
    };
});
