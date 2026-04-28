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
    name:         'INP',
    cat_id:       null,
    cat_name:     'INP',
    description:  'Template Besi INP — A5 landscape, harga cash & kredit pabrik & gudang',
    custom_fields: [
        { key: 'ukuran', label: 'Ukuran', type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    const rows = items.map(function (item) {
        const cv     = customValues[item.ig_id] || {};
        const weight = parseFloat(item.weight) || 0;

        const cpKg = (item.prices && item.prices.cash_pabrik   && item.prices.cash_pabrik.current)   || 0;
        const cgKg = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kpKg = (item.prices && item.prices.kredit_pabrik && item.prices.kredit_pabrik.current) || 0;
        const kgKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

        const cpUnit = (cpKg && weight) ? roundSpecial(cpKg * weight) : 0;
        const cgUnit = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kpUnit = (kpKg && weight) ? roundSpecial(kpKg * weight) : 0;
        const kgUnit = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;

        return {
            _weight: weight,
            cells: [
                { text: cv.ukuran || '',  alignment: 'left',   fontSize: 11 },
                { text: fmtBerat(weight), alignment: 'center', fontSize: 11, bold: true },
                { text: fmtNum(cpKg),     alignment: 'right',  fontSize: 11, color: '#C62828', bold: true },
                { text: fmtNum(cgKg),     alignment: 'right',  fontSize: 11, color: '#C62828', bold: true },
                { text: fmtNum(cpUnit),   alignment: 'right',  fontSize: 11 },
                { text: fmtNum(cgUnit),   alignment: 'right',  fontSize: 11 },
                { text: fmtNum(kpUnit),   alignment: 'right',  fontSize: 11 },
                { text: fmtNum(kgUnit),   alignment: 'right',  fontSize: 11 },
            ],
        };
    });

    rows.sort(function (a, b) { return a._weight - b._weight; });

    const hFill = '#E8ECF0';

    const headerRow1 = [
        { text: 'UKURAN',         rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
        { text: 'BERAT\n(KG)',    rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
        { text: 'Rp/kg\nPABRIK', rowSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill, color: '#C62828' },
        { text: 'Rp/kg\nGUDANG', rowSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill, color: '#C62828' },
        { text: 'CASH',           colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
        { text: 'KREDIT',         colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
    ];

    const headerRow2 = [
        {}, {}, {}, {},
        { text: 'PABRIK', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'GUDANG', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'PABRIK', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'GUDANG', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'BESI INP',
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
                    widths: ['28%', '10%', '10%', '10%', '10.5%', '10.5%', '10.5%', '10.5%'],
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
