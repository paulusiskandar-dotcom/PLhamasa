plmApp.directive('thousandSeparator', ['$timeout', function ($timeout) {
    return {
        require: 'ngModel',
        link: function (scope, element, attrs, ngModel) {
            function format(val) {
                if (val === null || val === undefined || val === '') return '';
                var n = Math.round(parseFloat(val));
                return isNaN(n) ? '' : n.toLocaleString('id-ID');
            }
            function parse(text) {
                if (!text) return null;
                var clean = String(text).replace(/[^\d]/g, '');
                return clean ? parseInt(clean, 10) : null;
            }

            ngModel.$formatters.push(format);

            ngModel.$parsers.push(function (viewVal) {
                return parse(viewVal);
            });

            // Re-format display after Angular's blur digest settles
            element.on('blur', function () {
                $timeout(function () {
                    element.val(format(ngModel.$modelValue));
                }, 0);
            });
        }
    };
}]);
