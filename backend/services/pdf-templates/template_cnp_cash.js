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
    name:         'CNP Cash Gudang',
    cat_id:       null,
    cat_name:     'CNP',
    description:  'Template CNP — harga cash gudang, A5 landscape',
    custom_fields: [
        { key: 'bahan',      label: 'Bahan',      type: 'text' },
        { key: 'berat_asli', label: 'Berat Asli', type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');

    const rows = items.map(function (item) {
        const cv     = customValues[item.ig_id] || {};
        const weight = parseFloat(item.weight) || 0;
        const kg     = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
        const btg    = (kg && weight) ? roundSpecial(kg * weight) : 0;

        return {
            _name:   item.name || '',
            _weight: weight,
            cells: [
                { text: item.name || '',      alignment: 'center', fontSize: 10 },
                { text: cv.bahan || '',       alignment: 'center', fontSize: 10, bold: true },
                { text: fmtBerat(weight),     alignment: 'center', fontSize: 10 },
                { text: fmtNum(kg),           alignment: 'right',  fontSize: 10 },
                { text: fmtNum(btg),          alignment: 'right',  fontSize: 10 },
                { text: cv.berat_asli || '',  alignment: 'center', fontSize: 10, italics: true, bold: true },
            ],
        };
    });

    rows.sort(function (a, b) {
        const nc = a._name.localeCompare(b._name);
        return nc !== 0 ? nc : a._weight - b._weight;
    });

    const hFill = '#E8ECF0';
    const headerRow = [
        { text: 'UKURAN',    alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'BAHAN',     alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'BRT TABEL', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: 'KG',        alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'BTG',       alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'BRT ASLI',  alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'CNP — CASH GUDANG',
                alignment: 'center',
                bold:      true,
                fontSize:  16,
                margin:    [0, 8, 0, 6],
            };
        },

        content: [
            {
                table: {
                    headerRows: 1,
                    widths: ['25%', '15%', '13%', '14%', '15%', '13%'],
                    body: [headerRow, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 4; },
                    paddingRight:  function () { return 4; },
                    paddingTop:    function () { return 3; },
                    paddingBottom: function () { return 3; },
                },
            },
            {
                text:      'Jakarta, ' + generatedAt,
                alignment: 'right',
                fontSize:  10,
                margin:    [0, 8, 0, 6],
            },
            {
                text:    '- U/ Pesanan panjang lebih atau kurang dari 6 mtr harga ditambah Rp 50/kg & pesanan min. 25 btg',
                fontSize: 9,
                italics:  true,
                margin:   [0, 0, 0, 2],
            },
            {
                text:    '- Untuk tebal Non Standard harga ditambah Rp 100/kg dan pesanan minimum 200 btg',
                fontSize: 9,
                italics:  true,
                margin:   [0, 0, 0, 4],
            },
            {
                text:    'KW II    RP 9.500,-/Kg DARI BERAT TIMBANGAN',
                fontSize: 10,
                bold:     true,
                margin:   [0, 0, 0, 0],
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
