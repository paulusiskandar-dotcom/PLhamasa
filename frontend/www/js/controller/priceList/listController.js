plmApp.controller('priceListListController', function ($scope, $timeout, priceListService, $masterService) {

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    $scope.filterCatId = '';
    $scope.lists = [];
    $scope.groupedLists = [];
    $scope.categories = [];
    $scope.categoriesAvailable = [];
    $scope.loading = false;
    $scope.toast = { show: false, message: '', type: 'info' };
    $scope.modalStart = null;
    $scope.modalDetail = null;
    $scope.modalLog = null;

    function showToast(msg, type) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, 3000);
    }

    function loadCategories() {
        $masterService.getCategories().then(function (res) {
            $scope.categories = res.result || [];
            updateCategoriesAvailable();
        }).catch(function () {
            showToast('Gagal memuat daftar kategori', 'danger');
        });
    }

    function updateCategoriesAvailable() {
        var openCatIds = {};
        ($scope.lists || []).forEach(function (pl) {
            if (pl.status === 'OPEN') openCatIds[pl.cat_id] = true;
        });
        $scope.categoriesAvailable = ($scope.categories || []).filter(function (c) {
            return !openCatIds[c.id];
        });
    }

    function groupByCategory(lists) {
        var groups = {};
        (lists || []).forEach(function (pl) {
            var key = pl.cat_id;
            if (!groups[key]) {
                groups[key] = {
                    cat_id: pl.cat_id,
                    cat_name: pl.cat_name,
                    records: [],
                    has_open: false
                };
            }
            groups[key].records.push(pl);
            if (pl.status === 'OPEN') groups[key].has_open = true;
        });
        Object.keys(groups).forEach(function (k) {
            groups[k].records.sort(function (a, b) {
                if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1;
                return b.revision_no - a.revision_no;
            });
        });
        var arr = Object.keys(groups).map(function (k) { return groups[k]; });
        arr.sort(function (a, b) { return a.cat_name.localeCompare(b.cat_name); });
        return arr;
    }

    $scope.loadList = function () {
        $scope.loading = true;
        var catId = $scope.filterCatId || null;
        priceListService.list(catId).then(function (res) {
            $scope.lists = res.result || [];
            $scope.groupedLists = groupByCategory($scope.lists);
            updateCategoriesAvailable();
            $scope.loading = false;
        }).catch(function () {
            $scope.loading = false;
            showToast('Gagal memuat data', 'danger');
        });
    };

    $scope.showStartModal = function () {
        $scope.modalStart = { catId: '' };
    };

    $scope.startNew = function (catId, catName) {
        $scope.loading = true;
        priceListService.start(catId).then(function (res) {
            showToast('Price List baru dibuat untuk ' + catName, 'success');
            $scope.modalStart = null;
            $scope.loadList();
        }).catch(function (err) {
            $scope.loading = false;
            var msg = (err.data && err.data.message) ? err.data.message : 'Gagal membuat Price List';
            showToast(msg, 'danger');
        });
    };

    $scope.confirmStartNew = function () {
        if (!$scope.modalStart || !$scope.modalStart.catId) return;
        var cat = ($scope.categories || []).find(function (c) {
            return String(c.id) === String($scope.modalStart.catId);
        });
        $scope.startNew($scope.modalStart.catId, cat ? cat.name : $scope.modalStart.catId);
    };

    $scope.continueEdit = function (pl) {
        window.location.href = '/edit/' + pl.id;
    };

    $scope.showDetail = function (pl) {
        priceListService.get(pl.id).then(function (res) {
            $scope.modalDetail = res.result;
        }).catch(function () {
            showToast('Gagal memuat detail', 'danger');
        });
    };

    $scope.showLog = function (pl) {
        $scope.modalLog = {
            cat_name: pl.cat_name,
            revision_no: pl.revision_no,
            pl_id: pl.id,
            entries: [],
            loading: true,
        };
        priceListService.getLog(pl.id, 50, 0).then(function (res) {
            $scope.modalLog.entries = res.result || [];
            $scope.modalLog.loading = false;
        }).catch(function () {
            $scope.modalLog.loading = false;
            showToast('Gagal memuat log', 'danger');
        });
    };

    $scope.closeLog = function () {
        $scope.modalLog = null;
    };

    $scope.exportPdf = function (pl) {
        showToast('Export PDF coming soon', 'info');
    };

    $scope.exportExcel = function (pl) {
        showToast('Export Excel coming soon', 'info');
    };

    // Init
    loadCategories();
    $scope.loadList();
});
