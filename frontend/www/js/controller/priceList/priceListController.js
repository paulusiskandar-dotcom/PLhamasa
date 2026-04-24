plmApp.controller("priceListController", function (
    $scope, $http, $timeout,
    $itemService, $priceService, $exportService, $masterService
) {

    // ── Debounce helpers ──────────────────────────────────────────────────────
    var autosaveTimers = {};
    function debounceAutosave(key, fn) {
        if (autosaveTimers[key]) clearTimeout(autosaveTimers[key]);
        autosaveTimers[key] = setTimeout(fn, 400);
    }

    // ── Pure helpers ──────────────────────────────────────────────────────────
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
            target:   "both",
            value:    null,
        };
        $scope.filter = {
            category: null, brand: null, grade: null,
            group: $scope.groupOptions[0], item_search_name: null,
        };
        $scope.categories = []; $scope.brands = []; $scope.grades = [];
        loadMasterData();

        $scope.items              = null;
        $scope.headerChecked      = false;
        $scope.hasGenerated       = false;
        $scope.saveState          = "idle";  // idle | saving | saved
        $scope.syncState          = "idle";  // idle | saving | saved (auto-save indicator)
        $scope.catMaxUpdatedAt    = null;
        $scope.categoryInfo       = null;
        $scope.toast              = { show: false, message: "", type: "" };
        $scope.isExportingTemplate = false;
        $scope.sidebarHidden       = localStorage.getItem("plm.sidebarHidden") === "true";

        // History modal
        $scope.showHistoryModal   = false;
        $scope.exportHistory      = [];
        $scope.historyLoading     = false;
        $scope.historyOffset      = 0;
    }

    init();

    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem("plm.sidebarHidden", $scope.sidebarHidden);
    };

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

    // ── Sync icons / labels ───────────────────────────────────────────────────
    $scope.syncIcon = function (status) {
        return { synced: "🟢", pending: "🟡", draft: "🔘", untouched: "—" }[status] || "—";
    };
    $scope.syncLabel = function (status) {
        return { synced: "Synced", pending: "Belum upload ke ERP", draft: "Draft — belum di-export", untouched: "Belum disentuh" }[status] || "";
    };
    $scope.syncSummary = function () {
        if (!$scope.items || !$scope.items.length) return "";
        var counts = { synced: 0, pending: 0, draft: 0, untouched: 0 };
        $scope.items.forEach(function (i) { counts[i.sync_status || "untouched"]++; });
        if (counts.synced === $scope.items.length) return "✅ Semua synced";
        return "🟢 " + counts.synced + " synced · 🟡 " + counts.pending + " pending · 🔘 " + counts.draft + " draft";
    };

    // ── Search ────────────────────────────────────────────────────────────────
    $scope.search = function () {
        $scope.hasGenerated  = false;
        $scope.saveState     = "idle";
        $scope.syncState     = "idle";
        $scope.headerChecked = false;

        if (!$scope.filter.category && !$scope.filter.item_search_name) {
            showToast("Pilih Kategori atau isi Nama Barang terlebih dahulu", "warning");
            return;
        }

        var cat_id = $scope.filter.category ? $scope.filter.category.id : null;

        $itemService.getAll({
            cat_id:    cat_id,
            brand_id:  $scope.filter.brand    ? $scope.filter.brand.id    : null,
            grade_id:  $scope.filter.grade    ? $scope.filter.grade.id    : null,
            group_id:  $scope.filter.group    ? $scope.filter.group.id    : null,
            item_name: $scope.filter.item_search_name || null,
        }).then(function (res) {
            var itemsFromApi = res.result;
            if (!itemsFromApi || !itemsFromApi.length) {
                $scope.items = [];
                showToast("Tidak ada barang ditemukan", "info");
                return;
            }

            var ig_ids = itemsFromApi.map(function (i) { return i.ig_id; });

            // Load category info (parallel)
            if (cat_id) {
                $priceService.getCategoryInfo(cat_id).then(function (r) {
                    $scope.categoryInfo = r.result || null;
                }).catch(angular.noop);
            } else {
                $scope.categoryInfo = null;
            }

            $priceService.getPricesInfo(ig_ids, cat_id).then(function (pricesRes) {
                var raw      = pricesRes.result || {};
                var priceArr = raw.items || [];
                $scope.catMaxUpdatedAt = raw.cat_max_updated_at || null;

                var weightMap = {};
                itemsFromApi.forEach(function (i) { weightMap[i.ig_id] = i.weight; });

                var priceMap = {};
                priceArr.forEach(function (p) { priceMap[p.ig_id] = p; });

                $scope.items = itemsFromApi.map(function (item) {
                    var p = priceMap[item.ig_id] || {};
                    return {
                        ig_id:          item.ig_id,
                        name:           item.name,
                        weight:         item.weight,
                        cashKgLama:     p.price_cash   != null ? parseFloat(p.price_cash)   : null,
                        kreditKgLama:   p.price_credit != null ? parseFloat(p.price_credit) : null,
                        cashKgBaru:     null,
                        kreditKgBaru:   null,
                        cashLbr:        null,
                        kreditLbr:      null,
                        erp_updated_at: p.erp_updated_at || null,
                        sync_status:    p.sync_status    || "untouched",
                        lastUpdate:     p.last_update ? moment(p.last_update).format("DD MMM YY") : "-",
                        checked:        false,
                        justEdited:     false,
                    };
                });

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
                triggerAutosave(item, "cash");
            }
            if (target === "credit" || target === "both") {
                item.kreditKgBaru = calcNewKg(item.kreditKgLama, modType, modValue);
                item.kreditLbr    = item.weight > 0 ? round100(item.kreditKgBaru * item.weight) : 0;
                triggerAutosave(item, "credit");
            }
        });

        $scope.hasGenerated = true;
        $scope.saveState    = "idle";
        showToast("Harga baru berhasil digenerate", "success");
    };

    // ── Recalc Lbr + debounced autosave ──────────────────────────────────────
    $scope.recalcAndSave = function (item, type) {
        if (type === "cash") {
            var kg = parseFloat(item.cashKgBaru) || 0;
            item.cashLbr = kg && item.weight ? round100(kg * item.weight) : null;
        } else {
            var kg = parseFloat(item.kreditKgBaru) || 0;
            item.kreditLbr = kg && item.weight ? round100(kg * item.weight) : null;
        }
        triggerAutosave(item, type);
    };

    function triggerAutosave(item, type) {
        var key   = item.ig_id + "_" + type;
        var pr_id = type === "cash" ? 2 : 4;
        var price = type === "cash" ? item.cashKgBaru : item.kreditKgBaru;
        if (price == null || price === "") return;

        $scope.syncState = "saving";
        debounceAutosave(key, function () {
            $priceService.autosave(item.ig_id, pr_id, parseFloat(price))
                .then(function () {
                    $scope.$apply(function () { $scope.syncState = "saved"; });
                    $timeout(function () { $scope.syncState = "idle"; }, 2000);
                })
                .catch(angular.noop);
        });
    }

    // ── Draft check ───────────────────────────────────────────────────────────
    $scope.hasDrafts = function () {
        return ($scope.items || []).some(function (i) { return i.cashKgBaru || i.kreditKgBaru; });
    };

    // ── Batch Save ────────────────────────────────────────────────────────────
    $scope.saveAll = function () {
        if ($scope.saveState === "saving") return;
        var payload = [];
        ($scope.items || []).forEach(function (item) {
            if (item.cashKgBaru != null)
                payload.push({ ig_id: item.ig_id, pr_id: 2, old_price: item.cashKgLama || 0, new_price: item.cashKgBaru });
            if (item.kreditKgBaru != null)
                payload.push({ ig_id: item.ig_id, pr_id: 4, old_price: item.kreditKgLama || 0, new_price: item.kreditKgBaru });
        });
        if (!payload.length) { showToast("Tidak ada perubahan untuk disimpan", "info"); return; }

        $scope.saveState = "saving";
        showToast("Menyimpan harga...", "info");

        $priceService.saveBatch(payload).then(function () {
            $scope.saveState = "saved";
            showToast("Harga berhasil disimpan!", "success");
            // Update sync badges: items now become "draft" (not yet exported)
            ($scope.items || []).forEach(function (item) {
                if (item.cashKgBaru || item.kreditKgBaru) item.sync_status = "draft";
            });
        }).catch(function () {
            $scope.saveState = "idle";
            showToast("Gagal menyimpan harga", "danger");
        });
    };

    // ── Export ERP ────────────────────────────────────────────────────────────
    $scope.doExportERP = function () {
        var item_prices = buildExportPayload();
        if (!item_prices.length) { showToast("Tidak ada harga untuk diexport", "info"); return; }

        var cat_id   = $scope.filter.category ? $scope.filter.category.id   : null;
        var cat_name = $scope.filter.category ? $scope.filter.category.name : null;

        showToast("Menyiapkan export ERP...", "info");
        $exportService.exportERP({ item_prices: item_prices, cat_id: cat_id, cat_name: cat_name })
            .then(function () {
                showToast("Export ERP berhasil", "success");
                // Refresh category info + sync badges
                ($scope.items || []).forEach(function (item) {
                    if (item.cashKgBaru || item.kreditKgBaru) item.sync_status = "pending";
                });
                if (cat_id) {
                    $priceService.getCategoryInfo(cat_id).then(function (r) {
                        $scope.categoryInfo = r.result || null;
                    }).catch(angular.noop);
                }
            })
            .catch(function () { showToast("Gagal export ERP", "danger"); });
    };

    // ── Export Manual ─────────────────────────────────────────────────────────
    $scope.doExportManual = function () {
        var item_prices = buildExportPayload();
        if (!item_prices.length) { showToast("Tidak ada harga untuk diexport", "info"); return; }

        var cat_id   = $scope.filter.category ? $scope.filter.category.id   : null;
        var cat_name = $scope.filter.category ? $scope.filter.category.name : null;

        showToast("Menyiapkan export Manual...", "info");
        $exportService.exportManual({ item_prices: item_prices, cat_id: cat_id, cat_name: cat_name })
            .then(function () { showToast("Export Manual berhasil", "success"); })
            .catch(function () { showToast("Gagal export Manual", "danger"); });
    };

    function buildExportPayload() {
        var item_prices = [];
        ($scope.items || []).forEach(function (item) {
            if (item.cashKgBaru   != null) item_prices.push({ ig_id: item.ig_id, pr_id: 2, new_price: item.cashKgBaru });
            if (item.kreditKgBaru != null) item_prices.push({ ig_id: item.ig_id, pr_id: 4, new_price: item.kreditKgBaru });
        });
        return item_prices;
    }

    // ── History Modal ─────────────────────────────────────────────────────────
    $scope.openHistoryModal = function () {
        $scope.showHistoryModal = true;
        $scope.historyOffset    = 0;
        loadHistory();
    };
    $scope.closeHistoryModal = function () { $scope.showHistoryModal = false; };

    function loadHistory() {
        var cat_id = $scope.filter.category ? $scope.filter.category.id : null;
        $scope.historyLoading = true;
        $exportService.getHistory(cat_id, 20, $scope.historyOffset)
            .then(function (r) {
                $scope.exportHistory  = r.result || [];
                $scope.historyLoading = false;
            })
            .catch(function () {
                $scope.historyLoading = false;
                showToast("Gagal memuat history", "danger");
            });
    }

    $scope.historyPage = function () { return Math.floor($scope.historyOffset / 20) + 1; };
    $scope.historyNext = function () { $scope.historyOffset += 20; loadHistory(); };
    $scope.historyPrev = function () { $scope.historyOffset = Math.max(0, $scope.historyOffset - 20); loadHistory(); };
    $scope.downloadHistory = function (id) { $exportService.downloadHistory(id); };

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
            } else { showToast("Gagal mendownload template", "danger"); }
        }).finally(function () {
            $scope.$apply(function () { $scope.isExportingTemplate = false; });
        });
    };

    // ── Import Template Per Kilo ──────────────────────────────────────────────
    $scope.handleFileSelect = function (files) {
        if (!files || !files.length) return;
        var formData = new FormData();
        formData.append("file", files[0]);
        $http.post(api.url + "export/import-per-kilo", formData, { headers: { "Content-Type": undefined } })
            .then(function (r) {
                var imported = r.data.result;
                if (!imported || !imported.length) { showToast("Tidak ada data yang bisa diimpor", "info"); return; }
                var ig_ids = imported.map(function (i) { return i.ig_id; });
                $priceService.getPricesInfo(ig_ids, null).then(function (pricesRes) {
                    var raw = pricesRes.result || {};
                    var arr = raw.items || [];
                    var priceMap = {};
                    arr.forEach(function (p) { priceMap[p.ig_id] = p; });
                    $scope.items = imported.map(function (item) {
                        var p = priceMap[item.ig_id] || {};
                        return {
                            ig_id: item.ig_id, name: item.name, weight: item.weight,
                            cashKgLama: p.price_cash != null ? parseFloat(p.price_cash) : null,
                            kreditKgLama: p.price_credit != null ? parseFloat(p.price_credit) : null,
                            cashKgBaru: item.cashKgBaru || null, kreditKgBaru: item.kreditKgBaru || null,
                            cashLbr: null, kreditLbr: null,
                            erp_updated_at: p.erp_updated_at || null, sync_status: p.sync_status || "untouched",
                            lastUpdate: p.last_update ? moment(p.last_update).format("DD MMM YY") : "-",
                            checked: item.cashKgBaru != null || item.kreditKgBaru != null, justEdited: false,
                        };
                    });
                    $scope.hasGenerated = true;
                    showToast("File berhasil diimpor", "success");
                });
            }).catch(function () { showToast("Gagal mengimpor file", "danger"); });
        document.getElementById("import-file").value = "";
    };
});
