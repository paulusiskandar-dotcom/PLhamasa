plmApp.factory('groupService', function ($http) {
    var base = api.url + 'price-list';
    return {
        listConfigs: function () {
            return $http.get(api.url + 'group/category-config').then(function (r) { return r.data; });
        },
        enable: function (catId, catName) {
            return $http.post(api.url + 'group/enable', { cat_id: catId, cat_name: catName }).then(function (r) { return r.data; });
        },
        disable: function (catId) {
            return $http.delete(api.url + 'group/disable/' + catId).then(function (r) { return r.data; });
        },
        previewInit: function (plId) {
            return $http.get(base + '/' + plId + '/group/preview-init').then(function (r) { return r.data; });
        },
        applyInit: function (plId) {
            return $http.post(base + '/' + plId + '/group/init', {}).then(function (r) { return r.data; });
        },
        getGroups: function (plId) {
            return $http.get(base + '/' + plId + '/group').then(function (r) { return r.data; });
        },
        moveItem: function (plId, igId, fromGroupId, toGroupId) {
            return $http.post(base + '/' + plId + '/group/move-item', {
                ig_id: igId, from_group_id: fromGroupId, to_group_id: toGroupId
            }).then(function (r) { return r.data; });
        },
        createGroup: function (plId, thicknessValue) {
            return $http.post(base + '/' + plId + '/group/create', {
                thickness_value: thicknessValue
            }).then(function (r) { return r.data; });
        },
    };
});
