plmApp.controller("settingsController", function ($scope, $timeout, $settingsService) {

    $scope.sidebarHidden = localStorage.getItem("plm.sidebarHidden") === "true";
    $scope.toggleSidebar = function () {
        $scope.sidebarHidden = !$scope.sidebarHidden;
        localStorage.setItem("plm.sidebarHidden", $scope.sidebarHidden);
    };

    $scope.categories   = [];   // [{id, name, checked}]
    $scope.loading      = true;
    $scope.saving       = false;
    $scope.isDirty      = false;
    $scope.toast        = { show: false, message: "", type: "" };

    var originalIds = [];

    function showToast(message, type) {
        $scope.toast = { show: true, message: message, type: type || "info" };
        $timeout(function () { $scope.toast.show = false; }, 3500);
    }

    function load() {
        $scope.loading = true;
        $settingsService.get().then(function (res) {
            var data     = res.result;
            var savedIds = data.cat_ids || [];

            originalIds = savedIds.slice();

            $scope.categories = (data.categories || [])
                .sort(function (a, b) { return a.name.localeCompare(b.name); })
                .map(function (c) {
                    return {
                        id:      c.id,
                        name:    c.name,
                        checked: savedIds.indexOf(c.id) !== -1,
                    };
                });

            $scope.loading  = false;
            $scope.isDirty  = false;
        }).catch(function () {
            showToast("Gagal memuat pengaturan", "danger");
            $scope.loading = false;
        });
    }

    load();

    $scope.onCheck = function () {
        var current = $scope.categories
            .filter(function (c) { return c.checked; })
            .map(function (c) { return c.id; })
            .sort();

        var orig = originalIds.slice().sort();
        $scope.isDirty = JSON.stringify(current) !== JSON.stringify(orig);
    };

    $scope.reset = function () {
        $scope.categories.forEach(function (c) {
            c.checked = originalIds.indexOf(c.id) !== -1;
        });
        $scope.isDirty = false;
    };

    $scope.save = function () {
        if ($scope.saving || !$scope.isDirty) return;
        $scope.saving = true;

        var selected = $scope.categories
            .filter(function (c) { return c.checked; })
            .map(function (c) { return c.id; });

        $settingsService.save(selected).then(function () {
            originalIds   = selected.slice();
            $scope.isDirty = false;
            $scope.saving  = false;
            showToast("Pengaturan berhasil disimpan", "success");
        }).catch(function () {
            $scope.saving = false;
            showToast("Gagal menyimpan pengaturan", "danger");
        });
    };
});
