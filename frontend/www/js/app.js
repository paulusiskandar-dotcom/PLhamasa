var plmApp = angular.module("plmApp", []);

plmApp.config(function ($httpProvider) {
    $httpProvider.interceptors.push(function ($q) {
        return {
            request: function (config) {
                var token = localStorage.getItem("accessToken");
                if (token) {
                    if (config.params === undefined) config.params = {};
                    config.params.accessToken = token;
                }
                return config;
            },
            responseError: function (rejection) {
                if (rejection.status === 401) {
                    localStorage.removeItem("accessToken");
                    localStorage.removeItem("userInfo");
                    window.location.href = "/login";
                }
                return $q.reject(rejection);
            }
        };
    });
});

plmApp.filter("plmDate", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).format("DD MMM YY");
    };
});

plmApp.filter("plmDateTime", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).format("DD MMM YY HH:mm");
    };
});

plmApp.filter("thousand", function () {
    return function (input) {
        if (input === null || input === undefined || input === '') return '';
        var n = parseInt(String(input).replace(/[^\d-]/g, ''), 10);
        if (isNaN(n)) return '';
        return n.toLocaleString('id-ID');
    };
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

plmApp.filter("padNumber", function () {
    return function (val, len) {
        if (val === null || val === undefined) return "";
        var s = String(val);
        var pad = len || 3;
        while (s.length < pad) s = "0" + s;
        return s;
    };
});

plmApp.filter("dateFormat", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).format("DD MMM YYYY");
    };
});

plmApp.filter("timeFormat", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).format("HH:mm");
    };
});

plmApp.filter("dateTimeFormat", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).format("DD MMM YYYY HH:mm");
    };
});

plmApp.filter("timeAgo", function () {
    return function (val) {
        if (!val) return "-";
        return moment(val).fromNow();
    };
});
