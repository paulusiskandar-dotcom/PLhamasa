plmApp.controller('editGroupedController', function ($scope, $http, $timeout, priceListService, groupService) {

    var plId = window.plmPageData && window.plmPageData.priceListId;

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
            $scope.isExtendedCategory = (r.result.priceTypes || []).length > 2;
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
        if (!item._selectedGroup) return;
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

    $scope.goBack = function () { window.location.href = '/price-list'; };

    loadAll();
});
