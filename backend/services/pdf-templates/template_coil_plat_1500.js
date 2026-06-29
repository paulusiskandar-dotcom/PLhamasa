const { makeRender } = require('./template_coil_plat_builder');

const meta = {
    name: 'Coil & Plat Hitam 1500',
    cat_name: 'Coil & Plat Hitam',
    description: 'Format A4 Landscape khusus Coil & Plat Hitam ukuran 1500mm',
    custom_fields: [],
};

const TEBALS = [
    "3.20", "3.30", "3.50", "3.60", "3.80", "4.00", "4.30", "4.50", "4.70", "4.80", "5.00", "5.70", "5.80", "6.00", 
    "7.70", "7.80", "8.00", "8.80", "9.00", "9.70", "9.80", "10.00", "11.70", "11.80", "12.00", "13.70", "13.80", "14.00", "14.80", 
    "15.00", "15.70", "16.00", "18.00", "19.00", "20.00", "22.00", "25.00", "28.00", "30.00", "32.00", "35.00", "38.00", "40.00", 
    "45.00", "50.00"
];

const RANGES = [
    { label: "3.20 - 3.30", min: 3.20, max: 3.39 },
    { label: "3.50 - 4.00", min: 3.40, max: 4.09 },
    { label: "4.10 - 6.00", min: 4.10, max: 6.09 },
    { label: "6.10 - 12.00", min: 6.10, max: 12.09 },
    { label: "13.00 - 20.00", min: 13.00, max: 20.09 },
    { label: "21.00 - 25.00", min: 21.00, max: 25.09 },
    { label: "26.00 - 40.00", min: 26.00, max: 40.09 },
    { label: "41.00 - 50.00", min: 41.00, max: 50.09 }
];

const render = makeRender([
    {
        title: 'COIL & PLAT HITAM 1500',
        tableTitle: 'PL. HTM 1500',
        keywords: ['1490', '1495', '1500', '1510', "5'"],
        includeSummary: false,
        tebals: TEBALS,
        ranges: RANGES
    },
    {
        title: 'COIL & PLAT HITAM 1524',
        tableTitle: 'PL. HTM 1524',
        keywords: ['1520', '1523', '1524', '1525'],
        includeSummary: false,
        tebals: TEBALS,
        ranges: RANGES
    }
]);

module.exports = { meta, render };
