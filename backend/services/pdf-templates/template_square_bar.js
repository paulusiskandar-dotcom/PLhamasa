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

    const FS = 7.5;  // data font size

    const rows = items.map(function (item) {
        const cv       = customValues[item.ig_id] || {};
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const weight   = parseFloat(item.weight) || 0;

        return {
            _weight: weight,
            cells: [
                { text: cv.dia_inch || '', alignment: 'center', fontSize: FS },
                { text: cv.dia_mm   || '', alignment: 'center', fontSize: FS },
                { text: fmtBerat(weight),                        alignment: 'center', fontSize: FS },
                { text: fmtNum(cashKg),                          alignment: 'right',  fontSize: FS },
                { text: fmtNum(roundSpecial(cashKg * weight)),   alignment: 'right',  fontSize: FS },
                { text: fmtNum(kreditKg),                        alignment: 'right',  fontSize: FS },
                { text: fmtNum(roundSpecial(kreditKg * weight)), alignment: 'right',  fontSize: FS },
            ],
        };
    });

    // Sort by weight ascending
    rows.sort(function (a, b) { return a._weight - b._weight; });

    const FSH   = 8;       // header font size
    const hFill = '#E8ECF0';

    function hg(text, extra) {
        return Object.assign({ text, alignment: 'center', bold: true, fontSize: FSH, fillColor: hFill }, extra || {});
    }

    const headerGroup = [
        hg('DIA.',   { colSpan: 2 }), {},
        hg('BERAT'),
        hg('CASH',   { colSpan: 2 }), {},
        hg('KREDIT', { colSpan: 2 }), {},
    ];
    const headerSub = [
        hg('(inch)'), hg('(mm)'), hg('(kg)'),
        hg('(Rp/kg)'), hg('(Rp/btg)'),
        hg('(Rp/kg)'), hg('(Rp/btg)'),
    ];

    // A5 landscape available ≈ 579pt (margins [8,*,8,*])
    // dia_inch wider to avoid wrap; 4 price cols share remaining space
    // [82, 48, 56, 98, 98, 98, 99] = 579

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 26, 8, 20],

        header: function () {
            return {
                text:      'ASS KOTAK / SQUARE BAR',
                alignment: 'center',
                bold:      true,
                fontSize:  13,
                margin:    [0, 6, 0, 0],
            };
        },

        content: [
            {
                table: {
                    headerRows: 2,
                    widths: [82, 48, 56, 98, 98, 98, 99],
                    body:   [headerGroup, headerSub, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function (i) { return i <= 2 ? 0.5 : 0.25; },
                    vLineWidth: function ()   { return 0.3; },
                    hLineColor: function ()   { return '#888'; },
                    vLineColor: function ()   { return '#888'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 2; },
                    paddingBottom: function () { return 2; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [8, 3, 8, 0],
                columns: [
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 8 },
                    { text: 'Jakarta, ' + generatedAt,                alignment: 'right', fontSize: 8 },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: FS,
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
