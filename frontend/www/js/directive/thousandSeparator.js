plmApp.directive('thousandSeparator', ['$timeout', function ($timeout) {
    return {
        require: 'ngModel',
        link: function (scope, element, attrs, ngModel) {
            function format(val) {
                if (val === null || val === undefined || val === '') return '';
                var n = Math.round(parseFloat(String(val).replace(/[^\d.]/g, '')));
                return isNaN(n) ? '' : n.toLocaleString('id-ID');
            }
            function parse(text) {
                if (!text) return null;
                var clean = String(text).replace(/[^\d]/g, '');
                return clean ? parseInt(clean, 10) : null;
            }

            // Model → View: runs when $modelValue changes (initial + programmatic)
            ngModel.$formatters.push(format);

            // Belt-and-suspenders: watch $modelValue directly to catch generate() updates
            scope.$watch(function () { return ngModel.$modelValue; }, function (newVal) {
                if (document.activeElement !== element[0]) {
                    element.val(format(newVal));
                }
            });

            // View → Model: strip separators, return integer
            ngModel.$parsers.push(function (viewVal) {
                var parsed = parse(viewVal);
                var display = format(parsed);
                // On blur (updateOn:'blur'), safe to update display + restore cursor
                if (display !== element.val()) {
                    var pos = element[0].selectionStart;
                    element.val(display);
                    try { element[0].setSelectionRange(pos, pos); } catch (e) {}
                }
                return parsed;
            });

            // Re-format on blur after Angular's digest settles
            element.on('blur', function () {
                $timeout(function () {
                    element.val(format(ngModel.$modelValue));
                }, 0);
            });
        }
    };
}]);
