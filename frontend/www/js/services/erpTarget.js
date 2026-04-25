plmApp.factory('erpTargetService', function ($http) {
    return {
        list: function () {
            return $http.get(api.url + 'erp-target')
                .then(function (r) { return r.data; });
        },
        getActive: function () {
            return $http.get(api.url + 'erp-target/active')
                .then(function (r) { return r.data; });
        },
        create: function (data) {
            return $http.post(api.url + 'erp-target', data)
                .then(function (r) { return r.data; });
        },
        update: function (id, data) {
            return $http.put(api.url + 'erp-target/' + id, data)
                .then(function (r) { return r.data; });
        },
        remove: function (id) {
            return $http.delete(api.url + 'erp-target/' + id)
                .then(function (r) { return r.data; });
        },
        activate: function (id) {
            return $http.post(api.url + 'erp-target/' + id + '/activate', {})
                .then(function (r) { return r.data; });
        },
        testConnection: function (data) {
            return $http.post(api.url + 'erp-target/test', data)
                .then(function (r) { return r.data; });
        },
    };
});
