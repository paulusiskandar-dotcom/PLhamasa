plmApp.controller('userController', function ($scope, $timeout, userService) {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem('userInfo') || '{}'); } catch (e) {}
    $scope.currentUser = stored;

    $scope.isSuperadmin = function () {
        return $scope.currentUser.role === 'superadmin';
    };

    // ── Change Own Password ──────────────────────────────────────
    $scope.modalChangePwd = null;

    $scope.openChangePassword = function () {
        $scope.modalChangePwd = { old_password: '', new_password: '', confirm_password: '' };
    };

    $scope.closeChangePassword = function () { $scope.modalChangePwd = null; };

    $scope.executeChangePwd = function () {
        var d = $scope.modalChangePwd;
        if (!d.old_password || !d.new_password) {
            _toast('Password lama dan baru wajib diisi', 'danger'); return;
        }
        if (d.new_password.length < 8) {
            _toast('Password baru minimal 8 karakter', 'danger'); return;
        }
        if (d.new_password !== d.confirm_password) {
            _toast('Konfirmasi password tidak cocok', 'danger'); return;
        }
        userService.changeOwnPassword(d.old_password, d.new_password).then(function () {
            _toast('Password berhasil diubah', 'success');
            $scope.modalChangePwd = null;
        }).catch(function (err) {
            var msg = (err && err.data && err.data.message) ? err.data.message : 'Gagal ubah password';
            _toast(msg, 'danger');
        });
    };

    // ── Minimal toast (standalone, independent of child scope toasts) ──
    $scope.globalToast = { show: false, message: '', type: 'info' };
    function _toast(msg, type, duration) {
        $scope.globalToast = { show: true, message: msg, type: type || 'info' };
        $timeout(function () { $scope.globalToast.show = false; }, duration || 3000);
    }
});
