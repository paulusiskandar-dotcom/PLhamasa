plmApp.controller('editController', function ($scope, $timeout, $window, priceListService, $masterService, subcategoryService, erpTargetService, pdfTemplateService, itemDimensionsService) {

    // Get price list ID from server-injected data
    var plId = (window.plmPageData && window.plmPageData.priceListId) ? window.plmPageData.priceListId : null;
    if (!plId) {
        // Fallback: parse from URL
        var parts = window.location.pathname.split('/');
        plId = parseInt(parts[parts.length - 1]);
    }

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    $scope.pl = null;
    $scope.priceTypes = [];
    $scope.hasGudangPabrik = false;
    $scope.items = [];
    $scope.filteredItems = [];
    $scope.subcategories = [];
    $scope.subcatAssignments = {};
    $scope.availableBrands = [];
    $scope.availableGrades = [];
    $scope.availableGroups = [];
    $scope.lockState = null;
    $scope.lockInfo = null;
    $scope.erpActive = null;
    $scope.loading = true;
    $scope.posting = false;
    $scope.saveStatus = null;

    $scope.filter = { subcatId: '', brand: '', grade: '', group: '', name: '' };
    $scope.activeFilters  = { subcategory: [], tebal: [], merk: [], grade: [] };
    $scope.filterOpen     = { subcategory: false, tebal: false, merk: false, grade: false };
    $scope.filterSearch   = { subcategory: '', tebal: '', merk: '' };
    $scope.filterOptions  = null;
    $scope.showDimColumns = false;
    $scope.toggleDimColumns = function () { $scope.showDimColumns = !$scope.showDimColumns; };
    $scope.requireTebal = false;
    $scope.unassignedCount = 0;
    $scope.sort = { field: 'weight', dir: 'asc' };
    $scope.selection = { all: false };

    $scope.modifierTypes = [
        { id: 'plus_nominal',  label: '+ Rp'    },
        { id: 'minus_nominal', label: '- Rp'    },
        { id: 'plus_percent',  label: '+ %'     },
        { id: 'minus_percent', label: '- %'     },
        { id: 'set_price',     label: '= Harga' },
    ];
    $scope.modifier = { type: 'plus_nominal', value: null, targets: {} };

    $scope.toast = { show: false };
    $scope.modalLockLost = false;
    $scope.modalLog = null;
    $scope.syncNotification = null;
    $scope.modalSyncedItems = null;

    // ── Helpers ───────────────────────────────────────────────
    function roundSpecial(raw) {
        if (!raw && raw !== 0) return 0;
        var sisa = Math.round(raw) % 100;
        return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
    }

    function formatThousand(num) {
        if (num === null || num === undefined || num === '') return '';
        var n = parseInt(String(num).replace(/[^\d-]/g, ''), 10);
        return isNaN(n) ? '' : n.toLocaleString('id-ID');
    }

    function parseThousand(text) {
        if (!text) return null;
        var clean = String(text).replace(/[^\d-]/g, '');
        if (!clean) return null;
        var n = parseInt(clean, 10);
        return isNaN(n) ? null : n;
    }

    function showToast(msg, type, duration) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, duration || 3000);
    }

    // ── Load data ─────────────────────────────────────────────
    function loadData() {
        $scope.loading = true;
        priceListService.get(plId).then(function (res) {
            var data = res.result;
            $scope.pl = data;
            $scope.priceTypes = data.priceTypes || [];
            $scope.hasGudangPabrik = $scope.priceTypes.some(function (pt) { return pt.group === 'Pabrik'; });

            // Initialize modifier targets (all checked by default)
            $scope.modifier.targets = {};
            $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = true; });

            // Build items — pre-fill new/new_unit from current saved prices
            $scope.items = (data.items || []).map(function (it) {
                var newObj = {};
                var newDisplay = {};
                var newUnit = {};
                var savedObj = {};
                $scope.priceTypes.forEach(function (pt) {
                    savedObj[pt.code] = false;
                    var cur = it.prices[pt.code] ? it.prices[pt.code].current : null;
                    if (cur !== null && cur !== undefined) {
                        // Compute current_unit for the /LBR column
                        it.prices[pt.code].current_unit = roundSpecial(cur * (it.weight || 0));
                        // Pre-fill /KG BARU with current saved price
                        newObj[pt.code]     = cur;
                        newDisplay[pt.code] = formatThousand(cur);
                        newUnit[pt.code]    = it.prices[pt.code].current_unit;
                    }
                });
                return angular.extend(it, {
                    _checked: false,
                    _saved: savedObj,
                    new: newObj,
                    new_display: newDisplay,
                    new_unit: newUnit,
                });
            });

            $scope.lockState = data.locked_status;
            $scope.lockInfo  = data.lockInfo;

            // Show banner if new items were auto-synced
            var si = data.sync_info;
            if (si && si.synced_count > 0) {
                $scope.syncNotification = { count: si.synced_count, items: si.newly_synced_items || [] };
                $timeout(function () { $scope.syncNotification = null; }, 30000);
            }

            buildFilterOptions();
            applyFilter();

            // Load tebal dimensions + requireTebal flag
            var catId = data.cat_id;
            itemDimensionsService.getTebalMap(plId).then(function (r) {
                var tebalMap = r.result || {};
                $scope.items.forEach(function (it) {
                    var d = tebalMap[it.ig_id];
                    if (d) {
                        it.tebal          = d.tebal !== null ? parseFloat(d.tebal) : null;
                        it.tebal_label    = d.tebal_label || '(tidak terdeteksi)';
                        it.is_tebal_manual = d.is_tebal_manual || false;
                    } else {
                        it.tebal          = null;
                        it.tebal_label    = '(tidak terdeteksi)';
                        it.is_tebal_manual = false;
                    }
                });
                $scope.filterOptions = buildFilterOptions($scope.items);
                applyFilter();
                if (catId) {
                    itemDimensionsService.getCategoryConfig(catId).then(function (cfg) {
                        $scope.requireTebal = (cfg.result && cfg.result.require_tebal) || false;
                        $scope.unassignedCount = $scope.items.filter(function (it) { return !it.tebal && it.tebal !== 0; }).length;
                    }).catch(function () {});
                }
            }).catch(function () {});

            // Load side data
            if (data.cat_id) {
                subcategoryService.getByCategory(data.cat_id).then(function (r) {
                    $scope.subcategories = r.result || [];
                    return subcategoryService.getAssignments(data.cat_id);
                }).then(function (r) {
                    $scope.subcatAssignments = r.result || {};
                    var subcatNameById = {};
                    $scope.subcategories.forEach(function (s) { subcatNameById[s.id] = s.name; });
                    $scope.items.forEach(function (it) {
                        var subcatId = $scope.subcatAssignments[it.ig_id];
                        it.subcategory_name = subcatId ? (subcatNameById[parseInt(subcatId)] || null) : null;
                    });
                    $scope.filterOptions = buildFilterOptions($scope.items);
                    applyFilter();
                }).catch(function () {});
            }

            erpTargetService.getActive().then(function (r) {
                $scope.erpActive = r.result || null;
            }).catch(function () { $scope.erpActive = null; });

            // Auto-acquire lock if OPEN and not locked by other
            if (data.status === 'OPEN' && data.locked_status !== 'other_active') {
                acquireLock();
            }

            $scope.loading = false;
        }).catch(function (err) {
            $scope.loading = false;
            showToast('Gagal memuat data price list', 'danger');
            console.error('loadData error', err);
        });
    }

    function buildFilterOptions(items) {
        var srcItems = items || $scope.items;
        var brands = {}, grades = {}, groups = {};
        srcItems.forEach(function (it) {
            if (it.brand) brands[it.brand] = true;
            if (it.grade) grades[it.grade] = true;
            if (it.group) groups[it.group] = true;
        });
        $scope.availableBrands = Object.keys(brands).sort();
        $scope.availableGrades = Object.keys(grades).sort();
        $scope.availableGroups = Object.keys(groups).sort();

        // Build multi-select filter options
        var tebalMap = {}, merkMap = {}, gradeMap = {};
        (srcItems || []).forEach(function (it) {
            var tk = it.tebal_label || '(tidak terdeteksi)';
            if (!tebalMap[tk]) tebalMap[tk] = { label: tk, value: it.tebal, count: 0, is_unknown: it.tebal === null };
            tebalMap[tk].count++;
            var mk = it.brand || '(tidak ada)';
            if (!merkMap[mk]) merkMap[mk] = { label: mk, value: it.brand, count: 0 };
            merkMap[mk].count++;
            var gk = it.grade || '(tidak ada)';
            if (!gradeMap[gk]) gradeMap[gk] = { label: gk, value: it.grade, count: 0 };
            gradeMap[gk].count++;
        });
        var tebalArr = Object.values(tebalMap).sort(function (a, b) {
            if (a.is_unknown) return 1;
            if (b.is_unknown) return -1;
            return (a.value || 0) - (b.value || 0);
        });
        var merkArr  = Object.values(merkMap).sort(function (a, b) { return b.count - a.count; });
        var gradeArr = Object.values(gradeMap).sort(function (a, b) { return (a.label || '').localeCompare(b.label || ''); });
        var subcatMap = {};
        (srcItems || []).forEach(function (it) {
            var key = it.subcategory_name ? it.subcategory_name : '(tidak ada sub category)';
            if (!subcatMap[key]) subcatMap[key] = { label: key, value: it.subcategory_name || null, count: 0, is_unknown: !it.subcategory_name };
            subcatMap[key].count++;
        });
        var subcatArr = Object.values(subcatMap).sort(function (a, b) {
            if (a.is_unknown) return 1;
            if (b.is_unknown) return -1;
            return (a.label || '').localeCompare(b.label || '');
        });
        return { subcategory: subcatArr, tebal: tebalArr, merk: merkArr, grade: gradeArr };
    }

    // ── Filter + Sort ─────────────────────────────────────────
    $scope.$watch('filter', function () { applyFilter(); }, true);
    $scope.$watch('sort', function () { applyFilter(); }, true);

    function applyFilter() {
        if (!$scope.items) { $scope.filteredItems = []; return; }
        var f = $scope.filter;
        var filtered = $scope.items.filter(function (it) {
            if (f.subcatId && String($scope.subcatAssignments[it.ig_id]) !== String(f.subcatId)) return false;
            if (f.brand && it.brand !== f.brand) return false;
            if (f.grade && it.grade !== f.grade) return false;
            if (f.group && it.group !== f.group) return false;
            if (f.name && it.name.toLowerCase().indexOf(f.name.toLowerCase()) < 0) return false;
            var af = $scope.activeFilters;
            if (af.subcategory && af.subcategory.length > 0) {
                var itemSubcat = it.subcategory_name || '(tidak ada sub category)';
                if (af.subcategory.indexOf(itemSubcat) < 0) return false;
            }
            if (af.tebal.length > 0) {
                if (af.tebal.indexOf(it.tebal_label || '(tidak terdeteksi)') < 0) return false;
            }
            if (af.merk.length > 0) {
                if (af.merk.indexOf(it.brand || '(tidak ada)') < 0) return false;
            }
            if (af.grade.length > 0) {
                if (af.grade.indexOf(it.grade || '(tidak ada)') < 0) return false;
            }
            return true;
        });

        var sf = $scope.sort.field;
        var sd = $scope.sort.dir === 'asc' ? 1 : -1;
        filtered.sort(function (a, b) {
            var av, bv;
            if (sf === 'name') {
                av = (a.name || '').toLowerCase();
                bv = (b.name || '').toLowerCase();
            } else if (sf === 'weight') {
                av = a.weight || 0;
                bv = b.weight || 0;
            } else if (sf.indexOf('kgbaru:') === 0) {
                var newCode = sf.slice(7);
                av = (a.new && a.new[newCode]) || 0;
                bv = (b.new && b.new[newCode]) || 0;
            } else if (sf.indexOf('kg:') === 0) {
                var code = sf.slice(3);
                av = (a.prices[code] && a.prices[code].current) || 0;
                bv = (b.prices[code] && b.prices[code].current) || 0;
            } else if (sf.indexOf('lbr:') === 0) {
                var lbrCode = sf.slice(4);
                av = (a.new_unit && a.new_unit[lbrCode]) || (a.prices[lbrCode] && a.prices[lbrCode].current_unit) || 0;
                bv = (b.new_unit && b.new_unit[lbrCode]) || (b.prices[lbrCode] && b.prices[lbrCode].current_unit) || 0;
            } else if (sf === 'tebal') {
                av = a.tebal || 0;
                bv = b.tebal || 0;
            } else if (sf === 'i_brand') {
                av = (a.brand || '').toLowerCase();
                bv = (b.brand || '').toLowerCase();
            } else if (sf === 'grade') {
                av = (a.grade || '').toLowerCase();
                bv = (b.grade || '').toLowerCase();
            } else {
                av = 0; bv = 0;
            }
            if (av < bv) return -1 * sd;
            if (av > bv) return 1 * sd;
            return 0;
        });

        $scope.filteredItems = filtered;
    }

    $scope.sortBy = function (field) {
        if ($scope.sort.field === field) {
            $scope.sort.dir = $scope.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            $scope.sort.field = field;
            $scope.sort.dir = 'asc';
        }
    };

    $scope.getSortIcon = function (field) {
        if ($scope.sort.field !== field) return 'bi-arrow-down-up';
        return $scope.sort.dir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
    };

    // ── Selection ──────────────────────────────────────────────
    $scope.toggleSelectAll = function () {
        $scope.filteredItems.forEach(function (it) { it._checked = $scope.selection.all; });
    };

    $scope.onItemCheckedChange = function () {
        if (!$scope.filteredItems.length) { $scope.selection.all = false; return; }
        $scope.selection.all = $scope.filteredItems.every(function (i) { return i._checked; });
    };

    $scope.hasSelectedItems = function () {
        return ($scope.filteredItems || []).some(function (i) { return i._checked; });
    };

    // ── Modifier target quick-select ───────────────────────────
    $scope.selectAllTargets = function () {
        $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = true; });
    };
    $scope.selectGudang = function () {
        $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = pt.group === 'Gudang'; });
    };
    $scope.selectPabrik = function () {
        $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = pt.group === 'Pabrik'; });
    };

    $scope.onModifierValueChange = function () {
        var isPercent = $scope.modifier.type === 'plus_percent' || $scope.modifier.type === 'minus_percent';
        if (!isPercent) {
            var formatted = formatThousand(parseThousand($scope.modifier.value));
            if (formatted !== '') $scope.modifier.value = formatted;
        }
    };

    // ── Apply Modifier (Generate) ──────────────────────────────
    $scope.applyModifier = function () {
        var targets = $scope.priceTypes.filter(function (pt) { return $scope.modifier.targets[pt.code]; });
        if (!targets.length) { showToast('Pilih minimal 1 target harga', 'warning'); return; }

        var rawVal = parseThousand($scope.modifier.value);
        if (rawVal === null || rawVal === undefined) { showToast('Masukkan nilai modifier', 'warning'); return; }

        var changes = [];
        $scope.filteredItems.forEach(function (item) {
            if (!item._checked) return;
            targets.forEach(function (pt) {
                var current = (item.prices[pt.code] && item.prices[pt.code].current) ? item.prices[pt.code].current : 0;
                var newKg = computeNewPrice($scope.modifier.type, current, rawVal);
                if (newKg === null || newKg < 0) return;

                item.new[pt.code]         = newKg;
                item.new_display[pt.code] = formatThousand(newKg);
                item.new_unit[pt.code]    = item.weight > 0 ? roundSpecial(newKg * item.weight) : 0;

                changes.push({ ig_id: item.ig_id, pr_id: pt.pr_id, new_price: newKg });
            });
        });

        if (changes.length) {
            bulkAutoSave(changes);
        } else {
            showToast('Tidak ada item terpilih', 'warning');
        }
        $scope.modifier.value = null;
    };

    function computeNewPrice(type, current, value) {
        var n;
        switch (type) {
            case 'plus_nominal':  n = current + value; break;
            case 'minus_nominal': n = Math.max(0, current - value); break;
            case 'plus_percent':  n = current * (1 + value / 100); break;
            case 'minus_percent': n = Math.max(0, current * (1 - value / 100)); break;
            case 'set_price':     n = value; break;
            default: return null;
        }
        return Math.round(n);
    }

    // ── Cell change (manual input) ─────────────────────────────
    var cellSaveTimers = {};
    $scope.onCellChange = function (item, pt) {
        var raw = parseThousand(item.new_display[pt.code]);
        item.new[pt.code]         = raw;
        item.new_display[pt.code] = formatThousand(raw);
        item.new_unit[pt.code]    = (raw !== null && item.weight > 0) ? roundSpecial(raw * item.weight) : null;

        if (raw === null) return;

        // Debounce autosave
        var key = item.ig_id + '_' + pt.pr_id;
        if (cellSaveTimers[key]) $timeout.cancel(cellSaveTimers[key]);
        cellSaveTimers[key] = $timeout(function () {
            singleAutoSave(item, pt, raw);
        }, 600);
    };

    function singleAutoSave(item, pt, newPrice) {
        $scope.saveStatus = 'saving';
        priceListService.updateItem(plId, item.ig_id, pt.pr_id, newPrice).then(function () {
            $scope.saveStatus = 'saved';
            item._saved[pt.code] = true;
            $timeout(function () {
                item._saved[pt.code] = false;
                if ($scope.saveStatus === 'saved') $scope.saveStatus = null;
            }, 1500);
        }).catch(function (err) {
            $scope.saveStatus = 'error';
            if (err && err.status === 403) {
                stopHeartbeat();
                $scope.modalLockLost = true;
            } else {
                showToast('Gagal simpan, cek koneksi', 'warning');
            }
        });
    }

    function bulkAutoSave(changes) {
        $scope.saveStatus = 'saving';
        priceListService.bulkUpdate(plId, changes).then(function () {
            $scope.saveStatus = 'saved';
            $timeout(function () { if ($scope.saveStatus === 'saved') $scope.saveStatus = null; }, 1500);
        }).catch(function (err) {
            $scope.saveStatus = 'error';
            if (err && err.status === 403) { stopHeartbeat(); $scope.modalLockLost = true; }
            else { showToast('Bulk save gagal', 'danger'); }
        });
    }

    // ── Lock management ────────────────────────────────────────
    function acquireLock() {
        priceListService.lock(plId).then(function (r) {
            if (r.result && r.result.success) {
                $scope.lockState = 'mine';
                startHeartbeat();
            }
        }).catch(function () {
            showToast('Gagal acquire lock', 'warning');
        });
    }

    $scope.takeOverLock = function () {
        if (!confirm('Ambil alih lock dari ' + (($scope.lockInfo && $scope.lockInfo.locked_by_name) || 'user lain') + '?')) return;
        priceListService.takeOver(plId).then(function () {
            showToast('Lock diambil alih', 'success');
            loadData();
        }).catch(function () {
            showToast('Gagal take over', 'danger');
        });
    };

    var heartbeatTimer = null;
    function startHeartbeat() {
        stopHeartbeat();
        heartbeatTimer = setInterval(function () {
            priceListService.heartbeat(plId).catch(function (err) {
                if (err && err.status === 403) {
                    stopHeartbeat();
                    $scope.$apply(function () { $scope.modalLockLost = true; });
                }
            });
        }, 30000);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    $scope.releaseAndExit = function () {
        stopHeartbeat();
        priceListService.releaseLock(plId).then(function () {
            window.location.href = '/price-list';
        }).catch(function () {
            window.location.href = '/price-list';
        });
    };

    $scope.backToList = function () {
        if ($scope.lockState === 'mine') { $scope.releaseAndExit(); }
        else { window.location.href = '/price-list'; }
    };

    $scope.goBackToList = function () { window.location.href = '/price-list'; };

    // Release lock on page unload
    window.addEventListener('beforeunload', function () {
        if ($scope.lockState === 'mine') {
            var token = localStorage.getItem('accessToken') || '';
            navigator.sendBeacon(
                api.url + 'price-list/' + plId + '/release-lock?accessToken=' + token,
                new Blob([JSON.stringify({})], { type: 'application/json' })
            );
        }
    });

    // ── Post to ERP — rich 3-step flow ──────────────────────────
    $scope.modalPostPreview = null;
    $scope.modalPostConfirm = null;
    $scope.modalPostResult  = null;

    $scope.confirmPostToErp = function () {
        if (!$scope.erpActive) {
            showToast('Belum ada ERP target aktif. Setup di Settings dulu.', 'warning', 5000);
            return;
        }
        $scope.modalPostPreview = {
            loading: true,
            rows: [],
            summary: { total: 0, new: 0, changed: 0, unchanged: 0 },
            diffFilter: { changed: true, new: true, unchanged: false },
        };
        priceListService.postPreview(plId).then(function (r) {
            $scope.modalPostPreview.loading = false;
            $scope.modalPostPreview.rows    = r.result.rows || [];
            $scope.modalPostPreview.summary = r.result.summary || {};
        }).catch(function (err) {
            $scope.modalPostPreview = null;
            var msg = (err && err.data && err.data.message) ? err.data.message : 'Gagal memuat preview';
            showToast(msg, 'danger', 5000);
        });
    };

    $scope.closePostPreview = function () { $scope.modalPostPreview = null; };

    $scope.openPostConfirm = function () {
        $scope.modalPostPreview = null;
        $scope.modalPostConfirm = true;
    };

    $scope.closePostConfirm = function () { $scope.modalPostConfirm = null; };

    $scope.executePostToErp = function () {
        $scope.posting = true;
        $scope.modalPostConfirm = null;
        priceListService.postExecute(plId, $scope.erpActive ? $scope.erpActive.id : null).then(function (r) {
            stopHeartbeat();
            $scope.posting = false;
            var res = r.result || {};
            $scope.modalPostResult = {
                success:           true,
                items_posted:      res.items_posted,
                duration_ms:       res.duration_ms,
                crossCheckLoading: true,
                crossCheck:        null,
                new_open_id:       res.new_open_id,
            };
            priceListService.crossCheck(plId).then(function (cc) {
                if ($scope.modalPostResult) {
                    $scope.modalPostResult.crossCheckLoading = false;
                    $scope.modalPostResult.crossCheck = cc.result || null;
                }
            }).catch(function () {
                if ($scope.modalPostResult) $scope.modalPostResult.crossCheckLoading = false;
            });
        }).catch(function (err) {
            $scope.posting = false;
            var msg = (err && err.data && err.data.message) ? err.data.message : 'Gagal Post to ERP';
            $scope.modalPostResult = { success: false, error: msg };
        });
    };

    $scope.closePostResult = function () {
        var wasSuccess = $scope.modalPostResult && $scope.modalPostResult.success;
        $scope.modalPostResult = null;
        if (wasSuccess) {
            $timeout(function () { window.location.href = '/price-list'; }, 300);
        }
    };

    // ── Export & Log ────────────────────────────────────────────
    $scope.pdfTemplateOptions = [];
    $scope.modalPdfTemplate   = null;

    $scope.dismissSyncNotification = function () { $scope.syncNotification = null; };

    $scope.showSyncedItemsList = function () {
        if (!$scope.syncNotification) return;
        $scope.modalSyncedItems = {
            count: $scope.syncNotification.count || 0,
            items: $scope.syncNotification.items || [],
        };
    };

    $scope.closeSyncedItemsModal = function () { $scope.modalSyncedItems = null; };

    $scope.closePdfTemplateModal = function () { $scope.modalPdfTemplate = null; };

    $scope.showPdfTemplateModal = function () {
        if (!$scope.pl) return;
        pdfTemplateService.list($scope.pl.cat_id).then(function (r) {
            $scope.pdfTemplateOptions = r.result || [];
            $scope.modalPdfTemplate   = true;
        }).catch(function () { showToast('Gagal memuat template PDF', 'danger'); });
    };

    $scope.exportPdfWithTemplate = function (key) {
        pdfTemplateService.render(key, plId);
        $scope.modalPdfTemplate = null;
    };

    $scope.exportPdf = $scope.showPdfTemplateModal;
    $scope.exportExcel = function () {
        showToast('Mengunduh Excel...', 'info');
        priceListService.exportExcel(plId);
    };

    $scope.showLog = function () {
        if (!plId) return;
        $scope.modalLog = { entries: [], loading: true };
        priceListService.getLog(plId, 100, 0).then(function (r) {
            $scope.modalLog.entries = r.result || [];
            $scope.modalLog.loading = false;
        }).catch(function () {
            $scope.modalLog.loading = false;
            showToast('Gagal memuat log', 'danger');
        });
    };

    $scope.closeLog = function () { $scope.modalLog = null; };

    $scope.isFilterChecked = function (dim, label) {
        return ($scope.activeFilters[dim] || []).indexOf(label) >= 0;
    };
    $scope.toggleFilter = function (dim, label) {
        var arr = $scope.activeFilters[dim];
        var idx = arr.indexOf(label);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(label);
        applyFilter();
    };
    $scope.selectAllFilter = function (dim) {
        $scope.activeFilters[dim] = ($scope.filterOptions[dim] || []).map(function (o) { return o.label; });
        applyFilter();
    };
    $scope.clearFilter = function (dim) {
        $scope.activeFilters[dim] = [];
        applyFilter();
    };
    $scope.clearAllFilters = function () {
        $scope.activeFilters = { subcategory: [], tebal: [], merk: [], grade: [] };
        applyFilter();
    };
    $scope.selectedFilterCount = function (dim) { return ($scope.activeFilters[dim] || []).length; };
    $scope.hasActiveFilters = function () {
        return $scope.selectedFilterCount('subcategory') +
               $scope.selectedFilterCount('tebal') +
               $scope.selectedFilterCount('merk') +
               $scope.selectedFilterCount('grade') > 0;
    };
    $scope.filteredItemCount = function () { return ($scope.filteredItems || []).length; };
    $scope.totalItemCount    = function () { return ($scope.items || []).length; };
    $scope.checkAllFiltered  = function () {
        ($scope.filteredItems || []).forEach(function (it) { it._checked = true; });
        $scope.selection.all = $scope.filteredItems.every(function (i) { return i._checked; });
    };
    $scope.toggleEditTebal = function (item) {
        item._editingTebal = !item._editingTebal;
        if (item._editingTebal) item._tebalDraft = item.tebal;
    };
    $scope.saveTebal = function (item) {
        itemDimensionsService.updateTebal(item.ig_id, item._tebalDraft || null).then(function () {
            item.tebal          = item._tebalDraft ? parseFloat(item._tebalDraft) : null;
            item.tebal_label    = item.tebal ? String(parseFloat(item.tebal.toFixed(3))).replace(/\.?0+$/, '') + ' mm' : '(tidak terdeteksi)';
            item.is_tebal_manual = true;
            item._editingTebal  = false;
            $scope.unassignedCount = $scope.items.filter(function (it) { return !it.tebal && it.tebal !== 0; }).length;
            $scope.filterOptions = buildFilterOptions($scope.items);
            applyFilter();
            showToast('Tebal disimpan', 'success');
        }).catch(function (err) {
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };
    $scope.scrollToFirstUnassigned = function () {
        $timeout(function () {
            var row = document.querySelector('.row-needs-tebal');
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };
    $scope.closeFilterPanels = function () {
        $scope.filterOpen = { subcategory: false, tebal: false, merk: false, grade: false };
    };

    // Init
    loadData();
});
