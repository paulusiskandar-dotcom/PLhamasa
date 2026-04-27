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
    name:         'Plat Bordest',
    cat_id:       null,
    cat_name:     'PLAT BORDEST',
    description:  'Template Plat Bordest — A5 landscape, harga per kg dan per lembar',
    custom_fields: [],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    const validItems = items.filter(function (item) {
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        return cashKg > 0 || kreditKg > 0;
    });

    const rows = validItems.map(function (item) {
        const weight   = parseFloat(item.weight) || 0;
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const cashLbr   = weight > 0 && cashKg   > 0 ? roundSpecial(cashKg   * weight) : 0;
        const kreditLbr = weight > 0 && kreditKg > 0 ? roundSpecial(kreditKg * weight) : 0;

        return {
            _weight: weight,
            cells: [
                { text: item.name || '',      alignment: 'center', fontSize: 11 },
                { text: fmtBerat(weight),     alignment: 'center', fontSize: 11 },
                { text: fmtNum(cashKg),       alignment: 'right',  fontSize: 11 },
                { text: fmtNum(cashLbr),      alignment: 'right',  fontSize: 11 },
                { text: fmtNum(kreditKg),     alignment: 'right',  fontSize: 11 },
                { text: fmtNum(kreditLbr),    alignment: 'right',  fontSize: 11 },
            ],
        };
    });

    rows.sort(function (a, b) { return a._weight - b._weight; });

    const hFill = '#E8ECF0';

    const headerRow1 = [
        { text: 'UKURAN', rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
        { text: 'BERAT',  rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
        { text: 'CASH',   colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
        { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
    ];

    const headerRow2 = [
        {}, {},
        { text: '/ KG',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: '/ LBR', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: '/ KG',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: '/ LBR', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 8, 8, 25],

        content: [
            {
                text:      'PLAT BORDEST',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 6],
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['32%', '12%', '13%', '15%', '13%', '15%'],
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
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [10, 5, 10, 0],
                columns: [
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 10 },
                    { text: 'Jakarta, ' + generatedAt,                alignment: 'right', fontSize: 10 },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 11,
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
