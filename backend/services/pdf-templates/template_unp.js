const PdfPrinter = require('pdfmake/src/printer');
const moment     = require('moment-timezone');

moment.locale('id');

const fonts = {
    Helvetica: {
        normal:      'Helvetica',
        bold:        'Helvetica-Bold',
        italics:     'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};

function roundSpecial(raw) {
    if (!raw) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

function fmtNum(n) {
    if (n === null || n === undefined || n === '' || n === 0) return '';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBerat(b) {
    if (!b) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(b);
}

// Grade is the last word of the item name (e.g. "UNP 100 x 6 m A" → "A")
function extractGrade(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts[parts.length - 1] || '';
}

const meta = {
    name:         'UNP',
    cat_id:       null,
    cat_name:     'UNP',
    description:  'Template Besi UNP — A5 landscape, harga cash & kredit gudang & pabrik',
    custom_fields: [],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');

    const rows = items.map(function (item) {
        const weight = parseFloat(item.weight) || 0;

        const cgKg = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kgKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const cpKg = (item.prices && item.prices.cash_pabrik   && item.prices.cash_pabrik.current)   || 0;
        const kpKg = (item.prices && item.prices.kredit_pabrik && item.prices.kredit_pabrik.current) || 0;

        const cgUnit = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kgUnit = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;
        const cpUnit = (cpKg && weight) ? roundSpecial(cpKg * weight) : 0;
        const kpUnit = (kpKg && weight) ? roundSpecial(kpKg * weight) : 0;

        return {
            _name:   item.name || '',
            _weight: weight,
            cells: [
                { text: item.name || '',       alignment: 'left',   fontSize: 9 },
                { text: extractGrade(item.name), alignment: 'center', fontSize: 9, bold: true },
                { text: fmtBerat(weight),       alignment: 'right',  fontSize: 9 },
                { text: fmtNum(cgKg),           alignment: 'right',  fontSize: 9, color: '#C62828', bold: true },
                { text: fmtNum(cgUnit),         alignment: 'right',  fontSize: 9 },
                { text: fmtNum(kgUnit),         alignment: 'right',  fontSize: 9 },
                { text: fmtNum(cpKg),           alignment: 'right',  fontSize: 9, color: '#C62828', bold: true },
                { text: fmtNum(cpUnit),         alignment: 'right',  fontSize: 9 },
                { text: fmtNum(kpUnit),         alignment: 'right',  fontSize: 9 },
            ],
        };
    });

    rows.sort(function (a, b) {
        const nc = a._name.localeCompare(b._name);
        return nc !== 0 ? nc : a._weight - b._weight;
    });

    const hFill = '#E8ECF0';
    const hStyle = { bold: true, fillColor: hFill, alignment: 'center', fontSize: 9 };

    const headerRow1 = [
        { text: 'UKURAN',  rowSpan: 2, ...hStyle, fontSize: 10 },
        { text: 'Grade',   rowSpan: 2, ...hStyle },
        { text: 'BERAT\n(KG)', rowSpan: 2, ...hStyle },
        { text: 'GUDANG',  colSpan: 3, ...hStyle, fontSize: 10 }, {}, {},
        { text: 'PABRIK',  colSpan: 3, ...hStyle, fontSize: 10, color: '#1A3A5C' }, {}, {},
    ];

    const headerRow2 = [
        {}, {}, {},
        { text: 'hrg/kg',  ...hStyle, color: '#C62828' },
        { text: 'Tunai',   ...hStyle },
        { text: 'Kredit',  ...hStyle },
        { text: 'hrg/kg',  ...hStyle, color: '#C62828' },
        { text: 'Tunai',   ...hStyle },
        { text: 'Kredit',  ...hStyle },
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'BESI UNP',
                alignment: 'center',
                bold:      true,
                fontSize:  16,
                margin:    [0, 8, 0, 6],
            };
        },

        content: [
            {
                table: {
                    headerRows: 2,
                    widths: ['*', 24, 42, 60, 64, 64, 60, 64, 64],
                    body: [headerRow1, headerRow2, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 3; },
                    paddingBottom: function () { return 3; },
                },
            },
            {
                text:      'Jakarta, ' + generatedAt,
                alignment: 'right',
                fontSize:  9,
                margin:    [0, 8, 0, 0],
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [10, 5, 10, 0],
                columns: [
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 9 },
                    { text: '',                                        alignment: 'right', fontSize: 9 },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 9,
        },
    };

    return new Promise(function (resolve, reject) {
        const printer = new PdfPrinter(fonts);
        const pdfDoc  = printer.createPdfKitDocument(dd);
        const chunks  = [];
        pdfDoc.on('data',  function (chunk) { chunks.push(chunk); });
        pdfDoc.on('end',   function ()       { resolve(Buffer.concat(chunks)); });
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}

module.exports = { meta, render };
