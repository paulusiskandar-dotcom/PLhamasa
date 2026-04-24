plmApp.factory("$exportService", function ($http) {

    function downloadBlob(data, filename) {
        var blob = new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        var url = window.URL.createObjectURL(blob);
        var a   = document.createElement("a");
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    }

    return {
        exportERP: function (payload) {
            return $http.post(api.url + "export/erp", payload, { responseType: "arraybuffer" })
                .then(function (r) {
                    var filename = "PriceList_ERP_" + Date.now() + ".xlsx";
                    downloadBlob(r.data, filename);
                    return true;
                });
        },

        exportManual: function (payload) {
            return $http.post(api.url + "export/manual", payload, { responseType: "arraybuffer" })
                .then(function (r) {
                    var filename = "PriceList_Manual_" + Date.now() + ".xlsx";
                    downloadBlob(r.data, filename);
                    return true;
                });
        },

        exportTemplatePerKilo: function (params) {
            return $http.post(api.url + "export/template-per-kilo", params, { responseType: "arraybuffer" })
                .then(function (r) {
                    var filename = "Template_PerKilo_" + Date.now() + ".xlsx";
                    downloadBlob(r.data, filename);
                    return true;
                });
        }
    };
});
