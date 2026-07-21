const PdfPrinter = require('pdfmake/src/printer');
const moment = require('moment-timezone');

moment.locale('id');

const fonts = {
    Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};

function roundSpecial(raw) {
    if (!raw) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

function fmtNum(n) {
    if (n === null || n === undefined || n === '' || n === 0) return '-';
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
    name: 'Beton Polos & Kawat Beton',
    cat_id: 'BP_KW',
    cat_name: 'BETON POLOS & KAWAT BETON',
    description: 'Template Beton Polos & Kawat Beton — A5 landscape, split cash & kredit',
    custom_fields: []
};

// Extractor for sizes from i_name (e.g. "Beton Polos 10 mm ...")
function extractSize(name) {
    const m = name.match(/ (\d+\.?\d*)\s*mm/i);
    return m ? parseFloat(m[1]) : 0;
}

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    // Group items by size
    const grouped = {};
    let kawatBetonItem = null;
    items.forEach(item => {
        if (item.name && item.name.toUpperCase().includes('KAWAT BETON')) {
            kawatBetonItem = item;
            return;
        }
        if (item.cat_id === 'KW' || (item.name && item.name.toUpperCase().includes('KAWAT'))) {
            return;
        }
        const size = extractSize(item.name);
        if (size === 0) return; // Skip if no size found

        if (!grouped[size]) {
            grouped[size] = {
                size: size,
                weight: parseFloat(item.weight) || 0,
                brands: {}
            };
        }

        // Use the first valid item per brand we encounter (usually Lurus/Tekuk have same price)

        let brandKey = (item.i_brand || '').toUpperCase();
        if (brandKey === 'SSS') {
            brandKey = 'SOLID';
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

    // Helper to build a table row for a specific price mode (cash or kredit)

    function buildBodyRows(isKredit) {
        const typePabrik = isKredit ? 'kredit_pabrik' : 'cash_pabrik';
        const typeGudang = isKredit ? 'kredit_gudang' : 'cash_gudang';

        return rows.map(row => {
            const ksBrand = row.brands['KS'];
            const isBrand = row.brands['IS'];
            const lsBrand = row.brands['LS'];
            const solidBrand = row.brands['SOLID'];

            const ksGudangKg = getPrice(ksBrand, typeGudang);

            const isPabrikKg = getPrice(isBrand, typePabrik);
            const isGudangKg = getPrice(isBrand, typeGudang);

            const lsGudangKg = getPrice(lsBrand, typeGudang);
            const solidGudangKg = getPrice(solidBrand, typeGudang);

            return [
                { text: row.size + ' mm', alignment: 'center', fontSize: fsMain },
                { text: fmtBerat(row.weight), alignment: 'center', fontSize: fsMain },

                // KS
                { text: fmtNum(ksGudangKg ? roundSpecial(ksGudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(ksGudangKg), alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain },

                // IS
                { text: fmtNum(isPabrikKg ? roundSpecial(isPabrikKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isPabrikKg), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isGudangKg ? roundSpecial(isGudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(isGudangKg), alignment: 'right', fontSize: fsMain },

                // LS
                { text: fmtNum(lsGudangKg ? roundSpecial(lsGudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(lsGudangKg), alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain },

                // SOLID
                { text: fmtNum(solidGudangKg ? roundSpecial(solidGudangKg * row.weight) : 0), alignment: 'right', fontSize: fsMain },
                { text: fmtNum(solidGudangKg), alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain },
                { text: '', alignment: 'right', fontSize: fsMain }
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
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Pabrik', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: 'Gudang', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {},
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadLg, fillColor: hFill }, {}
            ],
            [
                {}, {},
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: 'btg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: 'kg', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill },
                { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, { text: '', alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }
            ],
            [
                {}, {},
                { text: 'BJTP 280', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTP 280', colSpan: 4, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {}, {}, {},
                { text: 'BJTP 280', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: 'BJTP 280', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {},
                { text: '', colSpan: 2, alignment: 'center', bold: true, fontSize: fsHeadSm, fillColor: hFill }, {}
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

    const dd = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [10, 35, 10, 25],

        header: function () {
            return {
                text: 'HARGA BESI BETON POLOS',
                alignment: 'center',
                bold: true,
                fontSize: 16,
                margin: [0, 15, 0, 0],
            };
        },

        content: [
            {
                text: 'HARGA CASH',
                alignment: 'center',
                bold: true,
                fontSize: 14,
                margin: [0, 0, 0, 4]
            },
            {
                table: {
                    headerRows: 4,
                    widths: [
                        '4.5%', '4.3%',
                        '5.7%', '5.7%', '5.7%', '5.7%', // KS
                        '5.7%', '5.7%', '5.7%', '5.7%', // IS
                        '5.7%', '5.7%', '5.7%', '5.7%', // LS
                        '5.7%', '5.7%', '5.7%', '5.7%'  // SOLID
                    ],
                    body: [...createHeader(), ...buildBodyRows(false)],
                },
                layout: tableLayout,
                margin: [0, 0, 0, 6]
            },
            {
                text: 'HARGA KREDIT',
                alignment: 'center',
                bold: true,
                fontSize: 14,
                margin: [0, 0, 0, 4]
            },
            {
                table: {
                    headerRows: 0,
                    widths: [
                        '4.5%', '4.3%',
                        '5.7%', '5.7%', '5.7%', '5.7%', // KS
                        '5.7%', '5.7%', '5.7%', '5.7%', // IS
                        '5.7%', '5.7%', '5.7%', '5.7%', // LS
                        '5.7%', '5.7%', '5.7%', '5.7%'  // SOLID
                    ],
                    body: [...buildBodyRows(true)],
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

    // Remove the hard pageBreak if there are few items, but for 18 sizes it might overflow.
    // pdfmake automatically breaks pages inside tables, but a header might get separated.
    // I will remove pageBreak: 'before' so it fits naturally.




    if (kawatBetonItem) {
        const getKawatPrice = (isKredit) => {
            const typePabrik = isKredit ? 'kredit_pabrik' : 'cash_pabrik';
            const typeGudang = isKredit ? 'kredit_gudang' : 'cash_gudang';

            let pKg = getPrice(kawatBetonItem, typePabrik);
            if (!pKg) pKg = getPrice(kawatBetonItem, typeGudang);

            const w = kawatBetonItem.weight || 10;
            return fmtNum(pKg ? roundSpecial(pKg * w) : 0);
        };

        const cashPrice = getKawatPrice(false);
        const kreditPrice = getKawatPrice(true);

        dd.content.push({
            margin: [0, 5, 0, 0],
            columns: [
                {
                    width: '50%',
                    text: `* Kawat Beton (10 kg): ${cashPrice} (Cash)`,
                    fontSize: fsMain,
                    bold: true,
                    alignment: 'left'
                },
                {
                    width: '50%',
                    text: `* Kawat Beton (10 kg): ${kreditPrice} (Kredit)`,
                    fontSize: fsMain,
                    bold: true,
                    alignment: 'left'
                }
            ]
        });
    }

    dd.content[2].pageBreak = undefined;

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
