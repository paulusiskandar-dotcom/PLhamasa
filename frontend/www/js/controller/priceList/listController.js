plmApp.controller('priceListListController', function ($scope, $timeout, priceListService, $masterService, pdfTemplateService) {

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    $scope.filter = { catId: '', status: '', sortBy: 'default' };
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

    function wrapAsSingleGroup(records) {
        if (!records.length) return [];
        return [{ cat_id: null, cat_name: 'Semua', records: records, has_open: false, flat: true }];
    }

    $scope.applyFilterSort = function () {
        var f = $scope.filter;
        var data = ($scope.lists || []).slice();

        if (f.catId)   data = data.filter(function (pl) { return String(pl.cat_id) === String(f.catId); });
        if (f.status)  data = data.filter(function (pl) { return pl.status === f.status; });

        switch (f.sortBy) {
            case 'created_desc':
                data.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
                $scope.groupedLists = wrapAsSingleGroup(data);
                break;
            case 'updated_desc':
                data.sort(function (a, b) {
                    return new Date(b.last_log_at || b.created_at) - new Date(a.last_log_at || a.created_at);
                });
                $scope.groupedLists = wrapAsSingleGroup(data);
                break;
            case 'cat_name':
                data.sort(function (a, b) { return a.cat_name.localeCompare(b.cat_name); });
                $scope.groupedLists = wrapAsSingleGroup(data);
                break;
            default:
                $scope.groupedLists = groupByCategory(data);
                break;
        }

        updateCategoriesAvailable();
    };

    $scope.loadList = function () {
        $scope.loading = true;
        priceListService.list(null).then(function (res) {
            $scope.lists = res.result || [];
            $scope.loading = false;
            $scope.applyFilterSort();
        }).catch(function () {
            $scope.loading = false;
            showToast('Gagal memuat data', 'danger');
        });
    };

    $scope.showStartModal  = function () { $scope.modalStart = { catId: '' }; };
    $scope.closeStartModal = function () { $scope.modalStart = null; };

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

    $scope.pdfTemplateOptions = [];
    $scope.modalPdfTemplate   = null;

    $scope.closePdfTemplateModal = function () { $scope.modalPdfTemplate = null; };

    $scope.exportPdf = function (pl) {
        pdfTemplateService.list(pl.cat_id).then(function (r) {
            $scope.pdfTemplateOptions = r.result || [];
            $scope._pdfTargetPl = pl;
            $scope.modalPdfTemplate = true;
        }).catch(function () { showToast('Gagal memuat template PDF', 'danger'); });
    };

    $scope.exportPdfWithTemplate = function (key) {
        if ($scope._pdfTargetPl) pdfTemplateService.render(key, $scope._pdfTargetPl.id);
        $scope.modalPdfTemplate = null;
    };

    $scope.exportExcel = function (pl) {
        showToast('Mengunduh Excel...', 'info');
        priceListService.exportExcel(pl.id);
    };

    // Init
    loadCategories();
    $scope.loadList();
});
