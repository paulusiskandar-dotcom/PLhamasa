plmApp.factory("$exportService", function ($http) {

    function downloadBlob(data, filename) {
        var blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
                    downloadBlob(r.data, "PriceList_ERP_" + Date.now() + ".xlsx");
                    return true;
                });
        },

        exportManual: function (payload) {
            return $http.post(api.url + "export/manual", payload, { responseType: "arraybuffer" })
                .then(function (r) {
                    downloadBlob(r.data, "PriceList_Manual_" + Date.now() + ".xlsx");
                    return true;
                });
        },

        exportTemplatePerKilo: function (params) {
            return $http.post(api.url + "export/template-per-kilo", params, { responseType: "arraybuffer" })
                .then(function (r) {
                    downloadBlob(r.data, "Template_PerKilo_" + Date.now() + ".xlsx");
                    return true;
                });
        },

        getHistory: function (cat_id, limit, offset) {
            return $http.get(api.url + "export/history", {
                params: { cat_id: cat_id || "", limit: limit || 20, offset: offset || 0 }
            }).then(function (r) { return r.data; });
        },

        downloadHistory: function (id) {
            window.open(api.url + "export/history/" + id + "/download?accessToken=" + (localStorage.getItem("accessToken") || ""), "_blank");
        }
    };
});
