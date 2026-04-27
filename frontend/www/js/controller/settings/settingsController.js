plmApp.controller('settingsController', function ($scope, $http, $timeout, $masterService, subcategoryService, erpTargetService, pdfTemplateService, blacklistService) {

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    var userInfo = {};
    try { userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}'); } catch (e) {}
    $scope.isSuperadmin = userInfo.role === 'superadmin';

    $scope.toast = { show: false, message: '', type: 'info' };
    function showToast(msg, type, duration) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, duration || 3000);
    }

    // ── State ──────────────────────────────────────────────────
    $scope.categories = [];
    $scope.extendedSelection = {};
    $scope.extendedDirty = false;
    var _extOriginal = {};

    $scope.subcatFilter = '';
    $scope.subcategories = [];
    $scope.modalSubcat = null;
    $scope.modalSubcatItems = null;

    $scope.erpTargets = [];
    $scope.modalErp = null;

    // ── Init ───────────────────────────────────────────────────
    function init() {
        $masterService.getCategories().then(function (r) {
            $scope.categories = r.result || [];
            loadExtendedSetting();
        }).catch(function () {
            showToast('Gagal memuat kategori', 'danger');
        });

        if ($scope.isSuperadmin) {
            loadErpTargets();
        }
    }

    function loadExtendedSetting() {
        $http.get(api.url + 'settings/extended-categories').then(function (r) {
            var data = r.data.result || {};
            // API returns { cat_ids: [...], categories: [...] }
            var ids = Array.isArray(data) ? data : (data.cat_ids || []);
            _extOriginal = {};
            $scope.extendedSelection = {};
            ids.forEach(function (id) {
                _extOriginal[String(id)] = true;
                $scope.extendedSelection[String(id)] = true;
            });
            $scope.extendedDirty = false;
        }).catch(function () {
            showToast('Gagal load pengaturan', 'danger');
        });
    }

    $scope.markExtendedDirty = function () { $scope.extendedDirty = true; };

    $scope.resetExtended = function () {
        $scope.extendedSelection = angular.copy(_extOriginal);
        $scope.extendedDirty = false;
    };

    $scope.saveExtended = function () {
        var ids = Object.keys($scope.extendedSelection)
            .filter(function (k) { return $scope.extendedSelection[k]; });
        $http.post(api.url + 'settings/extended-categories', { cat_ids: ids })
            .then(function () {
                showToast('Pengaturan disimpan', 'success');
                _extOriginal = angular.copy($scope.extendedSelection);
                $scope.extendedDirty = false;
            })
            .catch(function () { showToast('Gagal simpan', 'danger'); });
    };

    // ── Subcategory ────────────────────────────────────────────
    $scope.loadSubcategories = function () {
        if (!$scope.subcatFilter) { $scope.subcategories = []; return; }
        subcategoryService.getByCategory($scope.subcatFilter).then(function (r) {
            $scope.subcategories = r.result || [];
        }).catch(function () {
            showToast('Gagal memuat subkategori', 'danger');
        });
    };

    $scope.showAddSubcat = function () { $scope.modalSubcat = { editing: false, name: '' }; };
    $scope.renameSubcat = function (sub) { $scope.modalSubcat = { editing: true, id: sub.id, name: sub.name }; };

    $scope.saveSubcat = function () {
        var name = ($scope.modalSubcat.name || '').trim();
        if (!name) return;
        var p = $scope.modalSubcat.editing
            ? subcategoryService.update($scope.modalSubcat.id, name)
            : subcategoryService.create($scope.subcatFilter, name);
        p.then(function () {
            showToast('Subkategori disimpan', 'success');
            $scope.modalSubcat = null;
            $scope.loadSubcategories();
        }).catch(function (err) {
            var msg = (err.data && err.data.message) || 'Gagal simpan';
            showToast(msg, 'danger');
        });
    };

    $scope.deleteSubcat = function (sub) {
        if (!confirm('Hapus "' + sub.name + '"?')) return;
        subcategoryService.remove(sub.id).then(function () {
            showToast('Dihapus', 'success');
            $scope.loadSubcategories();
        }).catch(function () { showToast('Gagal hapus', 'danger'); });
    };

    $scope.manageSubcatItems = function (sub) {
        $scope.modalSubcatItems = { subcat: sub, items: [], checked: {}, search: '', loading: true };

        // Load items from ERP for this category, then get assignments
        $http.get(api.url + 'items', { params: { cat_id: $scope.subcatFilter } })
            .then(function (r) {
                var rawItems = r.data.result || [];
                return subcategoryService.getAssignments($scope.subcatFilter).then(function (ra) {
                    var assignments = ra.result || {};
                    var subcatNameMap = {};
                    $scope.subcategories.forEach(function (s) { subcatNameMap[s.id] = s.name; });

                    var checked = {};
                    var items = rawItems.map(function (it) {
                        var assignedTo = assignments[it.ig_id] ? parseInt(assignments[it.ig_id]) : null;
                        if (assignedTo === sub.id) checked[it.ig_id] = true;
                        return {
                            ig_id: it.ig_id,
                            name: it.name || it.i_name || ('Item ' + it.ig_id),
                            assignedTo: assignedTo,
                            assignedToName: assignedTo ? (subcatNameMap[assignedTo] || '') : null,
                        };
                    });

                    $scope.modalSubcatItems.items = items;
                    $scope.modalSubcatItems.checked = checked;
                    $scope.modalSubcatItems.loading = false;
                });
            }).catch(function () {
                $scope.modalSubcatItems.loading = false;
                showToast('Gagal memuat items', 'danger');
            });
    };

    $scope.saveSubcatItems = function () {
        var igIds = Object.keys($scope.modalSubcatItems.checked)
            .filter(function (k) { return $scope.modalSubcatItems.checked[k]; })
            .map(Number);
        subcategoryService.assignItems($scope.modalSubcatItems.subcat.id, igIds).then(function () {
            showToast('Assignment disimpan', 'success');
            $scope.modalSubcatItems = null;
            $scope.loadSubcategories();
        }).catch(function () { showToast('Gagal simpan', 'danger'); });
    };

    // ── ERP Target ─────────────────────────────────────────────
    function loadErpTargets() {
        erpTargetService.list().then(function (r) {
            $scope.erpTargets = r.result || [];
        }).catch(function () { showToast('Gagal memuat ERP targets', 'danger'); });
    }

    $scope.showAddErp = function () {
        $scope.modalErp = {
            editing: false,
            data: { name: '', host: '', port: 5432, db_name: '', db_user: '', db_password: '', note: '' },
            testResult: null,
        };
    };

    $scope.editErp = function (erp) {
        $scope.modalErp = {
            editing: true, id: erp.id,
            data: { name: erp.name, host: erp.host, port: erp.port, db_name: erp.db_name, db_user: erp.db_user, db_password: '', note: erp.note || '' },
            testResult: null,
        };
    };

    $scope.testErpModal = function () {
        $scope.modalErp.testResult = null;
        erpTargetService.testConnection($scope.modalErp.data).then(function (r) {
            $scope.modalErp.testResult = r.result || r;
        }).catch(function (err) {
            $scope.modalErp.testResult = { success: false, error: (err.data && err.data.message) || 'Connection failed' };
        });
    };

    $scope.saveErp = function () {
        var d = $scope.modalErp.data;
        if (!d.name || !d.host || !d.db_name || !d.db_user) {
            showToast('Lengkapi field wajib (Nama, Host, Database, Username)', 'warning');
            return;
        }
        var p = $scope.modalErp.editing
            ? erpTargetService.update($scope.modalErp.id, d)
            : erpTargetService.create(d);
        p.then(function () {
            showToast('ERP target disimpan', 'success');
            $scope.modalErp = null;
            loadErpTargets();
        }).catch(function (err) {
            var msg = (err.data && err.data.message) || 'Gagal simpan';
            showToast(msg, 'danger');
        });
    };

    $scope.activateErp = function (erp) {
        if (!confirm('Aktifkan "' + erp.name + '"?\nERP target lain akan dinonaktifkan.')) return;
        erpTargetService.activate(erp.id).then(function () {
            showToast('Diaktifkan', 'success');
            loadErpTargets();
        }).catch(function () { showToast('Gagal aktifkan', 'danger'); });
    };

    $scope.testErp = function (erp) {
        showToast('Testing...', 'info');
        erpTargetService.testConnection({ host: erp.host, port: erp.port, db_name: erp.db_name, db_user: erp.db_user, db_password: '' }).then(function (r) {
            var res = r.result || r;
            if (res.success) {
                showToast('Connect berhasil — ' + res.version, 'success', 5000);
            } else {
                showToast('Gagal: ' + res.error, 'danger', 5000);
            }
        }).catch(function () { showToast('Test gagal', 'danger'); });
    };

    $scope.deleteErp = function (erp) {
        if (erp.is_active) { showToast('Tidak bisa hapus target yang aktif', 'warning'); return; }
        if (!confirm('Hapus "' + erp.name + '"?')) return;
        erpTargetService.remove(erp.id).then(function () {
            showToast('Dihapus', 'success');
            loadErpTargets();
        }).catch(function () { showToast('Gagal hapus', 'danger'); });
    };

    // ── Blacklist ───────────────────────────────────────────────
    $scope.blTab            = 'add';
    $scope.blFilter         = { catId: '', search: '' };
    $scope.blAvailableItems = [];
    $scope.blacklistData    = [];
    $scope.blSelection      = { all: false };
    $scope.modalAddBl       = null;
    $scope.modalRemoveBl    = null;
    var blSearchTimer       = null;

    $scope.searchBlItems = function () {
        if (!$scope.blFilter.catId) { $scope.blAvailableItems = []; return; }
        blacklistService.itemsForCategory($scope.blFilter.catId, $scope.blFilter.search).then(function (r) {
            $scope.blAvailableItems = (r.result || []).map(function (it) {
                return Object.assign({}, it, { _selected: false });
            });
            $scope.blSelection.all = false;
        }).catch(function () { showToast('Gagal memuat items', 'danger'); });
    };

    $scope.searchBlItemsDebounced = function () {
        if (blSearchTimer) clearTimeout(blSearchTimer);
        blSearchTimer = setTimeout(function () { $scope.$apply($scope.searchBlItems); }, 300);
    };

    $scope.toggleBlSelectAll = function () {
        $scope.blAvailableItems.forEach(function (it) { it._selected = $scope.blSelection.all; });
    };

    $scope.updateBlSelectionAll = function () {
        $scope.blSelection.all = $scope.blAvailableItems.every(function (it) { return it._selected; });
    };

    $scope.blSelectedCount = function () {
        return $scope.blAvailableItems.filter(function (it) { return it._selected; }).length;
    };

    $scope.confirmAddBlacklist = function () {
        var selected = $scope.blAvailableItems.filter(function (it) { return it._selected; });
        if (!selected.length) return;
        $scope.modalAddBl = { count: selected.length, items: selected, reason: '' };
    };

    $scope.executeAddBlacklist = function () {
        var igIds  = $scope.modalAddBl.items.map(function (it) { return it.ig_id; });
        var reason = $scope.modalAddBl.reason;
        blacklistService.add(igIds, reason).then(function (r) {
            showToast((r.result.added || 0) + ' item ditambahkan ke blacklist', 'success');
            $scope.modalAddBl = null;
            $scope.searchBlItems();
            $scope.blacklistData = [];
        }).catch(function () { showToast('Gagal menambah blacklist', 'danger'); });
    };

    $scope.loadBlacklist = function () {
        blacklistService.list().then(function (r) {
            $scope.blacklistData = r.result || [];
        }).catch(function () { showToast('Gagal memuat blacklist', 'danger'); });
    };

    $scope.confirmRemoveBl = function (item) { $scope.modalRemoveBl = item; };

    $scope.executeRemoveBlacklist = function () {
        blacklistService.remove($scope.modalRemoveBl.ig_id).then(function () {
            showToast('Item dihapus dari blacklist', 'success');
            $scope.modalRemoveBl = null;
            $scope.loadBlacklist();
        }).catch(function () { showToast('Gagal menghapus dari blacklist', 'danger'); });
    };

    // ── PDF Template Custom Fields ──────────────────────────────
    $scope.pdfTemplates    = [];
    $scope.pdfTplKey       = '';
    $scope.pdfTplData      = null;
    $scope.pdfTplDirty     = false;
    $scope.pdfTplSaving    = false;
    $scope.pdfTplLastSaved = null;
    $scope.pdfTplOriginal  = {};

    function loadPdfTemplates() {
        pdfTemplateService.list().then(function (r) {
            $scope.pdfTemplates = r.result || [];
        }).catch(function () {});
    }

    $scope.loadPdfTpl = function () {
        if (!$scope.pdfTplKey) { $scope.pdfTplData = null; return; }
        // cat_id is now resolved server-side — pass null, backend resolves from template cat_name
        pdfTemplateService.getItems($scope.pdfTplKey, null).then(function (r) {
            $scope.pdfTplData = r.result;
            $scope.pdfTplOriginal = {};
            ($scope.pdfTplData.items || []).forEach(function (it) {
                $scope.pdfTplOriginal[it.ig_id] = Object.assign({}, it.custom_values);
            });
            $scope.pdfTplDirty     = false;
            $scope.pdfTplLastSaved = null;
        }).catch(function (err) {
            var msg = (err && err.data && err.data.message) ? err.data.message : 'Gagal memuat data template';
            showToast(msg, 'danger');
        });
    };

    $scope.markPdfDirty = function () {
        $scope.pdfTplDirty     = true;
        $scope.pdfTplLastSaved = null;
    };

    $scope.savePdfTplAll = function () {
        if (!$scope.pdfTplData || $scope.pdfTplSaving) return;
        $scope.pdfTplSaving = true;

        var changes = [];
        ($scope.pdfTplData.items || []).forEach(function (item) {
            var orig = $scope.pdfTplOriginal[item.ig_id] || {};
            var curr = item.custom_values || {};
            ($scope.pdfTplData.template.custom_fields || []).forEach(function (f) {
                if ((orig[f.key] || '') !== (curr[f.key] || '')) {
                    changes.push({ ig_id: item.ig_id, field_key: f.key, value: curr[f.key] || '' });
                }
            });
        });

        if (!changes.length) {
            $scope.pdfTplSaving = false;
            $scope.pdfTplDirty  = false;
            return;
        }

        Promise.all(changes.map(function (c) {
            return pdfTemplateService.setValue($scope.pdfTplKey, c.ig_id, c.field_key, c.value);
        })).then(function () {
            $scope.$apply(function () {
                ($scope.pdfTplData.items || []).forEach(function (it) {
                    $scope.pdfTplOriginal[it.ig_id] = Object.assign({}, it.custom_values);
                });
                $scope.pdfTplDirty     = false;
                $scope.pdfTplSaving    = false;
                $scope.pdfTplLastSaved = new Date();
                showToast('Tersimpan ' + changes.length + ' perubahan', 'success');
            });
        }).catch(function () {
            $scope.$apply(function () {
                $scope.pdfTplSaving = false;
                showToast('Gagal menyimpan beberapa perubahan', 'danger');
            });
        });
    };

    init();
    loadPdfTemplates();
});
