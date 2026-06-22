const fonts = {
    Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
    }
};
const PdfPrinter = require('pdfmake');
const moment = require('moment-timezone');
require('moment/locale/id');

const meta = {
    name: 'Beton Ulir',
    cat_name: 'BETON ULIR',
    description: 'Template Beton Ulir — A5 landscape, split cash & kredit',
    custom_fields: []
};

function extractSize(name) {
    const m = name.match(/ (\d+\.?\d*)\s*mm/i);
    return m ? parseFloat(m[1]) : 0;
}

function fmtNum(n) {
    if (!n) return '-';
    return Number(n).toLocaleString('id-ID');
}

function fmtBerat(n) {
    if (!n) return '-';
    return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundSpecial(val) {
    return Math.round(val / 100) * 100;
}

async function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');
    const hFill = '#e6e6e6';

    const grouped = {};
    items.forEach(item => {
        const size = extractSize(item.name);
        if (!size) return;

        if (!grouped[size]) {
            grouped[size] = {
                size,
                weight: item.weight,
                brands: {}
            };
        }



        let brandKey = (item.i_brand || '').toUpperCase();
        if (brandKey === 'KS') {

            if (item.name.includes('520')) {
                brandKey = 'KS_520';
            } else {
                brandKey = 'KS_420';
            }
        } else if (brandKey === 'LS') {
            if (item.name.includes('420')) {
                brandKey = 'LS_420';
            } else {
                brandKey = 'LS_280';
            }
        } else if (brandKey === 'SSS') {
            if (item.name.includes('420')) {
                brandKey = 'SOLID_420';
            } else {
                brandKey = 'SOLID_280';
            }
        }

        if (!grouped[size].brands[brandKey] || (!grouped[size].brands[brandKey].prices.cash_gudang && item.prices.cash_gudang)) {
            grouped[size].brands[brandKey] = item;
        }
    });

    const rows = Object.values(grouped).sort((a, b) => a.size - b.size);

    const totalRows = rows.length;
    let fsMain = 9.5;
    let fsHeadLg = 10;
    let fsHeadSm = 8.5;
    let dynPadV = 3.2;

    if (totalRows > 22) {
        // If it's impossible to fit on one page without extreme squishing,
        // revert to a comfortable density and let it naturally overflow to page 2.
        fsMain = 8.5;
        fsHeadLg = 8.5;
        fsHeadSm = 7.5;
        dynPadV = 2.5;
    } else if (totalRows > 18) {
        fsMain = 7.5;
        fsHeadLg = 7.5;
        fsHeadSm = 6.5;
        dynPadV = 1.5;
    } else if (totalRows > 14) {
        fsMain = 8;
        fsHeadLg = 8;
        fsHeadSm = 7;
        dynPadV = 2;
    }


    function getPrice(item, priceType) {
        if (!item || !item.prices || !item.prices[priceType] || !item.prices[priceType].current) return 0;
        return item.prices[priceType].current;
    }


    function buildBodyRows(isKredit) {
        const typePabrik = isKredit ? 'kredit_pabrik' : 'cash_pabrik';
        const typeGudang = isKredit ? 'kredit_gudang' : 'cash_gudang';

        return rows.map(row => {
            const ks_420 = row.brands['KS_420'];
            const ks_520 = row.brands['KS_520'];
            const isBrand = row.brands['IS'];
            const ls_420 = row.brands['LS_420'];
            const ls_280 = row.brands['LS_280'];
            const solid_420 = row.brands['SOLID_420'];
            const solid_280 = row.brands['SOLID_280'];

            const ks420GudangKg = getPrice(ks_420, typeGudang);
            const ks520GudangKg = getPrice(ks_520, typeGudang);

            const isPabrikKg = getPrice(isBrand, typePabrik);
            const isGudangKg = getPrice(isBrand, typeGudang);

            const ls420GudangKg = getPrice(ls_420, typeGudang);
            const ls280GudangKg = getPrice(ls_280, typeGudang);

            const solid420GudangKg = getPrice(solid_420, typeGudang);
            const solid280GudangKg = getPrice(solid_280, typeGudang);

            return [
                { text: row.size + ' mm', alignment: 'center', fontSize: fsMain },
                { text: fmtBerat(row.weight), alignment: 'center', fontSize: fsMain },

                { text: fmtNum(ks420GudangKg ? roundSpecial(ks420GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ks420GudangKg), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ks520GudangKg ? roundSpecial(ks520GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ks520GudangKg), alignment: 'right', fontSize: fsMain },

                { text: fmtNum(isPabrikKg ? roundSpecial(isPabrikKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isPabrikKg), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isGudangKg ? roundSpecial(isGudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isGudangKg), alignment: 'right', fontSize: fsMain },

                { text: fmtNum(ls280GudangKg ? roundSpecial(ls280GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ls280GudangKg), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ls420GudangKg ? roundSpecial(ls420GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ls420GudangKg), alignment: 'right', fontSize: fsMain },

                { text: fmtNum(solid280GudangKg ? roundSpecial(solid280GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(solid280GudangKg), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(solid420GudangKg ? roundSpecial(solid420GudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(solid420GudangKg), alignment: 'right', fontSize: fsMain }
            ];
        });
    }

    const createHeader = () => {
        const hFill = '#e6e6e6';
        const totalHeight = (fsHeadLg + dynPadV * 2) * 2 + (fsHeadSm + dynPadV * 2) * 2;
        const spaceNeeded = (totalHeight - fsHeadSm) / 2 - dynPadV;
        return [
            [
                {
                    rowSpan: 4,
                    fillColor: hFill,
                    text: 'Ukuran',
                    bold: true,
                    alignment: 'center',
                    fontSize: fsHeadSm,
                    relativePosition: { x: 0, y: spaceNeeded }
                },
                {
                    rowSpan: 4,
                    fillColor: hFill,
                    text: 'Berat',
                    bold: true,
                    alignment: 'center',
                    fontSize: fsHeadSm,
                    relativePosition: { x: 0, y: spaceNeeded }
                },
                { text: 'KS', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}, {}, {},
                { text: 'IS', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}, {}, {},
                { text: 'LS', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}, {}, {},
                { text: 'SOLID', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}, {}, {}
            ],
            [
                {}, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Pabrik', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}
            ],
            [
                {}, {},
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }
            ],
            [
                {}, {},
                { text: 'BJTS 420', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTS 520', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTS 420', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {}, {}, {},
                { text: 'BJTS 280', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTS 420', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTS 280', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTS 420', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {}
            ]
        ];
    };
    const tableLayout = {
        hLineWidth: function () { return 0.5; },
        vLineWidth: function () { return 0.5; },
        hLineColor: function () { return '#000000'; },
        vLineColor: function () { return '#000000'; },
        paddingLeft: function () { return 2; },
        paddingRight: function () { return 2; },
        paddingTop: function () { return dynPadV; },
        paddingBottom: function () { return dynPadV; },
    };


    const mainWidths = [
        '6%', '5%',
        '5.5%', '5.5%', '5.5%', '5.5%', // KS
        '5.5%', '5.5%', '5.5%', '5.5%', // IS
        '5.5%', '5.5%', '5.5%', '5.5%', // LS
        '5.5%', '5.5%', '5.5%', '5.5%'  // SOLID
    ];
    const dd = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [10, 45, 10, 30],

        header: function () {
            return {
                text: 'HARGA BESI BETON ULIR',
                alignment: 'center',
                bold: true,
                fontSize: 16,
                margin: [0, 15, 0, 0],
            };
        },

        content: [
            {
                text: 'HARGA CASH',
                bold: true,
                fontSize: 11,
                margin: [0, 0, 0, 2]
            },
            {
                table: {
                    headerRows: 4,
                    widths: mainWidths,
                    body: [...createHeader(), ...buildBodyRows(false)],
                },
                layout: tableLayout,
                margin: [0, 0, 0, 3]
            },
            {
                text: 'HARGA KREDIT',
                bold: true,
                fontSize: 11,
                margin: [0, 0, 0, 2]
            },
            {
                table: {
                    headerRows: 4,
                    widths: mainWidths,
                    body: [...createHeader(), ...buildBodyRows(true)],
                },
                layout: tableLayout,
            }
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [20, 0, 20, 5],
                columns: [
                    {
                        stack: [
                            { text: '• Harga sudah termasuk PPN', fontSize: fsMain },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: fsMain },
                        ],
                        alignment: 'left',
                        width: '*'
                    },
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'center', fontSize: fsMain, width: 'auto', margin: [0, 5, 0, 0] },
                    { text: 'Jakarta, ' + generatedAt, alignment: 'right', fontSize: fsMain, width: '*', margin: [0, 5, 0, 0] },
                ],
            };
        },

        defaultStyle: {
            font: 'Helvetica',
            fontSize: fsMain,
        },
    };



    return new Promise(function (resolve, reject) {
        const printer = new PdfPrinter(fonts);
        const pdfDoc = printer.createPdfKitDocument(dd);
        const chunks = [];
        pdfDoc.on('data', function (chunk) { chunks.push(chunk); });
        pdfDoc.on('end', function () { resolve(Buffer.concat(chunks)); });
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}

module.exports = { meta, render };
