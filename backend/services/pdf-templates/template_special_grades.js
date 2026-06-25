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

function fmtNum(n) {
    if (!n || n === 0) return '';
    return new Intl.NumberFormat('id-ID').format(n);
}

// Hardcoded sizes based on the snippet
const A283_RANGES = [
    { label: "6.00", match: (i) => i.includes('6.0') || i.includes('6 ') },
    { label: "8.00 - 12.00", match: (i) => false }, // complex matching, usually we just leave blank if no DB match
    { label: "14.00 - 25.00", match: (i) => false }
];

const SS540_RANGES = [
    { label: "8.00 - 25.00", match: (i) => false }
];

const PO_RANGES = [
    { label: "2.00 - 5.50", match: (i) => false }
];

const meta = {
    name:         'A 283, SS 540, PO',
    cat_id:       null,
    cat_name:     'Coil & Plat Hitam',
    description:  'Template khusus untuk grade A 283, SS 540, dan SPHC-PO. (A5 Landscape)',
    custom_fields: [],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    // Separate items by grade
    const a283Items = items.filter(i => i.name && (i.name.includes('A 283') || i.name.includes('A283') || i.name.includes('A-283')));
    const ss540Items = items.filter(i => i.name && (i.name.includes('SS 540') || i.name.includes('SS540')));
    const poItems = items.filter(i => i.name && (i.name.includes('SPHC-PO') || i.name.includes('-PO ')));

    const hFill = '#E8ECF0';
    const hFill2 = '#D0D8E0'; // Slightly darker for main headers

    const getModePrice = (pricesArray) => {
        if (!pricesArray || pricesArray.length === 0) return 0;
        const counts = {};
        pricesArray.forEach(p => {
            if (p > 0) counts[p] = (counts[p] || 0) + 1;
        });
        let mode = 0;
        let maxCount = 0;
        for (const pStr in counts) {
            const p = parseFloat(pStr);
            if (counts[p] > maxCount) {
                maxCount = counts[p];
                mode = p;
            } else if (counts[p] === maxCount && p > mode) {
                mode = p;
            }
        }
        return mode;
    };

    // --- TABLE 1: A 283 GRD C ---
    const tableA283Body = [
        // Main Header
        [{ text: 'A 283 GRD C', colSpan: 5, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill2 }, {}, {}, {}, {}],
        // Sub Header Cash/Kredit
        [
            { text: 'TEBAL', rowSpan: 2, alignment: 'center', bold: true, fontSize: 10, fillColor: hFill, margin: [0, 6, 0, 0] },
            { text: 'CASH', colSpan: 2, alignment: 'center', bold: true, fontSize: 10, fillColor: hFill }, {},
            { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fontSize: 10, fillColor: hFill }, {}
        ],
        // Columns
        [
            {},
            { text: "5' X 20'", alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: "6' X 20'", alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: "5' X 20'", alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: "6' X 20'", alignment: 'center', bold: true, fontSize: 10, fillColor: hFill }
        ]
    ];

    A283_RANGES.forEach(range => {
        // Attempt to find cash/kredit prices for 5x20 and 6x20 if items exist.
        let cash5 = [], cash6 = [], kredit5 = [], kredit6 = [];
        
        a283Items.forEach(item => {
            const is5 = item.name.includes("5'") || item.name.includes("1500") || item.name.includes("1524");
            const is6 = item.name.includes("6'") || item.name.includes("1800") || item.name.includes("1829");
            
            if (range.match(item.name)) {
                const cash = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
                const kredit = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
                if (is5) { cash5.push(cash); kredit5.push(kredit); }
                if (is6) { cash6.push(cash); kredit6.push(kredit); }
            }
        });

        tableA283Body.push([
            { text: range.label, alignment: 'center', fontSize: 10 },
            { text: fmtNum(getModePrice(cash5)), alignment: 'right', fontSize: 10 },
            { text: fmtNum(getModePrice(cash6)), alignment: 'right', fontSize: 10 },
            { text: fmtNum(getModePrice(kredit5)), alignment: 'right', fontSize: 10 },
            { text: fmtNum(getModePrice(kredit6)), alignment: 'right', fontSize: 10 }
        ]);
    });

    // --- TABLE 2: PLAT SS 540 ---
    const tableSS540Body = [
        [{ text: 'PLAT SS 540', colSpan: 3, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill2 }, {}, {}],
        [
            { text: 'TEBAL', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: 'CASH', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: 'KREDIT', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill }
        ]
    ];

    SS540_RANGES.forEach(range => {
        let cashPrices = [], kreditPrices = [];
        ss540Items.forEach(item => {
            const cash = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
            const kredit = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
            cashPrices.push(cash);
            kreditPrices.push(kredit);
        });

        tableSS540Body.push([
            { text: range.label, alignment: 'center', fontSize: 10 },
            { text: fmtNum(getModePrice(cashPrices)), alignment: 'right', fontSize: 10 },
            { text: fmtNum(getModePrice(kreditPrices)), alignment: 'right', fontSize: 10 }
        ]);
    });

    // --- TABLE 3: COIL SPHC-PO ---
    const tablePOBody = [
        [{ text: 'COIL SPHC-PO', colSpan: 3, alignment: 'center', bold: true, fontSize: 11, fillColor: hFill2 }, {}, {}],
        [
            { text: "4' / 1219", alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: 'CASH', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill },
            { text: 'KREDIT', alignment: 'center', bold: true, fontSize: 10, fillColor: hFill }
        ]
    ];

    PO_RANGES.forEach(range => {
        let cashPrices = [], kreditPrices = [];
        poItems.forEach(item => {
            const cash = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
            const kredit = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
            cashPrices.push(cash);
            kreditPrices.push(kredit);
        });

        tablePOBody.push([
            { text: range.label, alignment: 'center', fontSize: 10 },
            { text: fmtNum(getModePrice(cashPrices)), alignment: 'right', fontSize: 10 },
            { text: fmtNum(getModePrice(kreditPrices)), alignment: 'right', fontSize: 10 }
        ]);
    });


    // --- DOC DEFINITION ---
    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [15, 30, 15, 25],

        header: function () {
            return {
                text:      'SPECIAL GRADES: A 283, SS 540, SPHC-PO',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 10, 0, 6],
            };
        },

        content: [
            {
                columns: [
                    // LEFT COLUMN (A 283)
                    {
                        width: '50%',
                        table: {
                            headerRows: 3,
                            widths: ['24%', '19%', '19%', '19%', '19%'],
                            body: tableA283Body
                        },
                        layout: {
                            hLineWidth: () => 0.5,
                            vLineWidth: () => 0.5,
                            hLineColor: () => '#000000',
                            vLineColor: () => '#000000',
                            paddingLeft: () => 4,
                            paddingRight: () => 4,
                            paddingTop: () => 4,
                            paddingBottom: () => 4,
                        }
                    },
                    { width: '2%', text: '' }, // spacer
                    // RIGHT COLUMN (SS 540 & PO)
                    {
                        width: '48%',
                        stack: [
                            {
                                table: {
                                    headerRows: 2,
                                    widths: ['40%', '30%', '30%'],
                                    body: tableSS540Body
                                },
                                layout: {
                                    hLineWidth: () => 0.5,
                                    vLineWidth: () => 0.5,
                                    hLineColor: () => '#000000',
                                    vLineColor: () => '#000000',
                                    paddingLeft: () => 4,
                                    paddingRight: () => 4,
                                    paddingTop: () => 4,
                                    paddingBottom: () => 4,
                                }
                            },
                            { text: '', margin: [0, 15, 0, 0] }, // Vertical spacer
                            {
                                table: {
                                    headerRows: 2,
                                    widths: ['40%', '30%', '30%'],
                                    body: tablePOBody
                                },
                                layout: {
                                    hLineWidth: () => 0.5,
                                    vLineWidth: () => 0.5,
                                    hLineColor: () => '#000000',
                                    vLineColor: () => '#000000',
                                    paddingLeft: () => 4,
                                    paddingRight: () => 4,
                                    paddingTop: () => 4,
                                    paddingBottom: () => 4,
                                }
                            }
                        ]
                    }
                ]
            }
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [15, 5, 15, 0],
                columns: [
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 9 },
                    { text: 'Jakarta, ' + generatedAt,                alignment: 'right', fontSize: 9 },
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
