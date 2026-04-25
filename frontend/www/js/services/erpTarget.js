plmApp.factory('erpTargetService', function ($http) {
    return {
        getActive: function () {
            return $http.get(api.url + 'erp-target/active')
                .then(function (r) { return r.data; });
        }
    };
});
