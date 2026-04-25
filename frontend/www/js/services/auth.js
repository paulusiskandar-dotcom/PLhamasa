// ── Auth Service ──────────────────────────────────────────────
plmApp.factory("$authService", function ($http) {
    return {
        login: function (credentials) {
            return $http.post(api.url + "auth/login", credentials)
                .then(function (r) { return r.data; });
        },
        logout: function () {
            return $http.post(api.url + "auth/logout")
                .then(function (r) { return r.data; });
        }
    };
});

// ── Login Controller ──────────────────────────────────────────
plmApp.controller("loginController", function ($scope, $authService) {
    $scope.credentials = { username: "", password: "" };
    $scope.loading = false;
    $scope.toast   = { show: false, message: "", type: "" };

    function showToast(msg, type) {
        $scope.toast = { show: true, message: msg, type: type };
        setTimeout(function () {
            $scope.$apply(function () { $scope.toast.show = false; });
        }, 3000);
    }

    $scope.login = function () {
        if (!$scope.credentials.username || !$scope.credentials.password) {
            showToast("Username dan password wajib diisi", "warning");
            return;
        }

        $scope.loading = true;

        $authService.login($scope.credentials).then(function (res) {
            localStorage.setItem("accessToken", res.result.accessToken);
            localStorage.setItem("userInfo", JSON.stringify(res.result.user || {}));
            document.cookie = "accessToken=" + res.result.accessToken + "; path=/";
            window.location.href = "/price-list";
        }).catch(function () {
            showToast("Username atau password salah", "danger");
            $scope.loading = false;
        });
    };
});
