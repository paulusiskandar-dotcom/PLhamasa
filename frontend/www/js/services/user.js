plmApp.factory('userService', function ($http) {
    return {
        list: function () {
            return $http.get(api.url + 'users').then(function (r) { return r.data; });
        },
        create: function (data) {
            return $http.post(api.url + 'users', data).then(function (r) { return r.data; });
        },
        update: function (id, data) {
            return $http.put(api.url + 'users/' + id, data).then(function (r) { return r.data; });
        },
        resetPassword: function (id, newPassword) {
            return $http.post(api.url + 'users/' + id + '/reset-password', {
                new_password: newPassword,
            }).then(function (r) { return r.data; });
        },
        delete: function (id) {
            return $http.delete(api.url + 'users/' + id).then(function (r) { return r.data; });
        },
        changeOwnPassword: function (oldPwd, newPwd) {
            return $http.post(api.url + 'me/change-password', {
                old_password: oldPwd,
                new_password: newPwd,
            }).then(function (r) { return r.data; });
        },
    };
});
