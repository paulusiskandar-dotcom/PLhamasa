plmApp.controller("priceListController", function (
    $scope, $http, $timeout,
    $itemService, $priceService, $exportService, $masterService
) {

    // ── Debounce ──────────────────────────────────────────────────────────────
    var autosaveTimers = {};
    function debounceAutosave(key, fn) {
        if (autosaveTimers[key]) clearTimeout(autosaveTimers[key]);
        autosaveTimers[key] = setTimeout(fn, 400);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function roundSpecial(raw) {   // per-unit rounding: 0-49 → floor, 50-99 → ceil
        var r = raw % 100;
        return r <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
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

    // Upsert into pendingChanges (dedup by ig_id+pr_id, keep original old_price)
    function upsertPending(ig_id, pr_id, old_price, new_price) {
        for (var i = 0; i < $scope.pendingChanges.length; i++) {
            if ($scope.pendingChanges[i].ig_id === ig_id && $scope.pendingChanges[i].pr_id === pr_id) {
                $scope.pendingChanges[i].new_price = new_price;
                return;
            }
        }
        $scope.pendingChanges.push({ ig_id: ig_id, pr_id: pr_id, old_price: old_price || 0, new_price: new_price });
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
            selected: $scope.modifierOptions[2],
            targets:  {},
            value:    null,
        };
        $scope.filter = {
            category: null, brand: null, grade: null,
            group: $scope.groupOptions[0], item_search_name: null,
        };
        $scope.categories = []; $scope.brands = []; $scope.grades = [];
        loadMasterData();

        $scope.items         = null;
        $scope.priceTypes    = [];
        $scope.priceGroups   = [];
        $scope.category      = null;
        $scope.isExtended    = false;
        $scope.catMaxUpdatedAt = null;
        $scope.categoryInfo  = null;

        $scope.selection     = { all: false };
        $scope.sortField     = "weight";
        $scope.sortDir       = "asc";

        $scope.hasGenerated   = false;
        $scope.saveState      = "idle";
        $scope.syncState      = "idle";
        $scope.pendingChanges = [];
        $scope.autoSaveError  = false;

        $scope.toast              = { show: false, message: "", type: "" };
        $scope.isExportingTemplate = false;
        $scope.sidebarHidden       = localStorage.getItem("plm.sidebarHidden") === "true";

        $scope.showHistoryModal = false;
        $scope.exportHistory    = [];
        $scope.historyLoading   = false;
        $scope.historyOffset    = 0;
    }

    init();

    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem("plm.sidebarHidden", $scope.sidebarHidden);
    };

    // ── Master Data ───────────────────────────────────────────────────────────
    function loadMasterData() {
        $masterService.getCategories().then(function (r) { $scope.categories = r.result || []; });
        $masterService.getBrands().then(function (r)     { $scope.brands     = r.result || []; });
        $masterService.getGrades().then(function (r)     { $scope.grades     = r.result || []; });
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(message, type) {
        $scope.toast = { show: true, message: message, type: type || "info" };
        $timeout(function () { $scope.toast.show = false; }, 3500);
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    function applySortOrder() {
        if (!$scope.items) return;
        var field = $scope.sortField;
        var dir   = $scope.sortDir === "asc" ? 1 : -1;

        $scope.items.sort(function (a, b) {
            var va, vb;
            if (field === "name") {
                va = a.name || ""; vb = b.name || "";
            } else if (field === "weight") {
                va = a.weight || 0; vb = b.weight || 0;
            } else {
                // price field e.g. "cash_gudang"
                va = (a.prices[field] && a.prices[field].current) || 0;
                vb = (b.prices[field] && b.prices[field].current) || 0;
            }
            if (va < vb) return -1 * dir;
            if (va > vb) return  1 * dir;
            return 0;
        });
    }

    $scope.sortBy = function (field) {
        if ($scope.sortField === field) {
            if ($scope.sortDir === "asc") {
                $scope.sortDir = "desc";
            } else {
                $scope.sortField = "weight";
                $scope.sortDir   = "asc";
            }
        } else {
            $scope.sortField = field;
            $scope.sortDir   = "asc";
        }
        applySortOrder();
    };

    $scope.sortIcon = function (field) {
        if ($scope.sortField !== field) return "bi-arrow-down-up";
        return $scope.sortDir === "asc" ? "bi-sort-up-alt" : "bi-sort-down-alt";
    };
    $scope.sortActive = function (field) { return $scope.sortField === field; };

    // ── Select All ────────────────────────────────────────────────────────────
    $scope.toggleSelectAll = function () {
        ($scope.items || []).forEach(function (i) { i.checked = $scope.selection.all; });
    };

    $scope.onItemCheck = function () {
        var items = $scope.items || [];
        $scope.selection.all = items.length > 0 && items.every(function (i) { return i.checked; });
    };

    // ── Modifier Targets ──────────────────────────────────────────────────────
    function initModifierTargets(types) {
        $scope.modifier.targets = {};
        (types || []).forEach(function (pt) {
            $scope.modifier.targets[pt.code] = true;
        });
    }

    $scope.selectAllTargets = function () {
        ($scope.priceTypes || []).forEach(function (pt) {
            $scope.modifier.targets[pt.code] = true;
        });
    };
    $scope.selectGroupTargets = function (group) {
        ($scope.priceTypes || []).forEach(function (pt) {
            $scope.modifier.targets[pt.code] = (pt.group === group);
        });
    };

    // ── Search ────────────────────────────────────────────────────────────────
    $scope.search = function () {
        $scope.hasGenerated   = false;
        $scope.saveState      = "idle";
        $scope.syncState      = "idle";
        $scope.pendingChanges = [];
        $scope.autoSaveError  = false;
        $scope.selection.all  = false;
        $scope.sortField      = "weight";
        $scope.sortDir        = "asc";

        if (!$scope.filter.category && !$scope.filter.item_search_name) {
            showToast("Pilih Kategori atau isi Nama Barang terlebih dahulu", "warning");
            return;
        }

        var params = {
            cat_id:    $scope.filter.category  ? $scope.filter.category.id  : null,
            brand_id:  $scope.filter.brand     ? $scope.filter.brand.id     : null,
            grade_id:  $scope.filter.grade     ? $scope.filter.grade.id     : null,
            group_id:  $scope.filter.group     ? $scope.filter.group.id     : null,
            item_name: $scope.filter.item_search_name || null,
        };

        $priceService.getInfo(params).then(function (res) {
            var data = res.result || {};

            if (!data.items || !data.items.length) {
                $scope.items      = [];
                $scope.category   = data.category || null;
                $scope.priceTypes = data.price_types || [];
                $scope.isExtended = data.category ? data.category.is_extended : false;
                showToast("Tidak ada barang ditemukan", "info");
                return;
            }

            $scope.category         = data.category    || null;
            $scope.priceTypes       = data.price_types || [];
            $scope.isExtended       = data.category ? data.category.is_extended : false;
            $scope.catMaxUpdatedAt  = data.cat_max_updated_at || null;
            $scope.categoryInfo     = {
                cat_name:        data.category ? data.category.name : null,
                erp_last_update: data.cat_max_updated_at || null,
                last_export:     data.last_export || null,
            };

            // Compute unique groups for quick-select
            var seenGroups = {};
            $scope.priceGroups = [];
            ($scope.priceTypes || []).forEach(function (pt) {
                if (!seenGroups[pt.group]) {
                    seenGroups[pt.group] = true;
                    $scope.priceGroups.push(pt.group);
                }
            });

            initModifierTargets($scope.priceTypes);

            // Build items
            $scope.items = data.items.map(function (item) {
                return {
                    ig_id:          item.ig_id,
                    name:           item.name,
                    weight:         item.weight,
                    erp_updated_at: item.erp_updated_at || null,
                    prices:         item.prices || {},
                    new:            {},
                    new_unit:       {},
                    checked:        false,
                    justEdited:     false,
                };
            });

            applySortOrder();

        }).catch(function () {
            showToast("Gagal mengambil data", "danger");
        });
    };

    // ── isSpotUpdate ──────────────────────────────────────────────────────────
    $scope.isSpotUpdate = function (item) {
        return $scope.catMaxUpdatedAt &&
               item.erp_updated_at   &&
               item.erp_updated_at !== $scope.catMaxUpdatedAt;
    };

    // ── Generate Harga Baru (accumulative) ───────────────────────────────────
    $scope.generatePrices = function () {
        if ($scope.modifier.value == null || $scope.modifier.value === "") {
            showToast("Masukkan nilai pengubah terlebih dahulu", "warning");
            return;
        }
        var anySelected = ($scope.items || []).some(function (i) { return i.checked; });
        if (!anySelected) {
            showToast("Pilih minimal satu barang terlebih dahulu", "warning");
            return;
        }
        var targetList = ($scope.priceTypes || []).filter(function (pt) {
            return $scope.modifier.targets[pt.code];
        });
        if (!targetList.length) {
            showToast("Pilih minimal satu target harga", "warning");
            return;
        }

        var modType  = $scope.modifier.selected.id;
        var modValue = parseFloat($scope.modifier.value);

        ($scope.items || []).forEach(function (item) {
            if (!item.checked) return;
            targetList.forEach(function (pt) {
                var oldKg = item.prices[pt.code] ? (item.prices[pt.code].current || 0) : 0;
                var newKg = calcNewKg(oldKg, modType, modValue);
                var newUnit = item.weight > 0 ? roundSpecial(newKg * item.weight) : 0;

                // Accumulative: write only targeted columns, leave others untouched
                item.new[pt.code]      = newKg;
                item.new_unit[pt.code] = newUnit;

                // Fire-and-forget auto-save
                fireAutoSave(item.ig_id, pt.pr_id, newKg);

                // Track for explicit save
                upsertPending(item.ig_id, pt.pr_id, oldKg, newKg);
            });
        });

        $scope.hasGenerated   = true;
        $scope.modifier.value = null;   // reset value, keep targets

        var labels = targetList.map(function (pt) { return pt.group + " " + pt.label; }).join(", ");
        showToast("Generate " + labels + " selesai", "success");
    };

    // ── Manual override on blur ───────────────────────────────────────────────
    $scope.onManualOverride = function (item, pt) {
        var kg = parseFloat(item.new[pt.code]);
        if (isNaN(kg) || kg < 0) return;
        item.new_unit[pt.code] = item.weight > 0 ? roundSpecial(kg * item.weight) : 0;

        fireAutoSave(item.ig_id, pt.pr_id, kg);
        upsertPending(
            item.ig_id, pt.pr_id,
            item.prices[pt.code] ? (item.prices[pt.code].current || 0) : 0,
            kg
        );
        $scope.hasGenerated = true;
    };

    // ── Auto-save (fire-and-forget) ───────────────────────────────────────────
    function fireAutoSave(igId, prId, kg) {
        var key = igId + "_" + prId;
        $scope.syncState = "saving";
        debounceAutosave(key, function () {
            $priceService.autoSave(igId, prId, kg)
                .then(function () {
                    $scope.$apply(function () { $scope.syncState = "saved"; });
                    $timeout(function () { $scope.syncState = "idle"; }, 2000);
                })
                .catch(function () {
                    if (!$scope.autoSaveError) {
                        $scope.$apply(function () {
                            $scope.autoSaveError = true;
                            showToast("Auto-save gagal (koneksi?)", "warning");
                        });
                    }
                });
        });
    }

    // ── hasChanges / hasDrafts ────────────────────────────────────────────────
    $scope.hasChanges = function () { return $scope.pendingChanges.length > 0; };

    $scope.hasDrafts = function () {
        return ($scope.items || []).some(function (i) {
            return Object.keys(i.new || {}).some(function (k) { return i.new[k] != null; });
        });
    };

    // ── Explicit Save → price_log ─────────────────────────────────────────────
    $scope.saveAll = function () {
        if ($scope.saveState === "saving" || !$scope.pendingChanges.length) return;
        $scope.saveState = "saving";
        showToast("Menyimpan harga...", "info");

        $priceService.saveAll($scope.pendingChanges).then(function (res) {
            $scope.saveState      = "saved";
            $scope.autoSaveError  = false;
            showToast("Berhasil disimpan (" + res.result.saved_count + " harga)", "success");

            // Update item.prices to reflect committed values & clear new columns
            var prMap = {};
            ($scope.priceTypes || []).forEach(function (pt) { prMap[pt.pr_id] = pt.code; });
            ($scope.items || []).forEach(function (item) {
                ($scope.priceTypes || []).forEach(function (pt) {
                    if (item.new[pt.code] != null) {
                        item.prices[pt.code] = { current: item.new[pt.code], source: "plm" };
                    }
                });
                item.new      = {};
                item.new_unit = {};
            });
            $scope.pendingChanges = [];
            $scope.hasGenerated   = false;
        }).catch(function () {
            $scope.saveState = "idle";
            showToast("Gagal menyimpan — coba lagi", "danger");
        });
    };

    // ── Export ────────────────────────────────────────────────────────────────
    function buildExportPayload() {
        var item_prices = [];
        ($scope.items || []).forEach(function (item) {
            ($scope.priceTypes || []).forEach(function (pt) {
                if (item.new[pt.code] != null)
                    item_prices.push({ ig_id: item.ig_id, pr_id: pt.pr_id, new_price: item.new[pt.code] });
            });
        });
        return item_prices;
    }

    $scope.doExportERP = function () {
        var item_prices = buildExportPayload();
        if (!item_prices.length) { showToast("Tidak ada harga untuk diexport", "info"); return; }
        var cat_id   = $scope.category ? $scope.category.id   : null;
        var cat_name = $scope.category ? $scope.category.name : null;
        showToast("Menyiapkan export ERP...", "info");
        $exportService.exportERP({ item_prices: item_prices, cat_id: cat_id, cat_name: cat_name })
            .then(function () { showToast("Export ERP berhasil", "success"); })
            .catch(function () { showToast("Gagal export ERP", "danger"); });
    };

    $scope.doExportManual = function () {
        var item_prices = buildExportPayload();
        if (!item_prices.length) { showToast("Tidak ada harga untuk diexport", "info"); return; }
        var cat_id   = $scope.category ? $scope.category.id   : null;
        var cat_name = $scope.category ? $scope.category.name : null;
        showToast("Menyiapkan export Manual...", "info");
        $exportService.exportManual({ item_prices: item_prices, cat_id: cat_id, cat_name: cat_name })
            .then(function () { showToast("Export Manual berhasil", "success"); })
            .catch(function () { showToast("Gagal export Manual", "danger"); });
    };

    // ── History Modal ─────────────────────────────────────────────────────────
    $scope.openHistoryModal = function () {
        $scope.showHistoryModal = true;
        $scope.historyOffset    = 0;
        loadHistory();
    };
    $scope.closeHistoryModal = function () { $scope.showHistoryModal = false; };

    function loadHistory() {
        var cat_id = $scope.category ? $scope.category.id : null;
        $scope.historyLoading = true;
        $exportService.getHistory(cat_id, 20, $scope.historyOffset)
            .then(function (r) { $scope.exportHistory = r.result || []; $scope.historyLoading = false; })
            .catch(function () { $scope.historyLoading = false; showToast("Gagal memuat history", "danger"); });
    }

    $scope.historyPage = function () { return Math.floor($scope.historyOffset / 20) + 1; };
    $scope.historyNext = function () { $scope.historyOffset += 20; loadHistory(); };
    $scope.historyPrev = function () { $scope.historyOffset = Math.max(0, $scope.historyOffset - 20); loadHistory(); };
    $scope.downloadHistory = function (id) { $exportService.downloadHistory(id); };

    // ── syncSummary ───────────────────────────────────────────────────────────
    $scope.syncSummary = function () {
        if (!$scope.items || !$scope.items.length) return "";
        var hasPlm = $scope.items.filter(function (i) {
            return Object.values(i.prices || {}).some(function (p) { return p && p.source === "plm"; });
        }).length;
        if (!hasPlm) return "";
        return hasPlm + "/" + $scope.items.length + " dari PLM";
    };

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
        }).catch(function () {
            showToast("Gagal mendownload template", "danger");
        }).finally(function () {
            $scope.$apply(function () { $scope.isExportingTemplate = false; });
        });
    };

    // ── Import ────────────────────────────────────────────────────────────────
    $scope.handleFileSelect = function (files) {
        if (!files || !files.length) return;
        var formData = new FormData();
        formData.append("file", files[0]);
        $http.post(api.url + "export/import-per-kilo", formData, { headers: { "Content-Type": undefined } })
            .then(function (r) {
                var imported = r.data.result;
                if (!imported || !imported.length) { showToast("Tidak ada data yang bisa diimpor", "info"); return; }
                showToast("File berhasil diimpor", "success");
            }).catch(function () { showToast("Gagal mengimpor file", "danger"); });
        document.getElementById("import-file").value = "";
    };
});
