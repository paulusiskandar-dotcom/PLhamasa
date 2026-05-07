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

const EM = '—'; // em dash — for null/zero values

function roundSpecial(raw) {
    if (!raw) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

function fmtBerat(b) {
    const n = parseFloat(b);
    if (!n || n === 0) return EM;
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

function fmtPrice(n) {
    if (!n || n === 0) return EM;
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBtg(n) {
    if (!n || n === 0) return EM;
    return new Intl.NumberFormat('id-ID').format(n);
}

const meta = {
    name:         'Sheetpile',
    cat_id:       null,
    cat_name:     'SHEETPILE',
    description:  'Template Sheetpile — A5 landscape, harga cash & kredit gudang per kg & batang',
    custom_fields: [],
};

function render({ items, customValues }) {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    const rows = items.map(function (item) {
        const weight = parseFloat(item.weight) || 0;
        const cgKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kgKg   = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

        const cgBtg = (cgKg && weight) ? roundSpecial(cgKg * weight) : 0;
        const kgBtg = (kgKg && weight) ? roundSpecial(kgKg * weight) : 0;

        return {
            _name:   item.name || '',
            _weight: weight,
            cells: [
                { text: item.name || '', alignment: 'left',   fontSize: 10, margin: [6, 0, 0, 0] },
                { text: fmtBerat(weight), alignment: 'center', fontSize: 10 },
                { text: fmtPrice(cgKg),   alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(cgBtg),    alignment: 'right',  fontSize: 10 },
                { text: fmtPrice(kgKg),   alignment: 'right',  fontSize: 10 },
                { text: fmtBtg(kgBtg),    alignment: 'right',  fontSize: 10 },
            ],
        };
    });

    rows.sort(function (a, b) { return a._name.localeCompare(b._name); });

    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({ text: text, bold: true, fillColor: hFill, alignment: 'center' }, extra || {});
    }

    // Row 1: UKURAN(rs2) | BERAT | CASH(cs2) | {} | KREDIT(cs2) | {}
    const headerRow1 = [
        h('UKURAN',  { rowSpan: 2, verticalAlignment: 'middle', fontSize: 11 }),
        h('BERAT',   { fontSize: 11 }),
        h('CASH',    { colSpan: 2, fontSize: 11 }), {},
        h('KREDIT',  { colSpan: 2, fontSize: 11 }), {},
    ];

    // Row 2: {} | (kg) | /kg | /batang | /kg | /batang
    const headerRow2 = [
        {},
        h('(kg)',    { fontSize: 9 }),
        h('/kg',     { fontSize: 9 }),
        h('/batang', { fontSize: 9 }),
        h('/kg',     { fontSize: 9 }),
        h('/batang', { fontSize: 9 }),
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        content: [
            {
                text:      'SHEETPILE',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 6],
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['38%', '12.4%', '12.4%', '12.4%', '12.4%', '12.4%'],
                    heights: function (row) { return row < 2 ? 22 : 'auto'; },
                    body:   [headerRow1, headerRow2, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 4; },
                    paddingBottom: function () { return 4; },
                },
            },
        ],

        footer: function () {
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
