plmApp.controller("priceListController", function (
    $scope, $http, $interval, $timeout,
    $itemService, $priceService, $exportService, $masterService
) {
    var pollInterval = null;
    var lastPollTime = new Date().toISOString();

    // ── Helpers ───────────────────────────────────────────────────────────────
    function round100(raw) {
        var r = raw % 100;
        return r <= 10 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
    }

    function calcNewKg(oldKg, modType, modValue) {
        var old = parseFloat(oldKg) || 0;
        var mod = parseFloat(modValue) || 0;
        switch (modType) {
            case "plus_nominal":  return Math.max(0, Math.round(old + mod));
            case "minus_nominal": return Math.max(0, Math.round(old - mod));
            case "plus_percent":  return Math.max(0, Math.round(old + mod / 100 * old));
            case "minus_percent": return Math.max(0, Math.round(old - mod / 100 * old));
            default: return old;
        }
    }

    function getUserId() {
        try {
            var token = localStorage.getItem("accessToken");
            if (!token) return null;
            return JSON.parse(atob(token.split(".")[1])).id;
        } catch (e) { return null; }
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        $scope.modifierOptions = [
            { id: "plus_nominal",  label: "+ Rp" },
            { id: "minus_nominal", label: "- Rp" },
            { id: "plus_percent",  label: "+ %"  },
            { id: "minus_percent", label: "- %"  },
        ];
        $scope.groupOptions = [
            { id: null, label: "Semua Golongan" },
            { id: "U",  label: "Umum"           },
            { id: "N",  label: "Non Standar"    },
        ];
        $scope.modifier = {
            selected: $scope.modifierOptions[2], // default + %
            target:   "both",
            value:    null,
        };
        $scope.filter = {
            category:         null,
            brand:            null,
            grade:            null,
            group:            $scope.groupOptions[0],
            item_search_name: null,
        };
        $scope.categories = [];
        $scope.brands     = [];
        $scope.grades     = [];
        loadMasterData();

        $scope.items              = null;
        $scope.headerChecked      = false;
        $scope.hasGenerated       = false;
        $scope.saveState          = "idle"; // idle | saving | saved
        $scope.toast              = { show: false, message: "", type: "" };
        $scope.isExportingTemplate = false;
        $scope.sidebarHidden = localStorage.getItem("plm.sidebarHidden") === "true";
    }

    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem("plm.sidebarHidden", $scope.sidebarHidden);
    };

    init();
    startPolling();
    $scope.$on("$destroy", function () { if (pollInterval) $interval.cancel(pollInterval); });

    // ── Master Data ───────────────────────────────────────────────────────────
    function loadMasterData() {
        $masterService.getCategories().then(function (r) { $scope.categories = r.result || []; });
        $masterService.getBrands().then(function (r) { $scope.brands = r.result || []; });
        $masterService.getGrades().then(function (r) { $scope.grades = r.result || []; });
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(message, type) {
        $scope.toast = { show: true, message: message, type: type || "info" };
        $timeout(function () { $scope.toast.show = false; }, 3500);
    }

    // ── Search ────────────────────────────────────────────────────────────────
    $scope.search = function () {
        $scope.hasGenerated  = false;
        $scope.saveState     = "idle";
        $scope.headerChecked = false;

        if (!$scope.filter.category && !$scope.filter.item_search_name) {
            showToast("Pilih Kategori atau isi Nama Barang terlebih dahulu", "warning");
            return;
        }

        $itemService.getAll({
            cat_id:    $scope.filter.category ? $scope.filter.category.id : null,
            brand_id:  $scope.filter.brand    ? $scope.filter.brand.id    : null,
            grade_id:  $scope.filter.grade    ? $scope.filter.grade.id    : null,
            group_id:  $scope.filter.group    ? $scope.filter.group.id    : null,
            item_name: $scope.filter.item_search_name || null,
        }).then(function (res) {
            var itemsFromApi = res.result;
            if (!itemsFromApi || itemsFromApi.length === 0) {
                $scope.items = [];
                showToast("Tidak ada barang ditemukan", "info");
                return;
            }

            var ig_ids = itemsFromApi.map(function (i) { return i.ig_id; });

            $priceService.getPricesInfo(ig_ids).then(function (pricesRes) {
                var priceMap = {};
                (pricesRes.result || []).forEach(function (p) { priceMap[p.ig_id] = p; });

                $scope.items = itemsFromApi.map(function (item) {
                    var p = priceMap[item.ig_id] || {};
                    return {
                        ig_id:        item.ig_id,
                        name:         item.name,
                        weight:       item.weight,
                        cashKgLama:   p.price_cash   != null ? parseFloat(p.price_cash)   : null,
                        kreditKgLama: p.price_credit != null ? parseFloat(p.price_credit) : null,
                        cashKgBaru:   null,
                        kreditKgBaru: null,
                        cashLbr:      null,
                        kreditLbr:    null,
                        lastUpdate:   p.last_update ? moment(p.last_update).format("DD-MM-YYYY") : "-",
                        checked:      false,
                        justEdited:   false,
                    };
                });

                lastPollTime = new Date().toISOString();
            }).catch(function () {
                showToast("Gagal mengambil data harga", "danger");
            });

        }).catch(function () {
            showToast("Gagal mengambil data barang", "danger");
        });
    };

    // ── Checkbox ──────────────────────────────────────────────────────────────
    $scope.toggleAll = function () {
        var checked = $scope.headerChecked;
        ($scope.items || []).forEach(function (item) { item.checked = checked; });
    };

    $scope.updateHeaderCheckbox = function () {
        var items = $scope.items || [];
        $scope.headerChecked = items.length > 0 && items.every(function (i) { return i.checked; });
    };

    // ── Generate Harga Baru ───────────────────────────────────────────────────
    $scope.generatePrices = function () {
        if (!$scope.modifier.value && $scope.modifier.value !== 0) {
            showToast("Masukkan nilai pengubah terlebih dahulu", "warning");
            return;
        }
        var anySelected = ($scope.items || []).some(function (i) { return i.checked; });
        if (!anySelected) {
            showToast("Pilih minimal satu barang terlebih dahulu", "warning");
            return;
        }

        var modType  = $scope.modifier.selected.id;
        var modValue = parseFloat($scope.modifier.value);
        var target   = $scope.modifier.target;

        ($scope.items || []).forEach(function (item) {
            if (!item.checked) return;

            if (target === "cash" || target === "both") {
                item.cashKgBaru = calcNewKg(item.cashKgLama, modType, modValue);
                item.cashLbr    = item.weight > 0 ? round100(item.cashKgBaru * item.weight) : 0;
                autoSaveDraft(item, "cash");
            }
            if (target === "credit" || target === "both") {
                item.kreditKgBaru = calcNewKg(item.kreditKgLama, modType, modValue);
                item.kreditLbr    = item.weight > 0 ? round100(item.kreditKgBaru * item.weight) : 0;
                autoSaveDraft(item, "credit");
            }
        });

        $scope.hasGenerated = true;
        $scope.saveState    = "idle";
        showToast("Harga baru berhasil digenerate", "success");
    };

    // ── Recalc Lbr + auto-save (triggered by ng-change on inputs) ────────────
    $scope.recalcAndSave = function (item, type) {
        if (type === "cash") {
            var kg = parseFloat(item.cashKgBaru) || 0;
            item.cashLbr = kg && item.weight ? round100(kg * item.weight) : null;
        } else {
            var kg = parseFloat(item.kreditKgBaru) || 0;
            item.kreditLbr = kg && item.weight ? round100(kg * item.weight) : null;
        }
        autoSaveDraft(item, type);
    };

    // ── Auto-save draft (fire-and-forget) ─────────────────────────────────────
    function autoSaveDraft(item, type) {
        var pr_id = type === "cash" ? 2 : 4;
        var price = type === "cash" ? item.cashKgBaru : item.kreditKgBaru;
        if (price == null || price === "") return;
        $priceService.saveDraft(item.ig_id, pr_id, parseFloat(price)).catch(angular.noop);
    }

    // ── Draft state helpers ───────────────────────────────────────────────────
    $scope.hasDrafts = function () {
        return ($scope.items || []).some(function (i) { return i.cashKgBaru || i.kreditKgBaru; });
    };

    $scope.draftCount = function () {
        var count = 0;
        ($scope.items || []).forEach(function (i) {
            if (i.cashKgBaru)   count++;
            if (i.kreditKgBaru) count++;
        });
        return count;
    };

    // ── Commit Save ───────────────────────────────────────────────────────────
    $scope.commitSave = function () {
        if ($scope.saveState === "saving") return;
        $scope.saveState = "saving";
        showToast("Menyimpan harga...", "info");

        $priceService.commitDrafts().then(function () {
            $scope.saveState = "saved";
            showToast("Harga berhasil disimpan!", "success");
        }).catch(function () {
            $scope.saveState = "idle";
            showToast("Gagal menyimpan harga", "danger");
        });
    };

    // ── Export ERP (after save) ───────────────────────────────────────────────
    $scope.exportERP = function () {
        var item_prices = [];
        ($scope.items || []).forEach(function (item) {
            if (item.cashKgBaru)   item_prices.push({ ig_id: item.ig_id, pr_id: 2, new_price: item.cashKgBaru });
            if (item.kreditKgBaru) item_prices.push({ ig_id: item.ig_id, pr_id: 4, new_price: item.kreditKgBaru });
        });
        if (!item_prices.length) { showToast("Tidak ada harga untuk diexport", "info"); return; }
        showToast("Menyiapkan export ERP...", "info");
        $exportService.exportERP({ item_prices: item_prices }).then(function () {
            showToast("Export ERP berhasil", "success");
        }).catch(function () {
            showToast("Gagal export ERP", "danger");
        });
    };

    // ── Polling (collaboration) ───────────────────────────────────────────────
    function startPolling() {
        pollInterval = $interval(function () {
            if (!$scope.items || !$scope.items.length) return;
            var myId = getUserId();

            $priceService.getDraftChanges(lastPollTime).then(function (res) {
                var changes = res.result || [];
                if (!changes.length) { lastPollTime = new Date().toISOString(); return; }

                var changeSet = {};
                changes.forEach(function (c) {
                    if (c.draft_by !== myId) changeSet[c.ig_id] = true;
                });

                ($scope.items || []).forEach(function (item) {
                    if (changeSet[item.ig_id]) {
                        item.justEdited = true;
                        $timeout(function () { item.justEdited = false; }, 3000);
                    }
                });

                lastPollTime = new Date().toISOString();
            }).catch(angular.noop);
        }, 15000);
    }

    // ── Export Template Per Kilo ──────────────────────────────────────────────
    $scope.exportTemplatePerKilo = function () {
        if ($scope.isExportingTemplate) return;
        $scope.isExportingTemplate = true;
        showToast("Menyiapkan template...", "info");

        $exportService.exportTemplatePerKilo({
            cat_id:    $scope.filter.category ? $scope.filter.category.id : null,
            brand_id:  $scope.filter.brand    ? $scope.filter.brand.id    : null,
            grade_id:  $scope.filter.grade    ? $scope.filter.grade.id    : null,
            group_id:  $scope.filter.group    ? $scope.filter.group.id    : null,
            item_name: $scope.filter.item_search_name || null,
        }).then(function () {
            showToast("Template berhasil didownload", "success");
        }).catch(function (err) {
            if (err.data) {
                try {
                    var obj = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(err.data)));
                    showToast(obj.message || "Gagal mendownload template", "danger");
                } catch (e) { showToast("Gagal mendownload template", "danger"); }
            } else {
                showToast("Gagal mendownload template", "danger");
            }
        }).finally(function () {
            $scope.$apply(function () { $scope.isExportingTemplate = false; });
        });
    };

    // ── Import Template Per Kilo ──────────────────────────────────────────────
    $scope.handleFileSelect = function (files) {
        if (!files || !files.length) return;
        var formData = new FormData();
        formData.append("file", files[0]);

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
                (pricesRes.result || []).forEach(function (p) { priceMap[p.ig_id] = p; });
                $scope.items = imported.map(function (item) {
                    var p = priceMap[item.ig_id] || {};
                    return {
                        ig_id:        item.ig_id,
                        name:         item.name,
                        weight:       item.weight,
                        cashKgLama:   p.price_cash   != null ? parseFloat(p.price_cash)   : null,
                        kreditKgLama: p.price_credit != null ? parseFloat(p.price_credit) : null,
                        cashKgBaru:   item.cashKgBaru   || null,
                        kreditKgBaru: item.kreditKgBaru || null,
                        cashLbr:      null,
                        kreditLbr:    null,
                        lastUpdate:   p.last_update ? moment(p.last_update).format("DD-MM-YYYY") : "-",
                        checked:      item.cashKgBaru != null || item.kreditKgBaru != null,
                        justEdited:   false,
                    };
                });
                $scope.hasGenerated = true;
                showToast("File berhasil diimpor. Silakan simpan & export", "success");
            });
        }).catch(function () {
            showToast("Gagal mengimpor file", "danger");
        });
        document.getElementById("import-file").value = "";
    };
});
