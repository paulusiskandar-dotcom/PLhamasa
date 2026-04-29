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

const meta = {
    name:         'Sheetpile',
    cat_id:       null,
    cat_name:     'SHEETPILE',
    description:  'Template Sheetpile (SP) — A4 portrait, harga cash & kredit gudang per kg & batang',
    custom_fields: [],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');

    const rows = items.map(function (item) {
        const weight = parseFloat(item.weight) || 0;
        const cgKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kgKg   = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

        const cgUnit = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kgUnit = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;

        return {
            _name:   item.name || '',
            _weight: weight,
            cells: [
                { text: item.name || '',  alignment: 'left',  fontSize: 10 },
                { text: fmtBerat(weight), alignment: 'right', fontSize: 10 },
                { text: fmtNum(cgKg),     alignment: 'right', fontSize: 10, color: '#C62828', bold: true },
                { text: fmtNum(cgUnit),   alignment: 'right', fontSize: 10 },
                { text: fmtNum(kgKg),     alignment: 'right', fontSize: 10, color: '#C62828', bold: true },
                { text: fmtNum(kgUnit),   alignment: 'right', fontSize: 10 },
            ],
        };
    });

    rows.sort(function (a, b) {
        const nc = a._name.localeCompare(b._name);
        return nc !== 0 ? nc : a._weight - b._weight;
    });

    const hFill  = '#E8ECF0';
    const hStyle = { bold: true, fillColor: hFill, alignment: 'center', fontSize: 10 };

    const headerRow1 = [
        { text: 'UKURAN',      rowSpan: 2, ...hStyle, fontSize: 11 },
        { text: 'BERAT\n(KG)', rowSpan: 2, ...hStyle },
        { text: 'CASH',        colSpan: 2, ...hStyle, fontSize: 11 }, {},
        { text: 'KREDIT',      colSpan: 2, ...hStyle, fontSize: 11 }, {},
    ];

    const headerRow2 = [
        {}, {},
        { text: '/kg',     ...hStyle, color: '#C62828' },
        { text: '/batang', ...hStyle },
        { text: '/kg',     ...hStyle, color: '#C62828' },
        { text: '/batang', ...hStyle },
    ];

    const dd = {
        pageSize:        'A4',
        pageOrientation: 'portrait',
        pageMargins:     [20, 40, 20, 30],

        header: function () {
            return {
                text:      'SHEETPILE',
                alignment: 'center',
                bold:      true,
                fontSize:  18,
                margin:    [0, 12, 0, 6],
            };
        },

        content: [
            {
                table: {
                    headerRows: 2,
                    widths: ['*', 55, 65, 80, 65, 80],
                    body: [headerRow1, headerRow2, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 4; },
                    paddingRight:  function () { return 4; },
                    paddingTop:    function () { return 4; },
                    paddingBottom: function () { return 4; },
                },
            },
            {
                text:      'Jakarta, ' + generatedAt,
                alignment: 'right',
                fontSize:  9,
                margin:    [0, 10, 0, 0],
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
            fontSize: 10,
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
