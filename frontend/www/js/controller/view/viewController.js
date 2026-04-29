plmApp.controller('viewController', function ($scope, $timeout, priceListService, pdfTemplateService) {

    var plId = window.plmPageData && window.plmPageData.priceListId;

    $scope.loading    = true;
    $scope.pl         = null;
    $scope.items      = [];
    $scope.priceTypes = [];
    $scope.isExtended = false;

    $scope.searchQuery  = '';
    $scope.sortField    = 'name';
    $scope.sortReverse  = false;
    $scope.filteredItems = [];

    $scope.toast = { show: false, message: '', type: 'info' };
    function showToast(msg, type, dur) {
        $scope.toast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.toast.show = false; }, dur || 3000);
    }

    $scope.sidebarHidden = localStorage.getItem('plm.sidebarHidden') === 'true';
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem('plm.sidebarHidden', $scope.sidebarHidden);
    };

    // ── roundSpecial for per-btg calc ────────────────────────────
    function roundSpecial(raw) {
        if (!raw) return 0;
        var sisa = Math.round(raw) % 100;
        return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
    }

    // ── Load data ────────────────────────────────────────────────
    function loadData() {
        $scope.loading = true;
        priceListService.get(plId).then(function (r) {
            var result = r.result;
            $scope.pl         = result;
            $scope.priceTypes = result.priceTypes || [];
            $scope.isExtended = $scope.priceTypes.length > 2;

            // Enrich items: add .lbr per price type
            $scope.items = (result.items || []).map(function (item) {
                var weight = parseFloat(item.weight) || 0;
                var enriched = angular.copy(item);
                $scope.priceTypes.forEach(function (pt) {
                    if (enriched.prices && enriched.prices[pt.code]) {
                        var kg = enriched.prices[pt.code].current || 0;
                        enriched.prices[pt.code].lbr = (kg && weight) ? roundSpecial(kg * weight) : 0;
                    }
                });
                return enriched;
            });

            $scope.loading = false;
        }).catch(function (err) {
            $scope.loading = false;
            var msg = (err && err.data && err.data.message) ? err.data.message : 'Gagal memuat data';
            showToast(msg, 'danger', 5000);
        });
    }

    // ── Sort ─────────────────────────────────────────────────────
    $scope.sortBy = function (field) {
        if ($scope.sortField === field) {
            $scope.sortReverse = !$scope.sortReverse;
        } else {
            $scope.sortField   = field;
            $scope.sortReverse = false;
        }
    };

    $scope.getSortIcon = function (field) {
        if ($scope.sortField !== field) return 'bi-arrow-down-up';
        return $scope.sortReverse ? 'bi-arrow-up' : 'bi-arrow-down';
    };

    // ── Filter + sort function for ng-repeat ─────────────────────
    $scope.getFilteredItems = function () {
        var q = ($scope.searchQuery || '').toLowerCase();
        var list = $scope.items.filter(function (it) {
            return !q || (it.name || '').toLowerCase().indexOf(q) >= 0;
        });

        var field = $scope.sortField;
        list.sort(function (a, b) {
            var va, vb;
            if (field === 'name') {
                va = (a.name || '').toLowerCase();
                vb = (b.name || '').toLowerCase();
                return $scope.sortReverse ? (vb < va ? -1 : 1) : (va < vb ? -1 : 1);
            }
            if (field === 'weight') {
                va = parseFloat(a.weight) || 0;
                vb = parseFloat(b.weight) || 0;
            } else if (field.indexOf('kg:') === 0) {
                var code = field.slice(3);
                va = (a.prices[code] && a.prices[code].current) || 0;
                vb = (b.prices[code] && b.prices[code].current) || 0;
            } else if (field.indexOf('lbr:') === 0) {
                var code = field.slice(4);
                va = (a.prices[code] && a.prices[code].lbr) || 0;
                vb = (b.prices[code] && b.prices[code].lbr) || 0;
            } else {
                va = 0; vb = 0;
            }
            return $scope.sortReverse ? vb - va : va - vb;
        });

        $scope.filteredItems = list;
        return list;
    };

    // ── Export ───────────────────────────────────────────────────
    $scope.downloadPostReport = function () {
        var token = localStorage.getItem('accessToken');
        window.location.href = api.url + 'price-list/' + plId + '/post-report?accessToken=' + encodeURIComponent(token || '');
    };

    $scope.modalPdfTemplate = null;
    $scope.pdfTemplateOptions = [];

    $scope.showPdfTemplateModal = function () {
        if (!$scope.pl) return;
        pdfTemplateService.list($scope.pl.cat_id).then(function (r) {
            $scope.pdfTemplateOptions = r.result || [];
            $scope.modalPdfTemplate = { selected: null };
        }).catch(function () { showToast('Gagal memuat template PDF', 'danger'); });
    };

    $scope.closePdfTemplateModal = function () { $scope.modalPdfTemplate = null; };

    $scope.exportPdfWithTemplate = function () {
        if (!$scope.modalPdfTemplate || !$scope.modalPdfTemplate.selected) return;
        pdfTemplateService.render($scope.modalPdfTemplate.selected, plId);
        $scope.modalPdfTemplate = null;
    };

    $scope.exportExcel = function () {
        var token = localStorage.getItem('accessToken');
        window.location.href = api.url + 'price-list/' + plId + '/export-excel?accessToken=' + encodeURIComponent(token || '');
    };

    $scope.goBack = function () { window.location.href = '/price-list'; };

    loadData();
});
