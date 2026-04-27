const TEMPLATES = {
    as_putih_1: require('./template_as_putih_1'),
    as_hitam:   require('./template_as_hitam'),
};

module.exports = {
    list: function () {
        return Object.keys(TEMPLATES).map(key => ({
            key:          key,
            name:         TEMPLATES[key].meta.name,
            cat_id:       TEMPLATES[key].meta.cat_id,
            cat_name:     TEMPLATES[key].meta.cat_name,
            description:  TEMPLATES[key].meta.description,
            custom_fields: TEMPLATES[key].meta.custom_fields,
        }));
    },

    get: function (key) {
        return TEMPLATES[key] || null;
    },

    listByCategory: function (catId) {
        return this.list().filter(function (t) {
            return t.cat_id === null || String(t.cat_id) === String(catId);
        });
    },
};
