plmApp.controller('editGroupedController', function ($scope, $http, $timeout, priceListService, groupService) {

    var plId = window.plmPageData && window.plmPageData.priceListId;
    $scope.priceListId = plId;

    $scope.pl               = {};
    $scope.groups           = [];
    $scope.undetectedItems  = [];
    $scope.searchQuery      = '';
    $scope.sortGroup        = 'thickness_asc';
    $scope.isExtendedCategory = false;
    $scope.loading          = true;
    $scope.showUndetected   = false;
    $scope.modalCreateGroup = null;
    $scope.modalMoveItem    = null;
    $scope.toast            = { show: false, message: '', type: 'info' };
    $scope.detection      = { new_items: [], removed_items: [], available_groups: [] };
    $scope.modalReview    = null;
    $scope.modalValidation = null;

    $scope.priceTypes   = [];
    $scope.modifierTypes = [
        { id: 'plus_nominal',  label: '+ Rp'    },
        { id: 'minus_nominal', label: '- Rp'    },
        { id: 'plus_percent',  label: '+ %'     },
        { id: 'minus_percent', label: '- %'     },
        { id: 'set_price',     label: '= Harga' },
    ];
    $scope.modifier = { type: 'plus_nominal', value: '', targets: {} };

    var saveTimers = {};

    function showToast(msg, type, dur) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, dur || 3000);
    }

    function roundSpecial(raw) {
        if (!raw || raw <= 0) return 0;
        var sisa = Math.round(raw) % 100;
        return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
    }

    function loadAll() {
        $scope.loading = true;
        priceListService.get(plId).then(function (r) {
            $scope.pl = r.result;
            $scope.priceTypes = r.result.priceTypes || [];
            $scope.isExtendedCategory = $scope.priceTypes.length > 2;
            $scope.modifier.targets = {};
            $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = false; });
            return groupService.getGroups(plId);
        }).then(function (r) {
            var groups = r.result || [];
            groups.forEach(function (g) {
                g._expanded      = false;
                g._itemSort      = 'i_weight';
                g._itemSortReverse = false;
                g._saving        = false;
                g._saved         = false;
            });
            $scope.groups = groups;
            return $http.get(api.url + 'price-list/' + plId + '/group/new-items');
        }).then(function (r) {
            $scope.undetectedItems = (r.data.result || []).filter(function (it) {
                return it.suggested_group_id === null;
            });
            $scope.loadDetection();
            $scope.loading = false;
        }).catch(function (err) {
            $scope.loading = false;
            showToast((err && err.data && err.data.message) || 'Gagal memuat data', 'danger');
        });
    }

    $scope.totalItemCount = function () {
        return $scope.groups.reduce(function (sum, g) { return sum + g.items.length; }, 0);
    };

    $scope.toggleGroup = function (g) { g._expanded = !g._expanded; };

    $scope.setSortItem = function (g, field) {
        if (g._itemSort === field) {
            g._itemSortReverse = !g._itemSortReverse;
        } else {
            g._itemSort = field;
            g._itemSortReverse = false;
        }
    };

    $scope.getItemSortClass = function (g, field) {
        if (g._itemSort !== field) return '';
        return g._itemSortReverse ? 'sort-desc' : 'sort-asc';
    };

    $scope.onGroupPriceChange = function (g) {
        g._saved = false;
        if (saveTimers[g.id]) { $timeout.cancel(saveTimers[g.id]); }
        saveTimers[g.id] = $timeout(function () { saveGroupPrice(g); }, 500);
    };

    function saveGroupPrice(g) {
        g._saving = true;
        var prices = {
            cash_gudang_kg:   parseFloat(g.cash_gudang_kg)   || 0,
            cash_pabrik_kg:   parseFloat(g.cash_pabrik_kg)   || 0,
            kredit_gudang_kg: parseFloat(g.kredit_gudang_kg) || 0,
            kredit_pabrik_kg: parseFloat(g.kredit_pabrik_kg) || 0,
        };
        groupService.updatePrice(g.id, prices).then(function () {
            g.items.forEach(function (it) {
                it.cash_gudang_lbr   = roundSpecial((parseFloat(g.cash_gudang_kg)   || 0) * it.i_weight);
                it.cash_pabrik_lbr   = roundSpecial((parseFloat(g.cash_pabrik_kg)   || 0) * it.i_weight);
                it.kredit_gudang_lbr = roundSpecial((parseFloat(g.kredit_gudang_kg) || 0) * it.i_weight);
                it.kredit_pabrik_lbr = roundSpecial((parseFloat(g.kredit_pabrik_kg) || 0) * it.i_weight);
            });
            g._saving = false;
            g._saved  = true;
            $timeout(function () { g._saved = false; }, 2000);
        }).catch(function (err) {
            g._saving = false;
            showToast('Gagal save: ' + ((err.data && err.data.message) || err.message || ''), 'danger');
        });
    }

    $scope.openCreateGroupModal = function () {
        $scope.modalCreateGroup = { thickness: '', executing: false };
    };
    $scope.closeCreateGroupModal = function () {
        if ($scope.modalCreateGroup && $scope.modalCreateGroup.executing) return;
        $scope.modalCreateGroup = null;
    };
    $scope.executeCreateGroup = function () {
        $scope.modalCreateGroup.executing = true;
        var thickness = parseFloat($scope.modalCreateGroup.thickness);
        groupService.createGroup(plId, thickness).then(function () {
            showToast('Group dibuat', 'success');
            $scope.modalCreateGroup = null;
            loadAll();
        }).catch(function (err) {
            $scope.modalCreateGroup.executing = false;
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.openMoveItemModal = function (item, fromGroup) {
        $scope.modalMoveItem = { item: item, fromGroup: fromGroup, toGroupId: '' };
    };
    $scope.closeMoveItemModal = function () { $scope.modalMoveItem = null; };
    $scope.executeMoveItem = function () {
        var m        = $scope.modalMoveItem;
        var toGroupId = parseInt(m.toGroupId, 10);
        groupService.moveItem(plId, m.item.ig_id, m.fromGroup.id, toGroupId).then(function () {
            showToast('Item dipindahkan', 'success');
            $scope.modalMoveItem = null;
            loadAll();
        }).catch(function (err) {
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.assignUndetected = function (item) {
        if (!item._selectedGroup || item._selectedGroup === '__new__') return;
        var groupId = parseInt(item._selectedGroup, 10);
        $http.post(api.url + 'price-list/' + plId + '/group/confirm-new-item', {
            ig_id: item.ig_id, group_id: groupId
        }).then(function () {
            showToast('Item di-assign ke group', 'success');
            loadAll();
        }).catch(function (err) {
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.onUndetectedGroupChange = function (it) {
        if (it._selectedGroup && it._selectedGroup !== '__new__') {
            $scope.assignUndetected(it);
        }
    };

    $scope.cancelCreateNew = function (it) {
        it._selectedGroup  = '';
        it._newThickness   = '';
    };

    $scope.executeCreateAndAssign = function (it) {
        var thickness = parseFloat(it._newThickness);
        if (!thickness || isNaN(thickness)) {
            showToast('Tebal tidak valid', 'warning');
            return;
        }
        it._creating = true;
        groupService.createGroup(plId, thickness).then(function (r) {
            var newGroupId = r.result.id;
            return $http.post(api.url + 'price-list/' + plId + '/group/confirm-new-item', {
                ig_id: it.ig_id, group_id: newGroupId
            });
        }).then(function () {
            showToast('Group ' + thickness + ' mm dibuat & item di-assign', 'success');
            it._creating = false;
            loadAll();
        }).catch(function (err) {
            it._creating = false;
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.goBack = function () { window.location.href = '/price-list'; };

    // ── Modifier ──────────────────────────────────────────────
    $scope.selectAllTargets = function () {
        $scope.priceTypes.forEach(function (pt) { $scope.modifier.targets[pt.code] = true; });
    };

    $scope.selectGudangTargets = function () {
        $scope.priceTypes.forEach(function (pt) {
            $scope.modifier.targets[pt.code] = pt.group === 'Gudang';
        });
    };

    $scope.selectPabrikTargets = function () {
        $scope.priceTypes.forEach(function (pt) {
            $scope.modifier.targets[pt.code] = pt.group === 'Pabrik';
        });
    };

    $scope.toggleSelectAllGroups = function () {
        var newState = !$scope.allGroupsChecked();
        $scope.groups.forEach(function (g) { g._checked = newState; });
    };

    $scope.allGroupsChecked = function () {
        return $scope.groups.length > 0 && $scope.groups.every(function (g) { return g._checked; });
    };

    $scope.selectedGroupCount = function () {
        return $scope.groups.filter(function (g) { return g._checked; }).length;
    };

    $scope.hasSelectedGroups = function () { return $scope.selectedGroupCount() > 0; };

    function parseModifierValue(str) {
        if (!str || str === '') return null;
        var n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? null : n;
    }

    function computeModifiedPrice(type, current, value) {
        var result;
        switch (type) {
            case 'plus_nominal':  result = current + value; break;
            case 'minus_nominal': result = Math.max(0, current - value); break;
            case 'plus_percent':  result = current * (1 + value / 100); break;
            case 'minus_percent': result = Math.max(0, current * (1 - value / 100)); break;
            case 'set_price':     result = value; break;
            default:              result = current;
        }
        return Math.round(result);
    }

    $scope.applyModifier = function () {
        var targets = $scope.priceTypes.filter(function (pt) { return $scope.modifier.targets[pt.code]; });
        if (!targets.length) { showToast('Pilih minimal 1 target harga', 'warning'); return; }

        var rawVal = parseModifierValue($scope.modifier.value);
        if (rawVal === null) { showToast('Masukkan nilai modifier yang valid', 'warning'); return; }

        var selectedGroups = $scope.groups.filter(function (g) { return g._checked; });
        if (!selectedGroups.length) { showToast('Pilih minimal 1 group', 'warning'); return; }

        selectedGroups.forEach(function (g) {
            targets.forEach(function (pt) {
                var fieldKey = pt.code + '_kg';
                var current  = parseFloat(g[fieldKey]) || 0;
                g[fieldKey]  = computeModifiedPrice($scope.modifier.type, current, rawVal);
            });
            $scope.onGroupPriceChange(g);
        });

        showToast(
            'Diterapkan ke ' + selectedGroups.length + ' group (' + targets.length + ' target)',
            'success'
        );
        $scope.modifier.value = '';
    };

    $scope.loadDetection = function () {
        groupService.detectChanges(plId).then(function (r) {
            $scope.detection = r.result || { new_items: [], removed_items: [], available_groups: [] };
        }).catch(function () {});
    };

    $scope.openReviewModal = function () {
        var items = ($scope.detection.new_items || []).map(function (it) {
            return {
                ig_id:              it.ig_id,
                i_name:             it.i_name,
                i_weight:           it.i_weight,
                detected_thickness: it.detected_thickness,
                suggested_group_id: it.suggested_group_id,
                can_create_group:   it.can_create_group,
                _selectedGroupId:   it.suggested_group_id ? String(it.suggested_group_id) : '',
                _createNew:         false,
                _skipped:           false,
            };
        });
        $scope.modalReview = {
            items:            items,
            available_groups: $scope.detection.available_groups || [],
            executing:        false,
        };
    };

    $scope.closeReviewModal = function () {
        if ($scope.modalReview && $scope.modalReview.executing) return;
        $scope.modalReview = null;
    };

    $scope.toggleSkip = function (it) {
        it._skipped = !it._skipped;
        if (it._skipped) { it._selectedGroupId = ''; it._createNew = false; }
    };

    $scope.onCreateNewToggle = function (it) {
        if (it._createNew) { it._selectedGroupId = ''; }
    };

    $scope.countAutoSuggested = function () {
        if (!$scope.modalReview) return 0;
        return $scope.modalReview.items.filter(function (it) { return it.suggested_group_id !== null; }).length;
    };

    $scope.countNeedManual = function () {
        if (!$scope.modalReview) return 0;
        return $scope.modalReview.items.filter(function (it) { return it.suggested_group_id === null; }).length;
    };

    $scope.countToConfirm = function () {
        if (!$scope.modalReview) return 0;
        return $scope.modalReview.items.filter(function (it) {
            return !it._skipped && (it._selectedGroupId || it._createNew);
        }).length;
    };

    $scope.canConfirm = function () { return $scope.countToConfirm() > 0; };

    $scope.executeBatchConfirm = function () {
        $scope.modalReview.executing = true;
        var assignments = $scope.modalReview.items
            .filter(function (it) { return !it._skipped && (it._selectedGroupId || it._createNew); })
            .map(function (it) {
                return {
                    ig_id:                it.ig_id,
                    group_id:             it._selectedGroupId ? parseInt(it._selectedGroupId, 10) : null,
                    create_new_thickness: it._createNew ? it.detected_thickness : null,
                };
            });
        groupService.confirmBatch(plId, assignments).then(function (r) {
            var msg = 'Berhasil assign ' + r.result.assigned_count + ' item';
            if (r.result.created_groups > 0) msg += ' (' + r.result.created_groups + ' group baru)';
            showToast(msg, 'success');
            $scope.modalReview = null;
            loadAll();
        }).catch(function (err) {
            $scope.modalReview.executing = false;
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.deleteGroup = function (g) {
        if (g.items.length > 0) { showToast('Group tidak kosong, tidak bisa dihapus', 'warning'); return; }
        if (!confirm('Hapus group ' + g.thickness_label + '?')) return;
        groupService.deleteEmptyGroup(g.id).then(function () {
            showToast('Group dihapus', 'success');
            loadAll();
        }).catch(function (err) {
            showToast('Gagal: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.initiatePostToErp = function () {
        groupService.validatePost(plId).then(function (r) {
            $scope.modalValidation = r.result;
        }).catch(function (err) {
            showToast('Gagal validasi: ' + ((err.data && err.data.message) || ''), 'danger');
        });
    };

    $scope.closeValidationModal = function () { $scope.modalValidation = null; };

    $scope.proceedToPost = function () {
        $scope.modalValidation = null;
        window.location.href = '/edit/' + plId;
    };

    loadAll();
});
