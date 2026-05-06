plmApp.controller('priceListListController', function ($scope, $timeout, priceListService, $masterService, pdfTemplateService) {

    var CATEGORY_DISPLAY_NAMES = {
        'RBHM': 'AS Hitam',    'RBPM': 'AS Putih',    'BP':    'Beton Polos',
        'BU':   'Beton Ulir',  'CN':   'CNP',          'HRC':   'Coil Hitam',
        'CRC':  'Coil Putih',  'HBEAM':'H-Beam',       'INP':   'INP',
        'WF':   'IWF',         'PB':   'Plat Bordest', 'HR':    'Plat Hitam',
        'HRK':  'Plat Kapal',  'CR':   'Plat Putih',   'STLK':  'Plat Strip',
        'SP':   'Sheetpile',   'SK':   'Siku',          'SB':    'Square Bar',
        'UNP':  'UNP',         'WM':   'Wire Mesh',
    };

    var PILL_DEFS = [
        { catId: 'RBHM',  name: 'AS Hitam' },    { catId: 'RBPM',  name: 'AS Putih' },
        { catId: 'BP',    name: 'Beton Polos' },  { catId: 'BU',    name: 'Beton Ulir' },
        { catId: 'CN',    name: 'CNP' },           { catId: 'HRC',   name: 'Coil Hitam' },
        { catId: 'CRC',   name: 'Coil Putih' },   { catId: 'HBEAM', name: 'H-Beam' },
        { catId: 'INP',   name: 'INP' },           { catId: 'WF',    name: 'IWF' },
        { catId: 'PB',    name: 'Plat Bordest' },  { catId: 'HR',    name: 'Plat Hitam' },
        { catId: 'HRK',   name: 'Plat Kapal' },   { catId: 'CR',    name: 'Plat Putih' },
        { catId: 'STLK',  name: 'Plat Strip' },   { catId: 'SP',    name: 'Sheetpile' },
        { catId: 'SK',    name: 'Siku' },           { catId: 'SB',    name: 'Square Bar' },
        { catId: 'UNP',   name: 'UNP' },           { catId: 'WM',    name: 'Wire Mesh' },
    ];

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    $scope.filter              = { catId: '', status: '', sortBy: 'default' };
    $scope.expandedPublished   = {};
    $scope.lists               = [];
    $scope.groupedLists        = [];
    $scope.categories          = [];
    $scope.categoriesAvailable = [];
    $scope.categoryPills       = PILL_DEFS.map(function (p) { return { catId: p.catId, name: p.name, hasData: false }; });
    $scope.aktiveCategoryCount = 0;
    $scope.notCreatedCount     = 0;
    $scope.loading             = false;
    $scope.toast               = { show: false, message: '', type: 'info' };
    $scope.modalStart          = null;
    $scope.modalDetail         = null;
    $scope.modalLog            = null;
    $scope.pdfTemplateOptions  = [];
    $scope.modalPdfTemplate    = null;

    function showToast(msg, type) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, 3000);
    }

    function editedAgoStr(pl) {
        if (!pl.last_log_at) return 'belum diedit';
        var diffMs  = Date.now() - new Date(pl.last_log_at).getTime();
        var diffMin = Math.floor(diffMs / 60000);
        var diffHr  = Math.floor(diffMs / 3600000);
        var diffDay = Math.floor(diffMs / 86400000);
        if (diffMin < 1)   return 'diedit baru saja';
        if (diffMin < 60)  return 'diedit ' + diffMin + ' menit lalu';
        if (diffHr  < 24)  return 'diedit ' + diffHr  + ' jam lalu';
        return 'diedit ' + diffDay + ' hari lalu';
    }

    function getDisplayName(catId, fallback) {
        return CATEGORY_DISPLAY_NAMES[catId] || fallback || catId;
    }

    function loadCategories() {
        $masterService.getCategories().then(function (res) {
            $scope.categories = res.result || [];
            updateCategoriesAvailable();
            computeStats();
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

    function updatePillsState() {
        var catIdsWithData = {};
        ($scope.lists || []).forEach(function (pl) { catIdsWithData[pl.cat_id] = true; });
        $scope.categoryPills.forEach(function (p) { p.hasData = !!catIdsWithData[p.catId]; });
    }

    function computeStats() {
        var uniqueCatIds = {};
        ($scope.lists || []).forEach(function (pl) { uniqueCatIds[pl.cat_id] = 1; });
        var activeCats = Object.keys(uniqueCatIds).length;
        $scope.aktiveCategoryCount = activeCats;
        $scope.notCreatedCount = Math.max(0, ($scope.categories || []).length - activeCats);
    }

    function buildGroups(lists) {
        var groupMap   = {};
        var groupOrder = [];

        (lists || []).forEach(function (pl) {
            var key = pl.cat_id;
            if (!groupMap[key]) {
                groupMap[key] = {
                    cat_id: key,
                    cat_name: getDisplayName(key, pl.cat_name),
                    open: null,
                    publishedLatest: null,
                };
                groupOrder.push(key);
            }
            if (pl.status === 'OPEN') {
                pl.editedAgoStr = editedAgoStr(pl);
                groupMap[key].open = pl;
            } else if (pl.status === 'PUBLISHED') {
                var cur = groupMap[key].publishedLatest;
                if (!cur || new Date(pl.posted_at) > new Date(cur.posted_at)) {
                    groupMap[key].publishedLatest = pl;
                }
            }
        });

        return groupOrder
            .map(function (k) { return groupMap[k]; })
            .filter(function (g) { return g.open || g.publishedLatest; });
    }

    function sortGroups(groups, sortBy) {
        var sorted = groups.slice();
        switch (sortBy) {
            case 'created_desc':
                sorted.sort(function (a, b) {
                    var da = a.open ? new Date(a.open.created_at) : new Date(0);
                    var db = b.open ? new Date(b.open.created_at) : new Date(0);
                    return db - da;
                });
                break;
            case 'cat_name':
                sorted.sort(function (a, b) { return a.cat_name.localeCompare(b.cat_name); });
                break;
            default:
                sorted.sort(function (a, b) {
                    var da = a.open ? new Date(a.open.last_log_at || a.open.created_at) : new Date(0);
                    var db = b.open ? new Date(b.open.last_log_at || b.open.created_at) : new Date(0);
                    return db - da;
                });
                break;
        }
        return sorted;
    }

    $scope.applyFilterSort = function () {
        var data = ($scope.lists || []).slice();
        var f    = $scope.filter;

        if (f.catId)  data = data.filter(function (pl) { return String(pl.cat_id) === String(f.catId); });
        if (f.status) data = data.filter(function (pl) { return pl.status === f.status; });

        $scope.groupedLists = sortGroups(buildGroups(data), f.sortBy);
        computeStats();
        updateCategoriesAvailable();
    };

    $scope.loadList = function () {
        $scope.loading = true;
        priceListService.list(null).then(function (res) {
            $scope.lists   = res.result || [];
            $scope.loading = false;
            updatePillsState();
            $scope.applyFilterSort();
        }).catch(function () {
            $scope.loading = false;
            showToast('Gagal memuat data', 'danger');
        });
    };

    $scope.togglePill = function (catId) {
        $scope.filter.catId = ($scope.filter.catId === catId) ? '' : catId;
        $scope.applyFilterSort();
    };

    $scope.togglePublished = function (catId) {
        $scope.expandedPublished[catId] = !$scope.expandedPublished[catId];
    };

    $scope.showStartModal  = function () { $scope.modalStart = { catId: '' }; };
    $scope.closeStartModal = function () { $scope.modalStart = null; };

    $scope.startNew = function (catId, catName) {
        $scope.loading = true;
        priceListService.start(catId).then(function () {
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
            cat_name:    pl.cat_name,
            revision_no: pl.revision_no,
            pl_id:       pl.id,
            entries:     [],
            loading:     true,
        };
        priceListService.getLog(pl.id, 50, 0).then(function (res) {
            $scope.modalLog.entries = res.result || [];
            $scope.modalLog.loading = false;
        }).catch(function () {
            $scope.modalLog.loading = false;
            showToast('Gagal memuat log', 'danger');
        });
    };

    $scope.closeLog = function () { $scope.modalLog = null; };

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
