const PdfPrinter = require('pdfmake/src/printer');
const moment     = require('moment-timezone');
const { roundSpecial } = require('../../utils/rounding');

moment.locale('id');

const fonts = {
    Helvetica: {
        normal:      'Helvetica',
        bold:        'Helvetica-Bold',
        italics:     'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};



function fmtKg(n) {
    if (!n || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBtg(n) {
    if (!n || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBerat(b) {
    const n = parseFloat(b);
    if (!n || n === 0) return '-';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

const meta = {
    name:         'UNP',
    cat_id:       null,
    cat_name:     'UNP',
    description:  'Template Besi UNP — A5 landscape, 7 kolom, multi-page',
    custom_fields: [
        { key: 'ukuran', label: 'Ukuran', type: 'text' },
    ],
};

function render({ items, customValues }) {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    const rows = items.map(function (item) {
        const cv     = customValues[item.ig_id] || {};
        const ukuran = (cv.ukuran || '').trim();
        const weight = parseFloat(item.weight) || 0;

        const cgKg = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kgKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const cpKg = (item.prices && item.prices.cash_pabrik   && item.prices.cash_pabrik.current)   || 0;
        const kpKg = (item.prices && item.prices.kredit_pabrik && item.prices.kredit_pabrik.current) || 0;

        const hasPrices = (cgKg || kgKg || cpKg || kpKg);
        if (!ukuran && !hasPrices) {
            return null;
        }

        const cgBtg = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kgBtg = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;
        const cpBtg = (cpKg && weight) ? roundSpecial(cpKg * weight) : 0;
        const kpBtg = (kpKg && weight) ? roundSpecial(kpKg * weight) : 0;

        return {
            _weight: weight,
            _name:   item.name || '',
            cells: [
                { text: ukuran,          alignment: 'left',   fontSize: 9.5 },
                { text: fmtBerat(weight),alignment: 'center', fontSize: 9.5 },
                { text: fmtKg(cgKg),     alignment: 'right',  fontSize: 9.5 },
                { text: fmtBtg(cgBtg),   alignment: 'right',  fontSize: 9.5 },
                { text: fmtBtg(kgBtg),   alignment: 'right',  fontSize: 9.5 },
                { text: fmtBtg(cpBtg),   alignment: 'right',  fontSize: 9.5 },
                { text: fmtBtg(kpBtg),   alignment: 'right',  fontSize: 9.5 },
            ],
        };
    }).filter(Boolean);

    rows.sort(function (a, b) {
        if (a._weight !== b._weight) return a._weight - b._weight;
        return a._name.localeCompare(b._name);
    });

    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({ text: text, bold: true, fillColor: hFill, alignment: 'center' }, extra || {});
    }

    const headerRow1 = [
        h('Ukuran',      { rowSpan: 3, verticalAlignment: 'middle', fontSize: 9.5 }),
        h('BERAT',       { rowSpan: 2, verticalAlignment: 'middle', fontSize: 9.5 }),
        h('GUDANG',      { colSpan: 3, fontSize: 9.5 }), {}, {},
        h('PABRIK',      { colSpan: 2, fontSize: 9.5 }), {},
    ];

    const headerRow2 = [
        {}, {},
        h('CASH',   { colSpan: 2, fontSize: 9.5 }), {},
        h('KREDIT', { fontSize: 9.5 }),
        h('CASH',   { fontSize: 9.5 }),
        h('KREDIT', { fontSize: 9.5 }),
    ];

    const headerRow3 = [
        {},
        h('(kg)',  { fontSize: 8.5 }),
        h('/kg',   { fontSize: 8.5 }),
        h('/btg',  { fontSize: 8.5 }),
        h('/btg',  { fontSize: 8.5 }),
        h('/btg',  { fontSize: 8.5 }),
        h('/btg',  { fontSize: 8.5 }),
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [15, 14, 15, 32],

        content: [
            {
                text:      'UNP',
                alignment: 'center',
                bold:      true,
                fontSize:  13,
                margin:    [0, 0, 0, 4],
            },
            {
                table: {
                    headerRows: 3,
                    widths: ['28%', '12%', '12%', '12%', '12%', '12%', '12%'],
                    body:   [headerRow1, headerRow2, headerRow3, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#000000'; },
                    vLineColor: function () { return '#000000'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 2.45; },
                    paddingBottom: function () { return 2.45; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [15, 0, 15, 14],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN',                                fontSize: 8.5, margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan',   fontSize: 8.5, margin: [0, 0, 0, 0] },
                        ],
                    },
                    {
                        width:     'auto',
                        text:      pageCount > 1 ? ('Page ' + currentPage + '/' + pageCount) : '',
                        fontSize:  8.5,
                        bold:      true,
                        alignment: 'center',
                        margin:    [10, 9.5, 10, 0],
                    },
                    {
                        width:     'auto',
                        text:      generatedAt,
                        fontSize:  8.5,
                        italics:   true,
                        alignment: 'right',
                        margin:    [0, 9.5, 0, 0],
                    },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 9.5,
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
