plmApp.factory('blacklistService', function ($http) {
    var base = api.url + 'blacklist';
    return {
        list: function () {
            return $http.get(base).then(function (r) { return r.data; });
        },
        itemsForCategory: function (catId, search) {
            var url = base + '/items?cat_id=' + encodeURIComponent(catId);
            if (search) url += '&q=' + encodeURIComponent(search);
            return $http.get(url).then(function (r) { return r.data; });
        },
        add: function (igIds, reason) {
            return $http.post(base, { ig_ids: igIds, reason: reason })
                .then(function (r) { return r.data; });
        },
        remove: function (igId) {
            return $http.delete(base + '/' + igId).then(function (r) { return r.data; });
        },
    };
});
