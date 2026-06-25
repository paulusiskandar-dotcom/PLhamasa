const { makeRender } = require('./template_coil_plat_1200_shared');

const meta = {
    name: 'Coil & Plat Hitam 1200',
    cat_name: 'Coil & Plat Hitam',
    description: 'Format A4 Landscape khusus Coil & Plat Hitam',
    custom_fields: [],
};

const TEBALS = [];

const render = makeRender([
    {
        title: 'COIL & PLAT HITAM 1200',
        tableTitle: 'PL. HTM 1200',
        keywords: [],
        includeSummary: false,
        tebals: TEBALS,
        ranges: [] // Ranges are ignored when includeSummary is false
    }
]);

module.exports = { meta, render };
