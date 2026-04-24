plmApp.controller("priceListController", function ($scope, $itemService, $priceService, $exportService) {

    // ── Init ───────────────────────────────────────────────────────────────────
    function init() {
        $scope.modifierOptions = [
            { id: "plus_nominal",  label: "+ Rp"  },
            { id: "minus_nominal", label: "- Rp"  },
            { id: "plus_percent",  label: "+ %"   },
            { id: "minus_percent", label: "- %"   },
        ];

        $scope.groupOptions = [
            { id: null, label: "Semua Golongan" },
            { id: "U",  label: "Umum"           },
            { id: "N",  label: "Non Standar"    },
        ];

        $scope.modifier = {
            selected: $scope.modifierOptions[0],
            value: null
        };

        $scope.filter = {
            category_name:    "",
            brand_name:       "",
            grade_id:         "",
            group:            $scope.groupOptions[0],
            item_search_name: null,
        };

        $scope.items              = null;
        $scope.headerChecked      = { all: false, cash: false, credit: false };
        $scope.toast              = { show: false, message: "", type: "" };
        $scope.isExportingTemplate = false;
    }

    init();

    // ── Toast ──────────────────────────────────────────────────────────────────
    function showToast(message, type) {
        $scope.toast = { show: true, message: message, type: type || "info" };
        setTimeout(function () {
            $scope.$apply(function () { $scope.toast.show = false; });
        }, 3500);
    }

    // ── Price Calculator ───────────────────────────────────────────────────────
    function calcNewPrice(oldPrice, modType, modValue) {
        var old = parseFloat(oldPrice) || 0;
        var mod = parseFloat(modValue) || 0;
        var result;
        switch (modType) {
            case "plus_nominal":  result = old + mod;                          break;
            case "minus_nominal": result = Math.max(0, old - mod);             break;
            case "plus_percent":  result = old + (mod / 100 * old);            break;
            case "minus_percent": result = Math.max(0, old - (mod / 100 * old)); break;
            default: return null;
        }
        return Math.round(result);
    }

    // ── Search ─────────────────────────────────────────────────────────────────
    $scope.search = function () {
        $scope.headerChecked = { all: false, cash: false, credit: false };

        if (!$scope.filter.category_name && !$scope.filter.item_search_name) {
            showToast("Isi Kategori atau Nama Barang terlebih dahulu", "warning");
            return;
        }

        var query = {
            category_name: $scope.filter.category_name || null,
            brand_name:    $scope.filter.brand_name    || null,
            grade_id:      $scope.filter.grade_id      || null,
            group_id:      $scope.filter.group ? $scope.filter.group.id : null,
            item_name:     $scope.filter.item_search_name || null,
        };

        $itemService.getAll(query).then(function (res) {
            var itemsFromApi = res.result;
            if (!itemsFromApi || itemsFromApi.length === 0) {
                $scope.items = [];
                showToast("Tidak ada barang ditemukan", "info");
                return;
            }

            var ig_ids = itemsFromApi.map(function (i) { return i.ig_id; });

            $priceService.getPricesInfo(ig_ids).then(function (pricesRes) {
                var priceMap = {};
                (pricesRes.result || []).forEach(function (p) {
                    priceMap[p.ig_id] = p;
                });

                $scope.items = itemsFromApi.map(function (item) {
                    var p = priceMap[item.ig_id] || {};
                    return {
                        ig_id:             item.ig_id,
                        id:                item.id,
                        name:              item.name,
                        weight:            item.weight,
                        lastUpdate:        p.last_update ? moment(p.last_update).format("DD-MM-YYYY") : "-",
                        hargaCashSebelum:  p.price_cash   ? parseFloat(p.price_cash)   : null,
                        hargaCreditSebelum:p.price_credit ? parseFloat(p.price_credit) : null,
                        hargaCashSesudah:  null,
                        hargaCreditSesudah:null,
                        checkedCash:       false,
                        checkedCredit:     false,
                        checkedAll:        false,
                    };
                });
            }).catch(function () {
                showToast("Gagal mengambil data harga", "danger");
            });

        }).catch(function () {
            showToast("Gagal mengambil data barang", "danger");
        });
    };

    // ── Checkbox Helpers ───────────────────────────────────────────────────────
    $scope.toggleAll = function (type) {
        var checked = $scope.headerChecked[type];
        if (type === "all") {
            $scope.headerChecked.cash   = checked;
            $scope.headerChecked.credit = checked;
        }
        ($scope.items || []).forEach(function (item) {
            if (type === "all") {
                item.checkedAll    = checked;
                item.checkedCash   = checked;
                item.checkedCredit = checked;
            } else {
                item["checked" + type.charAt(0).toUpperCase() + type.slice(1)] = checked;
                $scope.updateItemAllCheckbox(item, true);
            }
        });
        if (type !== "all") $scope.updateHeaderCheckbox("all");
    };

    $scope.updateHeaderCheckbox = function (type) {
        if (!$scope.items || !$scope.items.length) {
            $scope.headerChecked[type] = false;
            return;
        }
        var prop = "checked" + type.charAt(0).toUpperCase() + type.slice(1);
        $scope.headerChecked[type] = $scope.items.every(function (i) { return i[prop]; });
    };

    $scope.updateItemAllCheckbox = function (item, skipHeader) {
        item.checkedAll = item.checkedCash && item.checkedCredit;
        if (!skipHeader) {
            $scope.updateHeaderCheckbox("cash");
            $scope.updateHeaderCheckbox("credit");
            $scope.updateHeaderCheckbox("all");
        }
    };

    $scope.toggleItem = function (item) {
        item.checkedCash   = item.checkedAll;
        item.checkedCredit = item.checkedAll;
        $scope.updateHeaderCheckbox("cash");
        $scope.updateHeaderCheckbox("credit");
        $scope.updateHeaderCheckbox("all");
    };

    // ── Generate Harga Baru ────────────────────────────────────────────────────
    $scope.generateNewPrice = function () {
        if (!$scope.modifier.value && $scope.modifier.value !== 0) {
            showToast("Masukkan nilai pengubah terlebih dahulu", "warning");
            return;
        }

        var anySelected = ($scope.items || []).some(function (i) {
            return i.checkedCash || i.checkedCredit;
        });

        if (!anySelected) {
            showToast("Pilih minimal satu barang terlebih dahulu", "warning");
            return;
        }

        var modType  = $scope.modifier.selected.id;
        var modValue = parseFloat($scope.modifier.value);

        ($scope.items || []).forEach(function (item) {
            if (item.checkedCash) {
                item.hargaCashSesudah = calcNewPrice(item.hargaCashSebelum, modType, modValue);
            }
            if (item.checkedCredit) {
                item.hargaCreditSesudah = calcNewPrice(item.hargaCreditSebelum, modType, modValue);
            }
        });

        showToast("Harga baru berhasil digenerate", "success");
    };

    // ── Check if any price changed ─────────────────────────────────────────────
    $scope.hasChanges = function () {
        return ($scope.items || []).some(function (i) {
            return i.hargaCashSesudah || i.hargaCreditSesudah;
        });
    };

    // ── Build payload for export/save ──────────────────────────────────────────
    function buildPricePayload() {
        var item_prices = [];
        ($scope.items || []).forEach(function (item) {
            if (item.checkedCash && item.hargaCashSesudah) {
                item_prices.push({
                    ig_id:     item.ig_id,
                    pr_id:     2,
                    old_price: item.hargaCashSebelum || 0,
                    new_price: item.hargaCashSesudah,
                });
            }
            if (item.checkedCredit && item.hargaCreditSesudah) {
                item_prices.push({
                    ig_id:     item.ig_id,
                    pr_id:     4,
                    old_price: item.hargaCreditSebelum || 0,
                    new_price: item.hargaCreditSesudah,
                });
            }
        });
        return item_prices;
    }

    // ── Export ERP Only ────────────────────────────────────────────────────────
    $scope.exportOnly = function () {
        var item_prices = buildPricePayload();
        if (!item_prices.length) {
            showToast("Tidak ada harga yang diubah", "info");
            return;
        }

        showToast("Menyiapkan export ERP...", "info");

        $exportService.exportERP({ item_prices: item_prices }).then(function () {
            showToast("Export ERP berhasil didownload", "success");
        }).catch(function () {
            showToast("Gagal export ERP", "danger");
        });
    };

    // ── Export Manual ──────────────────────────────────────────────────────────
    $scope.exportManual = function () {
        var item_prices = buildPricePayload();
        if (!item_prices.length) {
            showToast("Tidak ada harga yang diubah", "info");
            return;
        }

        showToast("Menyiapkan export Manual...", "info");

        $exportService.exportManual({ item_prices: item_prices }).then(function () {
            showToast("Export Manual berhasil didownload", "success");
        }).catch(function () {
            showToast("Gagal export Manual", "danger");
        });
    };

    // ── Simpan & Export ERP ────────────────────────────────────────────────────
    $scope.saveAndExport = function () {
        var item_prices = buildPricePayload();
        if (!item_prices.length) {
            showToast("Tidak ada harga yang diubah", "info");
            return;
        }

        showToast("Menyimpan harga...", "info");

        $priceService.savePrices(item_prices).then(function () {
            showToast("Harga tersimpan, menyiapkan export...", "info");
            return $exportService.exportERP({ item_prices: item_prices });
        }).then(function () {
            showToast("Harga disimpan & export ERP berhasil!", "success");
            $scope.search();  // reload fresh data
        }).catch(function () {
            showToast("Gagal menyimpan atau export", "danger");
        });
    };

    // ── Export Template Per Kilo ───────────────────────────────────────────────
    $scope.exportTemplatePerKilo = function () {
        if ($scope.isExportingTemplate) return;
        $scope.isExportingTemplate = true;
        showToast("Menyiapkan template...", "info");

        var query = {
            category_name: $scope.filter.category_name || null,
            brand_name:    $scope.filter.brand_name    || null,
            grade_id:      $scope.filter.grade_id      || null,
            group_id:      $scope.filter.group ? $scope.filter.group.id : null,
            item_name:     $scope.filter.item_search_name || null,
        };

        $exportService.exportTemplatePerKilo(query).then(function () {
            showToast("Template berhasil didownload", "success");
        }).catch(function (err) {
            // Try to parse arraybuffer error response
            if (err.data) {
                try {
                    var text = String.fromCharCode.apply(null, new Uint8Array(err.data));
                    var obj  = JSON.parse(text);
                    showToast(obj.message || "Gagal mendownload template", "danger");
                } catch (e) {
                    showToast("Gagal mendownload template", "danger");
                }
            } else {
                showToast("Gagal mendownload template", "danger");
            }
        }).finally(function () {
            $scope.$apply(function () { $scope.isExportingTemplate = false; });
        });
    };

    // ── Import Template Per Kilo ───────────────────────────────────────────────
    $scope.handleFileSelect = function (files) {
        if (!files || !files.length) return;

        var formData = new FormData();
        formData.append("file", files[0]);

        // POST ke backend import endpoint
        $http.post(api.url + "export/import-per-kilo", formData, {
            headers: { "Content-Type": undefined }
        }).then(function (r) {
            var imported = r.data.result;
            if (!imported || !imported.length) {
                showToast("Tidak ada data yang bisa diimpor", "info");
                return;
            }

            var ig_ids = imported.map(function (i) { return i.ig_id; });

            $priceService.getPricesInfo(ig_ids).then(function (pricesRes) {
                var priceMap = {};
                (pricesRes.result || []).forEach(function (p) {
                    priceMap[p.ig_id] = p;
                });

                $scope.items = imported.map(function (item) {
                    var p = priceMap[item.ig_id] || {};
                    return {
                        ig_id:             item.ig_id,
                        id:                item.id,
                        name:              item.name,
                        weight:            item.weight,
                        lastUpdate:        p.last_update ? moment(p.last_update).format("DD-MM-YYYY") : "-",
                        hargaCashSebelum:  p.price_cash   ? parseFloat(p.price_cash)   : null,
                        hargaCreditSebelum:p.price_credit ? parseFloat(p.price_credit) : null,
                        hargaCashSesudah:  item.hargaCashSesudah   || null,
                        hargaCreditSesudah:item.hargaCreditSesudah || null,
                        checkedCash:       item.hargaCashSesudah   != null,
                        checkedCredit:     item.hargaCreditSesudah != null,
                        checkedAll:        item.hargaCashSesudah != null && item.hargaCreditSesudah != null,
                    };
                });

                $scope.updateHeaderCheckbox("cash");
                $scope.updateHeaderCheckbox("credit");
                $scope.updateHeaderCheckbox("all");

                showToast("File berhasil diimpor. Silakan simpan & export", "success");
            });
        }).catch(function () {
            showToast("Gagal mengimpor file", "danger");
        });

        // Reset input file
        document.getElementById("import-file").value = "";
    };
});
