const dbERP = () => global.dbERP;

const TEMPLATES = {
    as_putih_1:   require('./template_as_putih_1'),
    as_hitam:     require('./template_as_hitam'),
    square_bar:   require('./template_square_bar'),
    rail:         require('./template_rail'),
    plat_bordest: require('./template_plat_bordest'),
    cnp_cash:     require('./template_cnp_cash'),
    cnp_kredit:   require('./template_cnp_kredit'),
    inp:          require('./template_inp'),
    unp:          require('./template_unp'),
    sheetpile:    require('./template_sheetpile'),
    wiremesh:     require('./template_wiremesh'),
    h_beam:       require('./template_h_beam'),
    iwf:          require('./template_iwf'),
    grating:      require('./template_grating'),
    plat_strip:   require('./template_plat_strip'),
    beton_polos:  require('./template_bp'),
    beton_ulir:   require('./template_bu'),
    siku_kecil:   require('./template_siku_kecil'),
    siku_besar:   require('./template_siku_besar'),
    coil_plat_1200: require('./template_coil_plat_1200'),
    coil_plat_1500: require('./template_coil_plat_1500'),
    coil_plat_1800: require('./template_coil_plat_1800'),
    special_grades: require('./template_special_grades'),
    plat_kapal_bki: require('./template_plat_kapal_bki'),
    coil_plat_putih_cash: require('./template_coil_plat_putih_cash'),
    coil_plat_putih_kredit: require('./template_coil_plat_putih_kredit'),
};

let _catCache    = null;
let _catCacheAt  = 0;
const CACHE_TTL  = 5 * 60 * 1000;

async function _buildCache() {
    const rows = await dbERP().any('SELECT cat_id, cat_name FROM item_category');
    const map = {};
    rows.forEach(function (r) {
        map[r.cat_name.trim().toUpperCase()] = r.cat_id;
    });
    
    // Virtual category mapping
    map['COIL & PLAT HITAM'] = 'HRC_HR';
    map['COIL & PLAT PUTIH'] = 'CRC_CR';
    map['BETON POLOS & KAWAT BETON'] = 'BP_KW';
    map['SIKU KECIL'] = 'SK';
    map['SIKU BESAR'] = 'SK';
    
    _catCache   = map;
    _catCacheAt = Date.now();
    return map;
}

async function _resolveCatId(catName) {
    if (!catName) return null;
    if (!_catCache || (Date.now() - _catCacheAt) > CACHE_TTL) await _buildCache();
    return _catCache[catName.trim().toUpperCase()] || null;
}

async function _enrich(key, tpl) {
    const catId = await _resolveCatId(tpl.meta.cat_name);
    return {
        key:           key,
        name:          tpl.meta.name,
        cat_id:        catId,
        cat_name:      tpl.meta.cat_name,
        description:   tpl.meta.description,
        custom_fields: tpl.meta.custom_fields,
    };
}

module.exports = {
    list: async function () {
        const result = [];
        for (const key of Object.keys(TEMPLATES)) {
            result.push(await _enrich(key, TEMPLATES[key]));
        }
        return result;
    },

    listByCategory: async function (catId) {
        const all = await this.list();
        return all.filter(function (t) { return String(t.cat_id) === String(catId); });
    },

    get: function (key) {
        return TEMPLATES[key] || null;
    },

    getCatId: async function (key) {
        const tpl = TEMPLATES[key];
        if (!tpl) return null;
        return _resolveCatId(tpl.meta.cat_name);
    },

    refreshCache: function () { _catCache = null; _catCacheAt = 0; },
};
