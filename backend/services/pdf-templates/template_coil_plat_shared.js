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
    if (!n || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBerat(b) {
    if (!b) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(b);
}

function makeRender() {
    return function render({ items, customValues }) {
        const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

        const rows = items.map(function (item) {
            const cv       = customValues[item.ig_id] || {};
            const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
            const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
            const weight   = parseFloat(item.weight) || 0;

            return {
                _weight: weight,
                _name: item.name,
                cells: [
                    { text: item.name,            alignment: 'left',   fontSize: 10 },
                    { text: cv.tebal_mm || '',    alignment: 'center', fontSize: 10 },
                    { text: fmtBerat(weight),     alignment: 'center', fontSize: 10 },
                    { text: fmtNum(cashKg),       alignment: 'right',  fontSize: 10 },
                    { text: fmtNum(roundSpecial(cashKg * weight)),   alignment: 'right', fontSize: 10 },
                    { text: fmtNum(kreditKg),     alignment: 'right',  fontSize: 10 },
                    { text: fmtNum(roundSpecial(kreditKg * weight)), alignment: 'right', fontSize: 10 },
                ],
            };
        });

        rows.sort(function (a, b) { 
            // Sort by name, then weight
            if (a._name < b._name) return -1;
            if (a._name > b._name) return 1;
            return a._weight - b._weight; 
        });

        const hFill = '#E8ECF0';
        const headerGroup = [
            { text: 'NAMA BARANG', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
            { text: 'TEBAL',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
            { text: 'BERAT',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
            { text: 'CASH',   colSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill }, {},
            { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill }, {},
        ];
        const headerSub = [
            { text: '',         alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(mm)',     alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(kg)',     alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(Rp/kg)', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(Rp/btg)',alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(Rp/kg)', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: '(Rp/btg)',alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
        ];

        const dd = {
            pageSize:        'A4',
            pageOrientation: 'portrait',
            pageMargins:     [20, 40, 20, 30],

            header: function () {
                return {
                    text:      'COIL & PLAT',
                    alignment: 'center',
                    bold:      true,
                    fontSize:  16,
                    margin:    [0, 15, 0, 6],
                };
            },

            content: [
                {
                    table: {
                        headerRows: 2,
                        widths: ['35%', '10%', '11%', '11%', '11%', '11%', '11%'],
                        body:   [headerGroup, headerSub, ...rows.map(function (r) { return r.cells; })],
                    },
                    layout: {
                        hLineWidth: function () { return 0.5; },
                        vLineWidth: function () { return 0.5; },
                        hLineColor: function () { return '#000000'; },
                        vLineColor: function () { return '#000000'; },
                        paddingLeft:   function () { return 3; },
                        paddingRight:  function () { return 3; },
                        paddingTop:    function () { return 4; },
                        paddingBottom: function () { return 4; },
                    },
                },
            ],

            footer: function (currentPage, pageCount) {
                return {
                    margin: [20, 5, 20, 0],
                    columns: [
                        { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 10 },
                        { text: 'Jakarta, ' + generatedAt,                alignment: 'right', fontSize: 10 },
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
    };
}

module.exports = { makeRender };
