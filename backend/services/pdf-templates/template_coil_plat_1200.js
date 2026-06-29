const { makeRender } = require('./template_coil_plat_builder');

const meta = {
    name: 'Coil & Plat Hitam 1200',
    cat_name: 'Coil & Plat Hitam',
    description: 'Format A4 Landscape khusus Coil & Plat Hitam',
    custom_fields: [],
};

const TEBALS = [
    "1.00", "1.10", "1.20", "1,20 @ 3MTR", "1.35", "1.40", "1.45", "1.50", "1.55", 
    "1.60", "1.70", "1.75", "1.80", "1.90", "1.95", "2.00", "2.30", "2.50", "2.60", 
    "2.80", "3.00", "3.15", "3.20", "3.50", "3.60", "3.80", "4.00", "4.30", 
    "4.50", "4.70", "4.80", "5.00", "5.70", "5.80", "6.00",
    "7.70", "7.80", "8.00", "9.00", "9.70", "9.80", "10.00", "11.70", "11.80", "12.00", "13.70", "13.80", "14.00", "14.70", "14.80", 
    "15.00", "15.70", "16.00", "18.00", "19.00", "20.00", "21.80", "22.00", "25.00", "28.00", "30.00", 
    "32.00", "35.00", "38.00", "40.00", "45.00", "50.00", "60.00", "65.00"
];

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
