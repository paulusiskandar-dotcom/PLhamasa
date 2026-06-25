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

function formatJakartaTimestamp() {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');
}

const meta = {
    name:         'Grating',
    cat_id:       null,
    cat_name:     'Grating',
    description:  'Template Grating — A5 landscape, ukuran inch/ft, harga per lembar',
    custom_fields: [
        { key: 'tinggi_inch', label: 'Tinggi (inch)', type: 'text' },
        { key: 'tebal_inch',  label: 'Tebal (inch)',  type: 'text' },
        { key: 'lebar_ft',    label: 'Lebar (ft)',     type: 'text' },
        { key: 'panjang_ft',  label: 'Panjang (ft)',   type: 'text' },
        { key: 'grade',       label: 'Grade',           type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = formatJakartaTimestamp();

    const rows = items.map(function (item) {
        const cv     = customValues[item.ig_id] || {};
        const weight = parseFloat(item.weight) || 0;

        const beratText = String(weight % 1 === 0 ? Math.round(weight) : weight);

        const cashGudang = item.prices && item.prices.cash_gudang;
        const cashKg     = cashGudang ? cashGudang.current : null;

        let hargaText;
        if (cashKg === null || cashKg === undefined) {
            hargaText = '-';
        } else {
            const harga = roundSpecial(cashKg * weight);
            hargaText   = (!harga || harga === 0) ? '-' : new Intl.NumberFormat('id-ID').format(harga);
        }

        return {
            _weight: weight,
            _name:   item.name || '',
            cells: [
                { text: cv.tinggi_inch || '-', alignment: 'center', fontSize: 10.5 },
                { text: cv.tebal_inch  || '-', alignment: 'center', fontSize: 10.5 },
                { text: cv.lebar_ft    || '-', alignment: 'center', fontSize: 10.5 },
                { text: cv.panjang_ft  || '-', alignment: 'center', fontSize: 10.5 },
                { text: beratText,             alignment: 'center', fontSize: 10.5 },
                { text: cv.grade       || '-', alignment: 'center', fontSize: 10.5 },
                { text: hargaText,             alignment: 'right',  fontSize: 10.5 },
            ],
        };
    });

    rows.sort(function (a, b) {
        if (a._weight !== b._weight) return a._weight - b._weight;
        return a._name.localeCompare(b._name);
    });

    const hFill = '#E8ECF0';

    function hLabel(text, extra) {
        return Object.assign({
            text:              text,
            bold:              true,
            fontSize:          11,
            color:             '#111',
            fillColor:         hFill,
            alignment:         'center',
            verticalAlignment: 'middle',
        }, extra || {});
    }

    function hUnit(text, extra) {
        return Object.assign({
            text:              text,
            italics:           true,
            fontSize:          9.5,
            color:             '#000000',
            fillColor:         hFill,
            alignment:         'center',
            verticalAlignment: 'middle',
        }, extra || {});
    }

    const headerRow1 = [
        hLabel('UKURAN', { colSpan: 4 }), {}, {}, {},
        hLabel('BERAT',  { rowSpan: 2 }),
        hLabel('GRADE',  { rowSpan: 3 }),
        hLabel('HARGA',  { rowSpan: 2 }),
    ];

    const headerRow2 = [
        hLabel('TINGGI'),
        hLabel('TEBAL'),
        hLabel('LEBAR'),
        hLabel('PANJANG'),
        {}, {}, {},
    ];

    const headerRow3 = [
        hUnit('(inch)'),
        hUnit('(inch)'),
        hUnit('(ft)'),
        hUnit('(ft)'),
        hUnit('(kg)'),
        {},
        hUnit('(Rp/lbr)'),
    ];

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        content: [
            {
                text:      'GRATING',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 6],
            },
            {
                table: {
                    headerRows: 3,
                    widths: ['11%', '11%', '11%', '11%', '14%', '14%', '28%'],
                    body:   [headerRow1, headerRow2, headerRow3, ...rows.map(function (r) { return r.cells; })],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#000000'; },
                    vLineColor: function () { return '#000000'; },
                    paddingLeft:   function (i) { return i === 6 ? 8 : 4; },
                    paddingRight:  function (i) { return i === 6 ? 8 : 4; },
                    paddingTop:    function () { return 7; },
                    paddingBottom: function () { return 7; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [20, 5, 20, 0],
                columns: [
                    { width: '*',    text: '• Harga sudah termasuk PPN', fontSize: 9 },
                    { width: 'auto', text: 'Page ' + currentPage + '/' + pageCount, fontSize: 9, alignment: 'center', margin: [10, 0, 10, 0] },
                    { width: 'auto', text: generatedAt, fontSize: 9, italics: true, alignment: 'right' },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 10.5,
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
