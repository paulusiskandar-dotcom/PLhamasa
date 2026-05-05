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

function fmtNum(n) {
    if (!n) return '';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtDec(n, dec) {
    if (n === null || n === undefined || n === 0) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    }).format(n);
}

function extractType(name) {
    const m = name.match(/M-(\d+)/i);
    return m ? 'M-' + m[1] : null;
}

// Fallback when grade_label custom field is empty
function extractGradeFromName(name) {
    const m = name.match(/M-\d+\s+([FABC])\b/i);
    return m ? m[1].toUpperCase() : null;
}

// ── constants ────────────────────────────────────────────────────────────────

const GRADE_ORDER = ['F', 'A', 'B', 'C'];

const TYPE_COLORS = {
    'M-5':  '#FFFDE7',
    'M-6':  '#E3F2FD',
    'M-7':  '#E8F5E9',
    'M-8':  '#FBE9E7',
    'M-9':  '#F3E5F5',
    'M-10': '#FCE4EC',
    'M-12': '#EEEEEE',
};

const TRONTON_CAP = [
    ['M-5', '350 lbr'],
    ['M-6', '300 lbr'],
    ['M-7', '250 lbr'],
    ['M-8', '250 lbr'],
];

const WROD_PRICES = [
    'W.Rod ≤5,5mm   Rp 10.900',
    'W.Rod >5,5mm   Rp 10.700',
];

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
    name:         'Wiremesh',
    cat_id:       null,
    cat_name:     'WIRE MESH',
    description:  'Template Wiremesh — A4 landscape, CASH + KREDIT per lembar dan roll',
    item_brand:   'HMESH',
    custom_fields: [
        { key: 'tebal_aktual', label: 'Tebal Aktual (mm)', type: 'text' },
        { key: 'grade_label',  label: 'Grade (F/A/B/C)',   type: 'text' },
    ],
};

// ── render ────────────────────────────────────────────────────────────────────

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');

    // ── 1. group items: TYPE → grade → { ulir, roll } ──────────────────────
    const grouped = {};

    for (const item of items) {
        const cv    = customValues[item.ig_id] || {};
        const grade = (cv.grade_label || '').trim().toUpperCase() || extractGradeFromName(item.name);
        const type  = extractType(item.name);
        if (!type || !grade) continue;

        const isRoll = /\broll\b/i.test(item.name);
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const tebal    = parseFloat((cv.tebal_aktual || '').replace(',', '.')) || null;

        if (!grouped[type])        grouped[type]        = {};
        if (!grouped[type][grade]) grouped[type][grade] = { ulir: null, roll: null };

        grouped[type][grade][isRoll ? 'roll' : 'ulir'] = {
            weight: parseFloat(item.weight) || 0,
            tebal,
            cashKg,
            kreditKg,
        };
    }

    // ── 2. sorted type list ─────────────────────────────────────────────────
    const types = Object.keys(grouped).sort(function (a, b) {
        return parseInt(a.replace('M-', '')) - parseInt(b.replace('M-', ''));
    });

    // ── 3. header cells ─────────────────────────────────────────────────────
    // A4 landscape available ≈ 812pt; side panel 100 + 8 gap = 108 → table ≈ 704pt
    // 13 col widths: [30,14,28,36,36, 50,90,50,90, 50,90,50,90] = 704
    const HDK   = '#1E3A5F';  // dark blue — CASH/KREDIT title
    const HCASH = '#C62828';  // red family — CASH sub-headers
    const HKRD  = '#1565C0';  // blue family — KREDIT sub-headers
    const HLIGHT = '#D0DAEA'; // light blue — row-3 column labels

    function hCell(text, opts) {
        return Object.assign({
            text, bold: true, fontSize: 7, alignment: 'center',
            margin: [1, 2, 1, 2],
        }, opts || {});
    }

    const headerRow1 = [
        hCell('TIPE',       { rowSpan: 3, fillColor: HDK, color: '#FFF', fontSize: 8 }),
        hCell('Gr',         { rowSpan: 3, fillColor: HDK, color: '#FFF', fontSize: 8 }),
        hCell('Tbl\n(mm)',  { rowSpan: 3, fillColor: HDK, color: '#FFF' }),
        hCell('Brt\nLbr\n(kg)',  { rowSpan: 3, fillColor: HDK, color: '#FFF' }),
        hCell('Brt\nRoll\n(kg)', { rowSpan: 3, fillColor: HDK, color: '#FFF' }),
        hCell('CASH',   { colSpan: 4, fillColor: HCASH, color: '#FFF', fontSize: 9 }), {}, {}, {},
        hCell('KREDIT', { colSpan: 4, fillColor: HKRD,  color: '#FFF', fontSize: 9 }), {}, {}, {},
    ];

    const headerRow2 = [
        {}, {}, {}, {}, {},
        hCell('Lembar',     { colSpan: 2, fillColor: '#B71C1C', color: '#FFF' }), {},
        hCell('Roll',       { colSpan: 2, fillColor: '#B71C1C', color: '#FFF' }), {},
        hCell('Lembar',     { colSpan: 2, fillColor: '#0D47A1', color: '#FFF' }), {},
        hCell('Roll',       { colSpan: 2, fillColor: '#0D47A1', color: '#FFF' }), {},
    ];

    const headerRow3 = [
        {}, {}, {}, {}, {},
        hCell('Rp/kg',   { fillColor: HLIGHT }),
        hCell('Rp/lbr',  { fillColor: HLIGHT }),
        hCell('Rp/kg',   { fillColor: HLIGHT }),
        hCell('Rp/roll', { fillColor: HLIGHT }),
        hCell('Rp/kg',   { fillColor: HLIGHT }),
        hCell('Rp/lbr',  { fillColor: HLIGHT }),
        hCell('Rp/kg',   { fillColor: HLIGHT }),
        hCell('Rp/roll', { fillColor: HLIGHT }),
    ];

    // ── 4. body rows ────────────────────────────────────────────────────────
    const tableBody = [headerRow1, headerRow2, headerRow3];

    function dc(val, extra) {
        return Object.assign({ text: val, fontSize: 7, margin: [1, 2, 2, 2] }, extra || {});
    }

    for (const type of types) {
        const bgType = TYPE_COLORS[type] || '#FFFFFF';
        const grades = GRADE_ORDER.filter(function (g) { return grouped[type][g]; });

        grades.forEach(function (grade, idx) {
            const ulir = grouped[type][grade].ulir;
            const roll = grouped[type][grade].roll;

            const cashLbrRp   = ulir ? roundSpecial(ulir.cashKg   * ulir.weight) : 0;
            const cashRollRp  = roll ? roundSpecial(roll.cashKg   * roll.weight) : 0;
            const kreditLbrRp = ulir ? roundSpecial(ulir.kreditKg * ulir.weight) : 0;
            const kreditRollRp = roll ? roundSpecial(roll.kreditKg * roll.weight) : 0;

            // prefer ulir tebal, fallback roll
            const tebal = (ulir && ulir.tebal) ? ulir.tebal : (roll && roll.tebal ? roll.tebal : null);

            const row = [
                // TIPE: rowSpan on first grade row
                idx === 0
                    ? dc(type, { bold: true, fontSize: 8, alignment: 'center', rowSpan: grades.length, fillColor: bgType, margin: [1, 4, 1, 4] })
                    : {},
                // Grade
                dc(grade, { bold: true, alignment: 'center', fillColor: bgType }),
                // Tebal aktual
                dc(fmtDec(tebal, 2), { alignment: 'center', fillColor: bgType }),
                // Berat Lembar
                dc(ulir ? fmtDec(ulir.weight, 2) : '', { alignment: 'right', fillColor: bgType }),
                // Berat Roll
                dc(roll ? fmtDec(roll.weight, 2) : '', { alignment: 'right', fillColor: bgType }),
                // CASH Lembar
                dc(ulir ? fmtNum(ulir.cashKg)  : '', { alignment: 'right', color: '#B71C1C' }),
                dc(fmtNum(cashLbrRp),  { alignment: 'right', color: '#B71C1C', bold: true }),
                // CASH Roll
                dc(roll ? fmtNum(roll.cashKg)  : '', { alignment: 'right', color: '#B71C1C' }),
                dc(fmtNum(cashRollRp), { alignment: 'right', color: '#B71C1C', bold: true }),
                // KREDIT Lembar
                dc(ulir ? fmtNum(ulir.kreditKg) : '', { alignment: 'right', color: '#0D47A1' }),
                dc(fmtNum(kreditLbrRp),  { alignment: 'right', color: '#0D47A1', bold: true }),
                // KREDIT Roll
                dc(roll ? fmtNum(roll.kreditKg) : '', { alignment: 'right', color: '#0D47A1' }),
                dc(fmtNum(kreditRollRp), { alignment: 'right', color: '#0D47A1', bold: true }),
            ];

            tableBody.push(row);
        });
    }

    // ── 5. side panel ───────────────────────────────────────────────────────
    const sideStack = [
        { text: 'Kapasitas Tronton', bold: true, fontSize: 8, alignment: 'center', margin: [0, 0, 0, 4] },
        {
            table: {
                widths: [22, '*'],
                body: TRONTON_CAP.map(function (row) {
                    return [
                        { text: row[0] + ':', bold: true, fontSize: 7, border: [false, false, false, false] },
                        { text: row[1],        fontSize: 7, border: [false, false, false, false] },
                    ];
                }),
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 10],
        },
        { text: 'Bahan Baku W.Rod', bold: true, fontSize: 8, alignment: 'center', margin: [0, 0, 0, 4] },
    ].concat(WROD_PRICES.map(function (line) {
        return { text: line, fontSize: 7, margin: [0, 1, 0, 1] };
    }));

    // ── 6. docDef ────────────────────────────────────────────────────────────
    const dd = {
        pageSize:        'A4',
        pageOrientation: 'landscape',
        pageMargins:     [15, 32, 15, 26],

        header: function () {
            return {
                text:      'DAFTAR HARGA WIREMESH',
                alignment: 'center',
                bold:      true,
                fontSize:  13,
                margin:    [0, 9, 0, 0],
            };
        },

        content: [
            {
                columns: [
                    {
                        width: '*',
                        table: {
                            headerRows: 3,
                            // 13 columns summing to ~704pt (A4 landscape minus margins and side panel)
                            widths: [30, 14, 28, 36, 36, 50, 90, 50, 90, 50, 90, 50, 90],
                            body: tableBody,
                        },
                        layout: {
                            hLineWidth: function () { return 0.5; },
                            vLineWidth: function () { return 0.5; },
                            hLineColor: function () { return '#999'; },
                            vLineColor: function () { return '#999'; },
                            paddingLeft:   function () { return 2; },
                            paddingRight:  function () { return 2; },
                            paddingTop:    function () { return 1; },
                            paddingBottom: function () { return 1; },
                        },
                    },
                    {
                        width: 100,
                        margin: [8, 0, 0, 0],
                        stack: sideStack,
                    },
                ],
            },
        ],

        footer: function () {
            return {
                margin: [15, 4, 15, 0],
                columns: [
                    { text: '* Harga sudah termasuk PPN', fontSize: 8, italics: true, color: '#555' },
                    { text: 'Update: ' + generatedAt,     fontSize: 8, alignment: 'right', color: '#555' },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 8,
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
