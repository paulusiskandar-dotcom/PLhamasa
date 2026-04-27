plmApp.factory('pdfTemplateService', function ($http) {
    var base = api.url + 'pdf-template';
    return {
        list: function (catId) {
            var url = base + '/list';
            if (catId) url += '?cat_id=' + catId;
            return $http.get(url).then(function (r) { return r.data; });
        },
        getItems: function (key, catId) {
            return $http.get(base + '/' + key + '/items?cat_id=' + catId)
                .then(function (r) { return r.data; });
        },
        setValue: function (key, igId, fieldKey, value) {
            return $http.post(base + '/' + key + '/value', {
                ig_id: igId, field_key: fieldKey, value: value,
            }).then(function (r) { return r.data; });
        },
        render: function (key, priceListId) {
            var token = localStorage.getItem('accessToken');
            var form  = document.createElement('form');
            form.method = 'POST';
            form.action = base + '/' + key + '/render?accessToken=' + encodeURIComponent(token || '');
            form.target = '_blank';
            var input = document.createElement('input');
            input.type  = 'hidden';
            input.name  = 'price_list_id';
            input.value = priceListId;
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
        },
    };
});
