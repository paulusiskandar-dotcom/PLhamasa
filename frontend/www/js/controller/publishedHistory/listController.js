plmApp.controller('publishedHistoryController', function ($scope, $http, $timeout, pdfTemplateService) {

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
        { cat_id: 'RBHM',  display_name: 'AS Hitam' },    { cat_id: 'RBPM',  display_name: 'AS Putih' },
        { cat_id: 'BP',    display_name: 'Beton Polos' },  { cat_id: 'BU',    display_name: 'Beton Ulir' },
        { cat_id: 'CN',    display_name: 'CNP' },           { cat_id: 'HRC',   display_name: 'Coil Hitam' },
        { cat_id: 'CRC',   display_name: 'Coil Putih' },   { cat_id: 'HBEAM', display_name: 'H-Beam' },
        { cat_id: 'INP',   display_name: 'INP' },           { cat_id: 'WF',    display_name: 'IWF' },
        { cat_id: 'PB',    display_name: 'Plat Bordest' },  { cat_id: 'HR',    display_name: 'Plat Hitam' },
        { cat_id: 'HRK',   display_name: 'Plat Kapal' },   { cat_id: 'CR',    display_name: 'Plat Putih' },
        { cat_id: 'STLK',  display_name: 'Plat Strip' },   { cat_id: 'SP',    display_name: 'Sheetpile' },
        { cat_id: 'SK',    display_name: 'Siku' },           { cat_id: 'SB',    display_name: 'Square Bar' },
        { cat_id: 'UNP',   display_name: 'UNP' },           { cat_id: 'WM',    display_name: 'Wire Mesh' },
    ];

    // ── Sidebar ──────────────────────────────────────────────────────────────────

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    // ── State ────────────────────────────────────────────────────────────────────

    $scope.items          = [];
    $scope.allCategories  = [];
    $scope.availableYears = [];
    $scope.pills          = PILL_DEFS.map(function (p) { return { cat_id: p.cat_id, display_name: p.display_name, has_data: false }; });
    $scope.totalCount     = 0;
    $scope.categoryCount  = 0;
    $scope.page           = 1;
    $scope.limit          = 20;
    $scope.totalPages     = 1;
    $scope.loading        = false;
    $scope.modalDetail    = null;
    $scope.showPdfModal   = false;
    $scope.pdfTemplates   = [];
    $scope.pdfTargetItem  = null;
    $scope.toast          = { show: false, message: '', type: 'info' };

    $scope.filter = { cat_id: '', period: 'all', sort_by: 'posted_at_desc' };
    $scope.sort   = { column: 'posted_at', direction: 'desc' };

    // ── Toast ────────────────────────────────────────────────────────────────────

    function showToast(msg, type) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, 3000);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    $scope.getCategoryDisplayName = function (catId, fallback) {
        return CATEGORY_DISPLAY_NAMES[catId] || fallback || catId;
    };

    $scope.formatDate = function (iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    };

    $scope.paginationStart = function () {
        return $scope.totalCount === 0 ? 0 : ($scope.page - 1) * $scope.limit + 1;
    };

    $scope.paginationEnd = function () {
        return Math.min($scope.page * $scope.limit, $scope.totalCount);
    };

    // ── Sort ─────────────────────────────────────────────────────────────────────

    var SORT_KEY_MAP = {
        posted_at:          function (dir) { return dir === 'desc' ? 'posted_at_desc' : 'posted_at_asc'; },
        cat_name:           function ()    { return 'cat_name_asc'; },
        item_count:         function ()    { return 'item_count_desc'; },
        revision_no:        function (dir) { return dir === 'desc' ? 'revision_no_desc' : 'revision_no_asc'; },
        posted_by_username: function ()    { return 'posted_by_username_asc'; },
    };

    $scope.setSort = function (column) {
        if ($scope.sort.column === column) {
            $scope.sort.direction = $scope.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            $scope.sort.column    = column;
            $scope.sort.direction = (column === 'item_count' || column === 'posted_at') ? 'desc' : 'asc';
        }
        var mapFn = SORT_KEY_MAP[column];
        $scope.filter.sort_by = mapFn ? mapFn($scope.sort.direction) : 'posted_at_desc';
        $scope.page = 1;
        $scope.loadData();
    };

    // ── Pills ────────────────────────────────────────────────────────────────────

    $scope.togglePill = function (pill) {
        if (!pill.has_data) return;
        $scope.filter.cat_id = ($scope.filter.cat_id === pill.cat_id) ? '' : pill.cat_id;
        $scope.page = 1;
        $scope.loadData();
    };

    // ── Filter (dropdown change) ─────────────────────────────────────────────────

    var REVERSE_SORT_MAP = {
        'posted_at_desc':  { column: 'posted_at',          direction: 'desc' },
        'posted_at_asc':   { column: 'posted_at',          direction: 'asc'  },
        'cat_name_asc':    { column: 'cat_name',           direction: 'asc'  },
        'item_count_desc': { column: 'item_count',         direction: 'desc' },
    };

    $scope.applyFilter = function () {
        var sortInfo = REVERSE_SORT_MAP[$scope.filter.sort_by];
        if (sortInfo) $scope.sort = { column: sortInfo.column, direction: sortInfo.direction };
        $scope.page = 1;
        $scope.loadData();
    };

    // ── Pagination ───────────────────────────────────────────────────────────────

    $scope.prevPage = function () {
        if ($scope.page > 1) { $scope.page--; $scope.loadData(); }
    };

    $scope.nextPage = function () {
        if ($scope.page < $scope.totalPages) { $scope.page++; $scope.loadData(); }
    };

    // ── Load data ────────────────────────────────────────────────────────────────

    $scope.loadData = function () {
        $scope.loading = true;
        var params = { page: $scope.page, limit: $scope.limit, sort_by: $scope.filter.sort_by };
        if ($scope.filter.cat_id)              params.cat_id = $scope.filter.cat_id;
        if ($scope.filter.period !== 'all')    params.period = $scope.filter.period;

        $http.get(api.url + 'price-list/published', { params: params }).then(function (res) {
            var r          = res.data.result || {};
            $scope.items      = r.data        || [];
            $scope.totalCount = r.total        || 0;
            $scope.totalPages = r.total_pages  || 1;
            $scope.loading    = false;
        }, function () {
            $scope.loading = false;
            showToast('Gagal memuat data', 'danger');
        });
    };

    $scope.loadAllCategories = function () {
        $http.get(api.url + 'master/categories').then(function (res) {
            $scope.allCategories = res.data.result || [];
        });
    };

    $scope.loadAvailableYears = function () {
        $http.get(api.url + 'price-list/published/years').then(function (res) {
            $scope.availableYears = (res.data.result || {}).years || [];
        });
    };

    $scope.loadCategoriesWithData = function () {
        $http.get(api.url + 'price-list/published', { params: { limit: 100 } }).then(function (res) {
            var rows = (res.data.result || {}).data || [];
            var catSet = {};
            rows.forEach(function (item) { catSet[item.cat_id] = true; });
            $scope.pills.forEach(function (p) { p.has_data = !!catSet[p.cat_id]; });
            $scope.categoryCount = Object.keys(catSet).length;
        });
    };

    // ── Actions ──────────────────────────────────────────────────────────────────

    $scope.showDetail = function (item) {
        $http.get(api.url + 'price-list/' + item.id).then(function (res) {
            $scope.modalDetail = res.data.result;
        }, function () {
            showToast('Gagal memuat detail', 'danger');
        });
    };

    $scope.exportPdf = function (item) {
        pdfTemplateService.list(item.cat_id).then(function (r) {
            var templates = r.result || [];
            if (templates.length === 0) {
                showToast('Tidak ada template PDF untuk kategori ini', 'info');
            } else if (templates.length === 1) {
                pdfTemplateService.render(templates[0].key, item.id);
            } else {
                $scope.pdfTemplates  = templates;
                $scope.pdfTargetItem = item;
                $scope.showPdfModal  = true;
            }
        }, function () {
            showToast('Gagal memuat template PDF', 'danger');
        });
    };

    $scope.selectPdfTemplate = function (key) {
        if ($scope.pdfTargetItem) pdfTemplateService.render(key, $scope.pdfTargetItem.id);
        $scope.showPdfModal = false;
    };

    $scope.exportExcel = function (item) {
        var token = localStorage.getItem('accessToken');
        var url = api.url + 'price-list/' + item.id + '/export-excel?accessToken=' + encodeURIComponent(token || '');
        window.location.href = url;
    };

    // ── Init ─────────────────────────────────────────────────────────────────────

    $scope.loadAllCategories();
    $scope.loadAvailableYears();
    $scope.loadCategoriesWithData();
    $scope.loadData();
});
