plmApp.directive('thousandSeparator', function () {
    return {
        require: 'ngModel',
        link: function (scope, element, attrs, ngModel) {
            function format(num) {
                if (num === null || num === undefined || num === '') return '';
                var n = parseInt(String(num).replace(/[^\d-]/g, ''), 10);
                if (isNaN(n)) return '';
                return n.toLocaleString('id-ID');
            }
            function parse(text) {
                if (!text) return null;
                var clean = String(text).replace(/[^\d-]/g, '');
                if (!clean || clean === '-') return null;
                var n = parseInt(clean, 10);
                return isNaN(n) ? null : n;
            }

            // Override $render: called by Angular whenever $viewValue changes
            // (includes programmatic model updates from generate())
            ngModel.$render = function () {
                element.val(format(ngModel.$viewValue));
            };

            // Model → View pipeline: converts raw number to formatted string
            ngModel.$formatters.push(function (modelVal) {
                return format(modelVal);
            });

            // View → Model pipeline: strips separators, returns integer
            ngModel.$parsers.push(function (viewVal) {
                return parse(viewVal);
            });

            // Re-format on blur (belt-and-suspenders)
            element.on('blur', function () {
                var val = ngModel.$modelValue;
                if (val !== null && val !== undefined) {
                    element.val(format(val));
                }
            });

            // Watch for programmatic model changes (e.g., generate())
            scope.$watch(
                function () { return ngModel.$modelValue; },
                function (newVal, oldVal) {
                    if (newVal !== oldVal) {
                        element.val(format(newVal));
                    }
                }
            );
        }
    };
});
