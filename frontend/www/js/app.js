var plmApp = angular.module("plmApp", []);

plmApp.config(function ($httpProvider) {
    // Attach accessToken ke semua request
    $httpProvider.interceptors.push(function () {
        return {
            request: function (config) {
                // accessToken disimpan di cookie atau localStorage
                var token = localStorage.getItem("accessToken");
                if (token) {
                    if (config.params === undefined) config.params = {};
                    config.params.accessToken = token;
                }
                return config;
            }
        };
    });
});

plmApp.filter("number", function () {
    return function (input, decimals) {
        if (input === null || input === undefined || input === "") return "-";
        var n = parseFloat(input);
        if (isNaN(n)) return input;
        return n.toLocaleString("id-ID", {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals || 0
        });
    };
});
