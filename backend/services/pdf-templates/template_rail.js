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

const meta = {
    name:         'Rail',
    cat_id:       null,
    cat_name:     'RAIL',
    description:  'Template Besi Rail — A5 landscape, dimensi custom',
    custom_fields: [
        { key: 'tinggi',      label: 'Tinggi',        type: 'text' },
        { key: 'lebar_atas',  label: 'Lebar Atas',    type: 'text' },
        { key: 'lebar_bawah', label: 'Lebar Bawah',   type: 'text' },
        { key: 'panjang_mtr', label: 'Panjang (MTR)', type: 'text' },
        { key: 'berat_mtr',   label: 'Berat /MTR',    type: 'text' },
        { key: 'berat_pcs',   label: 'Berat /PCS',    type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');

    const rows = items.map(function (item) {
        const cv      = customValues[item.ig_id] || {};
        const cashKg  = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
        const beratPcs = parseFloat(cv.berat_pcs) || 0;
        const hargaBtg = beratPcs > 0 ? roundSpecial(cashKg * beratPcs) : 0;

        return {
            _tinggi: parseFloat(cv.tinggi) || 9999,
            cells: [
                { text: cv.tinggi      || '', alignment: 'center', fontSize: 11 },
                { text: cv.lebar_atas  || '', alignment: 'center', fontSize: 11 },
                { text: cv.lebar_bawah || '', alignment: 'center', fontSize: 11 },
                { text: cv.panjang_mtr || '', alignment: 'center', fontSize: 11 },
                { text: cv.berat_mtr   || '', alignment: 'center', fontSize: 11 },
                { text: cv.berat_pcs   || '', alignment: 'center', fontSize: 11 },
                { text: fmtNum(cashKg),       alignment: 'right',  fontSize: 11 },
                { text: fmtNum(hargaBtg),     alignment: 'right',  fontSize: 11 },
            ],
        };
    });

    rows.sort(function (a, b) { return a._tinggi - b._tinggi; });

    const hFill = '#E8ECF0';

    const headerRow1 = [
        { text: 'UKURAN', colSpan: 4, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {}, {}, {},
        { text: 'BERAT',  colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
        { text: 'HARGA\nPER KG\n(Rp)',  rowSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
        { text: 'HARGA\nPER BTG\n(Rp)', rowSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
    ];

    const headerRow2 = [
        { text: 'TINGGI',           alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: 'LEBAR\nATAS',      alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: 'LEBAR\nBAWAH',     alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: 'PANJANG\n(MTR)',   alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: '/ MTR',            alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        { text: '/ PCS',            alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        {}, // rowspan from row 1
        {}, // rowspan from row 1
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'BESI RAIL',
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
                    widths: ['10%', '11%', '11%', '11%', '10%', '10%', '16%', '21%'],
                    body: [headerRow1, headerRow2, ...rows.map(function (r) { return r.cells; })],
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
            {
                text:      'Jakarta, ' + generatedAt,
                alignment: 'right',
                fontSize:  11,
                margin:    [0, 8, 0, 4],
            },
            { text: 'HARGA SUDAH TERMASUK PPN',             bold: true, fontSize: 11, margin: [0, 0, 0, 2] },
            { text: 'HARGA BELUM TERMASUK ONGKOS KIRIM',    bold: true, fontSize: 11, margin: [0, 0, 0, 2] },
            { text: 'HARAP CHECK STOCK BARANG !!!',          bold: true, fontSize: 11, margin: [0, 0, 0, 0] },
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
