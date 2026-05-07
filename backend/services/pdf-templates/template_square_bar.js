const PdfPrinter = require('pdfmake/src/printer');
const moment     = require('moment-timezone');

moment.locale('id');

// pdfkit built-in fonts — no TTF files required
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
    if (n === null || n === undefined || n === '') return '';
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
    name:         'Square Bar',
    cat_id:       null,
    cat_name:     'SQUARE BAR',
    description:  'Template Ass Kotak / Square Bar — A5 landscape',
    custom_fields: [
        { key: 'dia_inch', label: 'DIA inch', type: 'text' },
        { key: 'dia_mm',   label: 'DIA mm',   type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    const rows = items.map(function (item) {
        const cv       = customValues[item.ig_id] || {};
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const weight   = parseFloat(item.weight) || 0;

        return {
            _weight: weight,
            cells: [
                { text: cv.dia_inch || '', alignment: 'center', fontSize: 12 },
                { text: cv.dia_mm   || '', alignment: 'center', fontSize: 12 },
                { text: fmtBerat(weight),                        alignment: 'center', fontSize: 12 },
                { text: fmtNum(cashKg),                          alignment: 'right',  fontSize: 12 },
                { text: fmtNum(roundSpecial(cashKg * weight)),   alignment: 'right',  fontSize: 12 },
                { text: fmtNum(kreditKg),                        alignment: 'right',  fontSize: 12 },
                { text: fmtNum(roundSpecial(kreditKg * weight)), alignment: 'right',  fontSize: 12 },
            ],
        };
    });

    // Sort by weight ascending
    rows.sort(function (a, b) { return a._weight - b._weight; });

    const hFill = '#E8ECF0';
    const headerGroup = [
        { text: 'DIA.',   colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
        { text: 'BERAT',              alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
        { text: 'CASH',   colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
        { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
    ];
    const headerSub = [
        { text: '(inch)',   alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(mm)',     alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(kg)',     alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(Rp/kg)', alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(Rp/btg)',alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(Rp/kg)', alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
        { text: '(Rp/btg)',alignment: 'center', bold: true, fontSize: 12, fillColor: '#E8ECF0' },
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'ASS KOTAK / SQUARE BAR',
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
                    widths: ['17%', '10%', '13%', '15%', '15%', '15%', '15%'],
                    body:   [headerGroup, headerSub, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 2; },
                    paddingBottom: function () { return 2; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [20, 5, 20, 0],
                columns: [
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 10 },
                    { text: 'Jakarta, ' + generatedAt,                alignment: 'right', fontSize: 10 },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 12,
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
