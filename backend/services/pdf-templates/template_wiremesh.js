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

// ── helpers ─────────────────────────────────────────────────────────────────

function roundSpecial(raw) {
    if (!raw) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

const EM = '-';  // em dash for null/zero cells

function fmtPrice(n) {
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

function extractTypeNum(name) {
    const m = String(name || '').match(/M-?(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

const GRADE_WEIGHT = { F: 1, A: 2, B: 3, C: 4 };

function gradeSort(grade) {
    if (!grade || grade === EM || grade === '') return 99;
    const g = grade.trim().toUpperCase();
    return GRADE_WEIGHT[g] !== undefined ? GRADE_WEIGHT[g] : 50;
}

// wirerod check takes priority over roll
function isWirerod(name) { return /wirerod/i.test(name || ''); }
function isRoll(name)    { return !isWirerod(name) && /roll/i.test(name || ''); }

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
    name:         'Wiremesh',
    cat_id:       null,
    cat_name:     'WIRE MESH',
    description:  'Template Wiremesh — A5 landscape, 2 halaman (Lembar + Roll)',
    // No item_brand filter — wirerod (brand="-") must appear at bottom of page 2
    custom_fields: [
        { key: 'grade_wm', label: 'Grade', type: 'text' },
    ],
};

// ── table builder ─────────────────────────────────────────────────────────────

function buildTable(sortedItems, customValues, unitLabel) {
    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({
            text, bold: true, fillColor: hFill, alignment: 'center', fontSize: 9,
        }, extra || {});
    }

    // Row 1: NAMA BARANG(rs3) | GRADE(rs3) | BERAT(rs2) | CASH(cs2) | KREDIT(cs2)
    const headerRow1 = [
        h('NAMA BARANG', { rowSpan: 3, verticalAlignment: 'middle' }),
        h('GRADE',       { rowSpan: 3, verticalAlignment: 'middle' }),
        h('BERAT',       { rowSpan: 2, verticalAlignment: 'middle' }),
        h('CASH',   { colSpan: 2 }), {},
        h('KREDIT', { colSpan: 2 }), {},
    ];

    // Row 2: (spans) | (spans) | (spans) | /Kg | /unitLabel | /Kg | /unitLabel
    const headerRow2 = [
        {}, {}, {},
        h('/Kg'), h('/' + unitLabel),
        h('/Kg'), h('/' + unitLabel),
    ];

    // Row 3: (spans) | (spans) | (kg) | (Rp) | (Rp) | (Rp) | (Rp)
    const headerRow3 = [
        {}, {},
        h('(kg)'),
        h('(Rp)'), h('(Rp)'), h('(Rp)'), h('(Rp)'),
    ];

    const bodyRows = sortedItems.map(function (item) {
        const cv      = customValues[item.ig_id] || {};
        const grade   = (cv.grade_wm || '').trim().toUpperCase() || null;
        const weight  = parseFloat(item.weight) || 0;

        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

        const cashUnit   = (cashKg   && weight) ? roundSpecial(cashKg   * weight) : 0;
        const kreditUnit = (kreditKg && weight) ? roundSpecial(kreditKg * weight) : 0;

        function dc(text, extra) {
            return Object.assign({ text: text, fontSize: 9 }, extra || {});
        }

        return [
            dc(item.name || EM,      { alignment: 'left' }),
            dc(grade || EM,          { alignment: 'center' }),
            dc(fmtBerat(weight),     { alignment: 'right' }),
            dc(fmtPrice(cashKg),     { alignment: 'right' }),
            dc(fmtPrice(cashUnit),   { alignment: 'right' }),
            dc(fmtPrice(kreditKg),   { alignment: 'right' }),
            dc(fmtPrice(kreditUnit), { alignment: 'right' }),
        ];
    });

    if (bodyRows.length === 0) {
        bodyRows.push([
            { text: 'Tidak ada item', colSpan: 7, alignment: 'center', fontSize: 9, color: '#999' },
            {}, {}, {}, {}, {}, {},
        ]);
    }

    return {
        table: {
            headerRows: 3,
            widths: ['32%', '8%', '12%', '12%', '12%', '12%', '12%'],
            body: [headerRow1, headerRow2, headerRow3, ...bodyRows],
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
    };
}

// ── render ────────────────────────────────────────────────────────────────────

function render({ items, customValues }) {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    // ── classify ───────────────────────────────────────────────────────────────
    const lembarItems  = [];
    const rollItems    = [];
    const wirerodItems = [];

    for (const item of items) {
        if (isWirerod(item.name))      wirerodItems.push(item);
        else if (isRoll(item.name))    rollItems.push(item);
        else                           lembarItems.push(item);
    }

    // ── sort ───────────────────────────────────────────────────────────────────
    function sortItems(arr) {
        return arr.slice().sort(function (a, b) {
            const tA = extractTypeNum(a.name) || 9999;
            const tB = extractTypeNum(b.name) || 9999;
            if (tA !== tB) return tA - tB;

            const cvA = customValues[a.ig_id] || {};
            const cvB = customValues[b.ig_id] || {};
            const gA  = gradeSort((cvA.grade_wm || '').trim().toUpperCase());
            const gB  = gradeSort((cvB.grade_wm || '').trim().toUpperCase());
            if (gA !== gB) return gA - gB;

            return a.name.localeCompare(b.name);
        });
    }

    const sortedLembar  = sortItems(lembarItems);
    const sortedRoll    = sortItems(rollItems);
    const sortedWirerod = wirerodItems.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    // ── console audit ──────────────────────────────────────────────────────────
    console.log('[wiremesh] Lembar:', sortedLembar.length,
                '| Roll:', sortedRoll.length,
                '| Wirerod (bottom of page 2):', sortedWirerod.length);
    if (sortedLembar.length > 20) {
        console.warn('[wiremesh] WARNING: lembar section has', sortedLembar.length,
                     'items — may overflow page 1');
    }

    // ── build tables ───────────────────────────────────────────────────────────
    const page2Items = sortedRoll.concat(sortedWirerod);

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 36],  // bottom 36pt to fit 3-line footer at 8pt

        content: [
            { text: 'WIREMESH',      bold: true, alignment: 'center', fontSize: 14, margin: [0, 0, 0, 6] },
            buildTable(sortedLembar, customValues, 'Lbr'),

            { text: 'WIREMESH ROLL', bold: true, alignment: 'center', fontSize: 14, margin: [0, 0, 0, 6], pageBreak: 'before' },
            buildTable(page2Items, customValues, 'Roll'),
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [8, 4, 8, 0],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN',                                          fontSize: 8, color: '#000000', margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan',              fontSize: 8, color: '#000000', margin: [0, 0, 0, 1] },
                            { text: '• Kapasitas tronton: M5=350, M6=300, M7=250, M8=250 lbr/tronton',     fontSize: 8, color: '#000000' },
                        ],
                    },
                    {
                        width:     'auto',
                        text:      'Page ' + currentPage + '/' + pageCount,
                        fontSize:  8,
                        color:     '#000000',
                        alignment: 'center',
                        margin:    [8, 0, 8, 0],
                    },
                    {
                        width:     'auto',
                        text:      generatedAt,
                        fontSize:  8,
                        italics:   true,
                        color:     '#000000',
                        alignment: 'right',
                    },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 9,
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
