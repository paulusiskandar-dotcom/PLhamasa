const PdfPrinter = require('pdfmake/src/printer');
const moment     = require('moment-timezone');

moment.locale('id');

// Use pdfkit built-in fonts — no TTF files required
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
    name:         'AS PUTIH 1',
    cat_id:       'RBPM',
    cat_name:     'As Putih',
    description:  'Template Assental / Round Bar — kolom DIA (inch & mm)',
    custom_fields: [
        { key: 'dia_inch', label: 'DIA inch', type: 'text' },
        { key: 'dia_mm',   label: 'DIA mm',   type: 'text' },
    ],
};

function render({ items, customValues }) {
    // Build data rows
    const rows = items.map(function (item) {
        const cv      = customValues[item.ig_id] || {};
        const cashKg  = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const weight  = parseFloat(item.weight) || 0;

        return {
            dia_mm_raw: parseFloat(cv.dia_mm) || 9999,
            weight_raw: weight,
            cells: [
                { text: cv.dia_inch || '', alignment: 'center' },
                { text: cv.dia_mm   || '', alignment: 'center' },
                { text: fmtBerat(weight), alignment: 'center' },
                { text: fmtNum(cashKg),                        alignment: 'right' },
                { text: fmtNum(roundSpecial(cashKg * weight)), alignment: 'right' },
                { text: fmtNum(kreditKg),                         alignment: 'right' },
                { text: fmtNum(roundSpecial(kreditKg * weight)),  alignment: 'right' },
            ],
        };
    });

    rows.sort(function (a, b) {
        if (a.dia_mm_raw !== b.dia_mm_raw) return a.dia_mm_raw - b.dia_mm_raw;
        return a.weight_raw - b.weight_raw;
    });

    const headerFill = '#E8ECF0';
    const headerGroup = [
        { text: 'DIA.',   colSpan: 2, alignment: 'center', bold: true, fillColor: headerFill },
        {},
        { text: 'BERAT',  alignment: 'center', bold: true, fillColor: headerFill },
        { text: 'CASH',   colSpan: 2, alignment: 'center', bold: true, fillColor: headerFill },
        {},
        { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fillColor: headerFill },
        {},
    ];
    const headerSub = [
        { text: '(inch)',   alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(mm)',     alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(kg)',     alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(Rp/kg)',  alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(Rp/btg)', alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(Rp/kg)',  alignment: 'center', fontSize: 9, fillColor: headerFill },
        { text: '(Rp/btg)', alignment: 'center', fontSize: 9, fillColor: headerFill },
    ];

    const dd = {
        pageSize:    'A4',
        pageMargins: [40, 40, 40, 40],
        content: [
            {
                text:      'ASSENTAL / ROUND BAR',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 4],
            },
            {
                text:      'Jakarta, ' + moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm'),
                alignment: 'right',
                fontSize:  10,
                margin:    [0, 0, 0, 12],
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['12%', '10%', '12%', '17%', '17%', '16%', '16%'],
                    body:   [headerGroup, headerSub, ...rows.map(r => r.cells)],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingTop:    function () { return 4; },
                    paddingBottom: function () { return 4; },
                },
            },
        ],
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
