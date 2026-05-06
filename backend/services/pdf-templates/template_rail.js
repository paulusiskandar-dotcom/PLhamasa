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

// Harga: nol atau kosong tampil '-'
function fmtHarga(n) {
    if (!n || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

// Berat/panjang: integer tanpa desimal, desimal pakai koma Indonesian
function fmtBeratVal(v) {
    if (!v && v !== 0) return '-';
    const n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n) || n === 0) return '-';
    return n % 1 === 0 ? String(Math.round(n)) : String(n).replace('.', ',');
}

const meta = {
    name:         'Besi Rail',
    cat_id:       'RAIL',
    cat_name:     'RAIL',
    description:  'Template Besi Rail — A5 landscape, 8 kolom',
    custom_fields: [
        { key: 'tinggi',      label: 'Tinggi (mm)',       type: 'text' },
        { key: 'lebar_atas',  label: 'Lebar Atas (mm)',   type: 'text' },
        { key: 'lebar_bawah', label: 'Lebar Bawah (mm)',  type: 'text' },
        { key: 'panjang_mtr', label: 'Panjang (m)',       type: 'text' },
        { key: 'berat_mtr',   label: 'Berat /Meter (kg)', type: 'text' },
        { key: 'berat_pcs',   label: 'Berat /Pcs (kg)',   type: 'text' },
    ],
};

function render({ items, customValues }) {
    const _d = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    const rows = items.map(function (item) {
        const cv      = customValues[item.ig_id] || {};
        const cashKg  = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;

        const beratPcsVal = cv.berat_pcs || '';
        const beratPcsNum = parseFloat(String(beratPcsVal).replace(',', '.')) || 0;
        const hargaBtgNum = (beratPcsNum > 0 && cashKg > 0) ? roundSpecial(cashKg * beratPcsNum) : 0;

        const dash = function (v) { return v ? String(v) : '-'; };

        return {
            _tinggi:  parseFloat(String(cv.tinggi      || '').replace(',', '.')) || 9999,
            _panjang: parseFloat(String(cv.panjang_mtr || '').replace(',', '.')) || 0,
            cells: [
                { text: dash(cv.tinggi),              alignment: 'center', fontSize: 11 },
                { text: dash(cv.lebar_atas),           alignment: 'center', fontSize: 11 },
                { text: dash(cv.lebar_bawah),          alignment: 'center', fontSize: 11 },
                { text: fmtBeratVal(cv.panjang_mtr),   alignment: 'center', fontSize: 11 },
                { text: fmtBeratVal(cv.berat_mtr),     alignment: 'center', fontSize: 11 },
                { text: fmtBeratVal(cv.berat_pcs),     alignment: 'center', fontSize: 11 },
                { text: fmtHarga(cashKg),              alignment: 'right',  fontSize: 11 },
                { text: fmtHarga(hargaBtgNum),         alignment: 'right',  fontSize: 11 },
            ],
        };
    });

    rows.sort(function (a, b) {
        if (a._tinggi !== b._tinggi) return a._tinggi - b._tinggi;
        return a._panjang - b._panjang;
    });

    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({ text: text, fillColor: hFill, alignment: 'center' }, extra || {});
    }

    // ROW 1: group — HARGA cols span row 1 + row 2
    const headerRow1 = [
        h('UKURAN',     { colSpan: 4, bold: true, fontSize: 12 }), {}, {}, {},
        h('BERAT',      { colSpan: 2, bold: true, fontSize: 12 }), {},
        h('HARGA /KG',  { rowSpan: 2, bold: true, fontSize: 12, margin: [0, 6, 0, 0] }),
        h('HARGA /BTG', { rowSpan: 2, bold: true, fontSize: 12, margin: [0, 6, 0, 0] }),
    ];

    // ROW 2: sub labels
    const headerRow2 = [
        h('TINGGI',  { bold: true, fontSize: 11 }),
        h('ATAS',    { bold: true, fontSize: 11 }),
        h('BAWAH',   { bold: true, fontSize: 11 }),
        h('PANJANG', { bold: true, fontSize: 11 }),
        h('/Meter',  { bold: true, fontSize: 11 }),
        h('/Pcs',    { bold: true, fontSize: 11 }),
        {}, {},  // rowSpan placeholders
    ];

    // ROW 3: units
    const headerRow3 = [
        h('(mm)', { fontSize: 10 }),
        h('(mm)', { fontSize: 10 }),
        h('(mm)', { fontSize: 10 }),
        h('(m)',  { fontSize: 10 }),
        h('(kg)', { fontSize: 10 }),
        h('(kg)', { fontSize: 10 }),
        h('(Rp)', { fontSize: 10 }),
        h('(Rp)', { fontSize: 10 }),
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 12, 8, 44],

        content: [
            {
                text:      'BESI RAIL',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 8],
            },
            {
                table: {
                    headerRows: 3,
                    widths: ['9%', '12%', '13%', '11%', '10%', '10%', '14%', '*'],
                    body:   [headerRow1, headerRow2, headerRow3, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 4; },
                    paddingRight:  function () { return 4; },
                    paddingTop:    function () { return 5; },
                    paddingBottom: function () { return 5; },
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
                            { text: '• Harga sudah termasuk PPN',                                 fontSize: 9 },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan',    fontSize: 9 },
                            { text: '• Untuk konfirmasi harga terbaru, hubungi sales',             fontSize: 9 },
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
