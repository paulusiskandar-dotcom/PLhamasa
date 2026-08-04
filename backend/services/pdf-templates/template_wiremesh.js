const PdfPrinter = require('pdfmake/src/printer');
const moment = require('moment-timezone');
const { roundSpecial } = require('../../utils/rounding');

moment.locale('id');

const fonts = {
    Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};

// ── helpers ─────────────────────────────────────────────────────────────────

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
    const m = String(name || '').match(/M-?(\d+(\.\d+)?)/i);
    return m ? parseFloat(m[1]) : null;
}

function sanitizeName(str) {
    if (!str) return '';
    return String(str)
        .replace(/≤/g, '<= ')
        .replace(/≥/g, '>= ');
}

// wirerod check takes priority over roll
function isWirerod(name) { return /wire\s*[-_]?\s*rod/i.test(name || ''); }
function isRoll(name) { return !isWirerod(name) && (/roll/i.test(name || '') || /54R/i.test(name || '') || /\bR\.?$/i.test(name || '')); }

function parseGrade(item, customValues) {
    const name = String(item.name || '').trim();

    // 1. Custom value takes priority if set to valid grade
    const cv = customValues[item.ig_id] || {};
    const cvGrade = (cv.grade_wm || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'F'].includes(cvGrade)) {
        return cvGrade;
    }

    // 2. Parse from item name:
    const m = name.match(/\b([ABCF])\b(?:\s*x|\s*\.|\s*R|\s*$)/i) || name.match(/\b([ABCF])\b/i);
    if (m) {
        return m[1].toUpperCase();
    }

    return 'A'; // fallback grade
}

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
    name: 'Wiremesh',
    cat_id: null,
    cat_name: 'WIRE MESH',
    description: 'Template Wiremesh — A5 landscape, 4 halaman (Grade F, A, B, C)',
    custom_fields: [
        { key: 'grade_wm', label: 'Grade', type: 'text' },
    ],
};

// ── table builder for Wiremesh (Lembar / Roll) ───────────────────────────────

function buildWmTable(sortedItems, customValues, unitLabel) {
    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({
            text, bold: true, fillColor: hFill, alignment: 'center', fontSize: 9,
        }, extra || {});
    }

    // Row 1: NAMA BARANG (rs2) | BERAT (kg) (rs2) | CASH (cs2) | KREDIT (cs2)
    const headerRow1 = [
        h('NAMA BARANG', { rowSpan: 2, verticalAlignment: 'middle' }),
        h('BERAT (kg)', { rowSpan: 2, verticalAlignment: 'middle' }),
        h('CASH', { colSpan: 2 }), {},
        h('KREDIT', { colSpan: 2 }), {},
    ];

    // Row 2: (spans) | (spans) | Rp / Kg | Rp / unitLabel | Rp / Kg | Rp / unitLabel
    const headerRow2 = [
        {}, {},
        h('Rp / Kg'), h('Rp / ' + unitLabel),
        h('Rp / Kg'), h('Rp / ' + unitLabel),
    ];

    const bodyRows = sortedItems.map(function (item) {
        const weight = parseFloat(item.weight) || 0;

        const cashKg = (item.prices && item.prices.cash_gudang && item.prices.cash_gudang.current) || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

        const cashUnit = (cashKg && weight) ? roundSpecial(cashKg * weight) : 0;
        const kreditUnit = (kreditKg && weight) ? roundSpecial(kreditKg * weight) : 0;

        function dc(text, extra) {
            return Object.assign({ text: text, fontSize: 9 }, extra || {});
        }

        return [
            dc(sanitizeName(item.name) || EM, { alignment: 'left' }),
            dc(fmtBerat(weight), { alignment: 'right' }),
            dc(fmtPrice(cashKg), { alignment: 'right' }),
            dc(fmtPrice(cashUnit), { alignment: 'right' }),
            dc(fmtPrice(kreditKg), { alignment: 'right' }),
            dc(fmtPrice(kreditUnit), { alignment: 'right' }),
        ];
    });

    if (bodyRows.length === 0) {
        bodyRows.push([
            { text: 'Tidak ada item', colSpan: 6, alignment: 'center', fontSize: 9, color: '#999' },
            {}, {}, {}, {}, {},
        ]);
    }

    return {
        table: {
            headerRows: 2,
            widths: ['40%', '12%', '12%', '12%', '12%', '12%'],
            body: [headerRow1, headerRow2, ...bodyRows],
        },
        layout: {
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0.5; },
            hLineColor: function () { return '#000000'; },
            vLineColor: function () { return '#000000'; },
            paddingLeft: function () { return 6; },
            paddingRight: function () { return 6; },
            paddingTop: function () { return 6; },
            paddingBottom: function () { return 6; },
        },
    };
}

// ── render ────────────────────────────────────────────────────────────────────

function render({ items, customValues }) {
    const _d = moment().tz('Asia/Jakarta');
    const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    // ── classify & attach grade ────────────────────────────────────────────────
    const lembarItems = [];
    const rollItems = [];
    const wirerodItems = [];

    for (const item of items) {
        item._grade = parseGrade(item, customValues);
        if (isWirerod(item.name)) wirerodItems.push(item);
        else if (isRoll(item.name)) rollItems.push(item);
        else lembarItems.push(item);
    }

    // ── sort ───────────────────────────────────────────────────────────────────
    function sortItems(arr) {
        return arr.slice().sort(function (a, b) {
            const tA = extractTypeNum(a.name) ?? 9999;
            const tB = extractTypeNum(b.name) ?? 9999;
            if (tA !== tB) return tA - tB;
            return a.name.localeCompare(b.name);
        });
    }

    const sortedLembar = sortItems(lembarItems);
    const sortedRoll = sortItems(rollItems);
    const sortedWirerod = wirerodItems.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    const GRADES = ['F', 'A', 'B', 'C'];

    // ── build pages ───────────────────────────────────────────────────────────
    const content = [];

    GRADES.forEach(function (grade, idx) {
        const pageLembar = sortedLembar.filter(function (i) { return i._grade === grade; });
        const pageRoll = sortedRoll.filter(function (i) { return i._grade === grade; });

        const pageTitle = {
            text: 'WIREMESH - GRADE ' + grade,
            bold: true,
            alignment: 'center',
            fontSize: 14,
            margin: [0, 0, 0, 8],
        };
        if (idx > 0) {
            pageTitle.pageBreak = 'before';
        }
        content.push(pageTitle);

        // Section 1: Lembar Table
        content.push(buildWmTable(pageLembar, customValues, 'Lbr'));

        // Section 2: Roll Table (if any roll items for this grade)
        if (pageRoll.length > 0) {
            content.push({
                text: 'WIREMESH ROLL - GRADE ' + grade,
                bold: true,
                alignment: 'center',
                fontSize: 11,
                margin: [0, 8, 0, 4],
            });
            content.push(buildWmTable(pageRoll, customValues, 'Roll'));
        }

        // Section 3: Wirerod Note Lines (if any wirerod items exist with price > 0)
        if (sortedWirerod.length > 0) {
            const wirerodTableRows = [];
            sortedWirerod.forEach(function (it) {
                const cashKg = (it.prices && it.prices.cash_gudang && it.prices.cash_gudang.current) || (it.prices && it.prices.cash_pabrik && it.prices.cash_pabrik.current) || 0;
                const kreditKg = (it.prices && it.prices.kredit_gudang && it.prices.kredit_gudang.current) || (it.prices && it.prices.kredit_pabrik && it.prices.kredit_pabrik.current) || 0;

                // Hide wirerod item if both cash and kredit prices are 0
                if (!cashKg && !kreditKg) return;

                const name = sanitizeName(it.name);
                const cText = cashKg ? ('Rp ' + fmtPrice(cashKg) + '/Kg') : '-';
                const kText = kreditKg ? ('Rp ' + fmtPrice(kreditKg) + '/Kg') : '-';
                wirerodTableRows.push([
                    { text: `* ${name}:`, bold: true, fontSize: 8.5, color: '#000000' },
                    { text: `${cText} (Cash)`, bold: true, fontSize: 8.5, color: '#000000' },
                    { text: '/', bold: true, fontSize: 8.5, color: '#000000' },
                    { text: `${kText} (Kredit)`, bold: true, fontSize: 8.5, color: '#000000' },
                ]);
            });

            if (wirerodTableRows.length > 0) {
                content.push({
                    margin: [0, 6, 0, 0],
                    table: {
                        widths: ['auto', 'auto', 'auto', 'auto'],
                        body: wirerodTableRows,
                    },
                    layout: {
                        hLineWidth: function () { return 0; },
                        vLineWidth: function () { return 0; },
                        paddingLeft: function (i) { return i === 0 ? 0 : (i === 2 ? 3 : 5); },
                        paddingRight: function (i) { return i === 2 ? 3 : 5; },
                        paddingTop: function () { return 1; },
                        paddingBottom: function () { return 1; },
                    },
                });
            }
        }
    });

    const dd = {
        pageSize: 'A5',
        pageOrientation: 'landscape',
        pageMargins: [15, 14, 15, 40],

        content: content,

        footer: function (currentPage, pageCount) {
            return {
                margin: [15, 2, 15, 4],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN', fontSize: 9.5, color: '#000000', margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: 9.5, color: '#000000', margin: [0, 0, 0, 1] },
                            { text: '• Kapasitas tronton: M5=350, M6=300, M7=250, M8=250 lbr/tronton', fontSize: 9.5, color: '#000000' },
                        ],
                    },
                    {
                        width: 'auto',
                        text: 'Page ' + currentPage + '/' + pageCount,
                        fontSize: 9.5,
                        color: '#000000',
                        alignment: 'center',
                        margin: [8, 21, 8, 0],
                    },
                    {
                        width: 'auto',
                        text: generatedAt,
                        fontSize: 9.5,
                        italics: true,
                        color: '#000000',
                        alignment: 'right',
                        margin: [0, 21, 0, 0],
                    },
                ],
            };
        },

        defaultStyle: {
            font: 'Helvetica',
            fontSize: 9,
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



