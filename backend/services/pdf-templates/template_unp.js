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
    description:  'Template Besi UNP — A5 landscape, 9 kolom, multi-page',
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
        const ukuran = cv.ukuran || '';
        const weight = parseFloat(item.weight) || 0;

        const cgKg = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kgKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const cpKg = (item.prices && item.prices.cash_pabrik   && item.prices.cash_pabrik.current)   || 0;
        const kpKg = (item.prices && item.prices.kredit_pabrik && item.prices.kredit_pabrik.current) || 0;

        const cgBtg = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kgBtg = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;
        const cpBtg = (cpKg && weight) ? roundSpecial(cpKg * weight) : 0;
        const kpBtg = (kpKg && weight) ? roundSpecial(kpKg * weight) : 0;

        return {
            _weight: weight,
            _name:   item.name || '',
            cells: [
                { text: item.name || '', alignment: 'left',   fontSize: 10 },
                { text: ukuran,          alignment: 'center', fontSize: 10 },
                { text: fmtBerat(weight),alignment: 'center', fontSize: 10 },
                { text: fmtKg(cgKg),     alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(cgBtg),   alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(kgBtg),   alignment: 'right',  fontSize: 10 },
                { text: fmtKg(cpKg),     alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(cpBtg),   alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(kpBtg),   alignment: 'right',  fontSize: 10 },
            ],
        };
    });

    rows.sort(function (a, b) {
        if (a._weight !== b._weight) return a._weight - b._weight;
        return a._name.localeCompare(b._name);
    });

    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({ text: text, bold: true, fillColor: hFill, alignment: 'center' }, extra || {});
    }

    const headerRow1 = [
        h('Nama Barang', { rowSpan: 3, verticalAlignment: 'middle', fontSize: 10 }),
        h('Ukuran',      { rowSpan: 3, verticalAlignment: 'middle', fontSize: 10 }),
        h('BERAT',       { rowSpan: 2, verticalAlignment: 'middle', fontSize: 10 }),
        h('GUDANG',      { colSpan: 3, fontSize: 10 }), {}, {},
        h('PABRIK',      { colSpan: 3, fontSize: 10 }), {}, {},
    ];

    const headerRow2 = [
        {}, {}, {},
        h('CASH',   { colSpan: 2 }), {},
        h('KREDIT'),
        h('CASH',   { colSpan: 2 }), {},
        h('KREDIT'),
    ];

    const headerRow3 = [
        {}, {},
        h('(kg)',  { fontSize: 9 }),
        h('/kg',   { fontSize: 9 }),
        h('/btg',  { fontSize: 9 }),
        h('/btg',  { fontSize: 9 }),
        h('/kg',   { fontSize: 9 }),
        h('/btg',  { fontSize: 9 }),
        h('/btg',  { fontSize: 9 }),
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 12, 8, 32],

        content: [
            {
                text:      'UNP',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 6],
            },
            {
                table: {
                    headerRows: 3,
                    widths: ['19%', '14%', '8%', '10%', '10%', '10%', '10%', '10%', '9%'],
                    body:   [headerRow1, headerRow2, headerRow3, ...rows.map(function (r) { return r.cells; })],
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
                margin: [8, 4, 8, 0],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN',                                fontSize: 9, margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan',   fontSize: 9, margin: [0, 0, 0, 0] },
                        ],
                    },
                    {
                        width:     'auto',
                        text:      'Page ' + currentPage + '/' + pageCount,
                        fontSize:  9,
                        bold:      true,
                        alignment: 'center',
                        margin:    [10, 0, 10, 0],
                    },
                    {
                        width:     'auto',
                        text:      generatedAt,
                        fontSize:  9,
                        italics:   true,
                        alignment: 'right',
                    },
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
