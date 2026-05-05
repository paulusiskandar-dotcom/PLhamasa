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

function fmtBerat(b) {
    if (!b) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(b);
}

function extractBaseSize(name) {
    // "CNP 100 x 50 x 2.1 mm x 6 m" → "100 x 50"
    const m = name.match(/CNP\s+(\d+)\s*x\s*(\d+)/i);
    return m ? m[1] + ' x ' + m[2] : name.replace(/^CNP\s+/i, '');
}

function shortenUkuran(name) {
    // "CNP 100 x 50 x 2.1 mm x 6 m" → "100 x 50 x 2,1"
    return name
        .replace(/^CNP\s+/i, '')
        .replace(/\s*x\s*\d+\s*m\s*$/i, '')
        .replace(/\s*mm\s*$/i, '')
        .replace(/\./g, ',')
        .trim();
}

function isRowF(bahan) {
    const v = parseFloat(String(bahan || '').replace(',', '.'));
    return !isNaN(v) && Math.abs(v - 3.20) < 0.01;
}

// ── grouping ─────────────────────────────────────────────────────────────────

function buildGroups(items, customValues, priceKey) {
    const groupMap  = {};
    const groupOrder = [];

    for (const item of items) {
        const cv       = customValues[item.ig_id] || {};
        const rawBahan = cv.bahan || '';
        const bahan    = rawBahan.replace(/\./g, ',').trim();
        const beratAsli = (cv.berat_asli || '').trim();
        const f        = isRowF(rawBahan);
        const baseSize = extractBaseSize(item.name);
        const ukuran   = shortenUkuran(item.name) + (f ? ' F' : '');

        const weight = parseFloat(item.weight) || 0;
        const kg     = (item.prices && item.prices[priceKey] && item.prices[priceKey].current) || 0;
        const btg    = (kg && weight) ? roundSpecial(kg * weight) : 0;

        if (!groupMap[baseSize]) {
            groupMap[baseSize] = [];
            groupOrder.push(baseSize);
        }

        groupMap[baseSize].push({ ukuran, bahan, weight, kg, btg, beratAsli, isF: f });
    }

    // Sort groups by numeric base size (75x45, 100x50, 125x50, ...)
    groupOrder.sort(function (a, b) {
        const pa = a.split(' x ').map(Number);
        const pb = b.split(' x ').map(Number);
        return (pa[0] - pb[0]) || (pa[1] - pb[1]);
    });

    return groupOrder.map(function (key) {
        return { baseSize: key, rows: groupMap[key] };
    });
}

// ── group-aware 2-column split ───────────────────────────────────────────────

function splitToTwoCols(groups) {
    if (!groups.length) return { leftRows: [], rightRows: [] };
    if (groups.length === 1) {
        return { leftRows: groups[0].rows.slice(), rightRows: [] };
    }

    const total  = groups.reduce(function (s, g) { return s + g.rows.length; }, 0);
    const target = Math.ceil(total / 2);
    let leftCount = 0;
    let splitIdx  = 0;

    for (let i = 0; i < groups.length; i++) {
        const newCount = leftCount + groups[i].rows.length;
        // Stop BEFORE this group if adding it exceeds target and we already have rows
        if (newCount > target && leftCount > 0) break;
        leftCount = newCount;
        splitIdx  = i + 1;
    }

    // Guarantee at least 1 group on the right
    if (splitIdx >= groups.length) splitIdx = groups.length - 1;

    const leftRows  = [];
    const rightRows = [];
    for (let i = 0; i < splitIdx; i++) {
        for (const r of groups[i].rows) leftRows.push(r);
    }
    for (let i = splitIdx; i < groups.length; i++) {
        for (const r of groups[i].rows) rightRows.push(r);
    }

    return { leftRows, rightRows };
}

// ── page assignment ───────────────────────────────────────────────────────────

// ~29 rows per column × 2 = 58 rows per page at fontSize 8
const ROWS_PER_PAGE = 58;

function assignGroupsToPages(groups) {
    const pages = [];
    let currentPage  = [];
    let currentCount = 0;

    for (const grp of groups) {
        if (currentCount + grp.rows.length > ROWS_PER_PAGE && currentPage.length > 0) {
            pages.push(currentPage);
            currentPage  = [];
            currentCount = 0;
        }
        currentPage.push(grp);
        currentCount += grp.rows.length;
    }
    if (currentPage.length > 0) pages.push(currentPage);

    return pages;
}

// ── table node builder ────────────────────────────────────────────────────────

const H_FILL   = '#E0E7EF';
const GRAY_ROW = '#E8E8E8';

function buildTableNode(rows, fs) {
    function hc(text) {
        return { text, bold: true, fontSize: fs, alignment: 'center', fillColor: H_FILL };
    }

    const headerRow = [
        hc('UKURAN'), hc('BAHAN'), hc('Brt\nTabel'), hc('KG'), hc('BTG'), hc('Brt\nAsli'),
    ];

    const body = [headerRow];

    for (const r of rows) {
        const fill = r.isF ? GRAY_ROW : null;

        function dc(text, extra) {
            return Object.assign({ text: text || '', fontSize: fs, margin: [2, 1, 2, 1] }, extra || {});
        }

        body.push([
            dc(r.ukuran,        { alignment: 'left',   bold: r.isF,  fillColor: fill }),
            dc(r.bahan,         { alignment: 'center', bold: true,   fillColor: fill }),
            dc(fmtBerat(r.weight), { alignment: 'right',             fillColor: fill }),
            dc(fmtNum(r.kg),    { alignment: 'right',               fillColor: fill }),
            dc(fmtNum(r.btg),   { alignment: 'right', bold: r.isF,  fillColor: fill }),
            dc(r.beratAsli,     { alignment: 'right', bold: true, italics: true, fillColor: GRAY_ROW }),
        ]);
    }

    return {
        table: {
            headerRows: 1,
            // Widths within one half of the 2-column layout (~285pt per side)
            widths: ['*', 34, 36, 32, 42, 36],
            body,
        },
        layout: {
            hLineWidth: function (i) { return i <= 1 ? 0.5 : 0.25; },
            vLineWidth: function ()   { return 0.25; },
            hLineColor: function ()   { return '#555'; },
            vLineColor: function ()   { return '#888'; },
            paddingLeft:   function () { return 2; },
            paddingRight:  function () { return 2; },
            paddingTop:    function () { return 1.5; },
            paddingBottom: function () { return 1.5; },
        },
    };
}

// ── footer notes ──────────────────────────────────────────────────────────────

const FOOTER_NOTES = [
    '• Pesanan panjang ≠ 6 mtr: harga +Rp 50/kg & min. 25 btg.',
    '• Tebal Non Standard: harga +Rp 100/kg & min. 200 btg.',
    'KW2  Rp 9.500,-/kg dari berat timbangan',
];

// ── pdf definition ────────────────────────────────────────────────────────────

function buildPdf(groups, titleRight, generatedAt) {
    const pages = assignGroupsToPages(groups);

    let maxPerCol = 0;
    pages.forEach(function (pg) {
        const { leftRows, rightRows } = splitToTwoCols(pg);
        if (leftRows.length  > maxPerCol) maxPerCol = leftRows.length;
        if (rightRows.length > maxPerCol) maxPerCol = rightRows.length;
    });

    const fs = maxPerCol <= 24 ? 9 : (maxPerCol <= 28 ? 8 : 7.5);

    const content = [];

    pages.forEach(function (pg, idx) {
        const { leftRows, rightRows } = splitToTwoCols(pg);

        const block = {
            columns: [
                { width: '*', stack: [buildTableNode(leftRows,  fs)] },
                { width: 8,   text: '' },
                { width: '*', stack: [buildTableNode(rightRows, fs)] },
            ],
        };

        if (idx > 0) block.pageBreak = 'before';
        content.push(block);
    });

    return {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        // top: 28 for header, bottom: 38 for 3-line footer
        pageMargins:     [8, 28, 8, 38],

        header: function () {
            return {
                margin: [8, 7, 8, 0],
                columns: [
                    { text: 'CNP',      bold: true, fontSize: 11, alignment: 'left'  },
                    { text: titleRight, bold: true, fontSize: 11, alignment: 'right' },
                ],
            };
        },

        footer: function () {
            return {
                margin: [8, 3, 8, 0],
                stack: [
                    { text: FOOTER_NOTES[0], fontSize: 7, italics: true },
                    { text: FOOTER_NOTES[1], fontSize: 7, italics: true },
                    {
                        columns: [
                            { text: FOOTER_NOTES[2], fontSize: 7.5 },
                            { text: generatedAt,     fontSize: 7, italics: true, alignment: 'right' },
                        ],
                    },
                ],
            };
        },

        content,

        defaultStyle: {
            font:     'Helvetica',
            fontSize: fs,
        },
    };
}

// ── render factory ────────────────────────────────────────────────────────────

function makeRender(priceKey, titleRight) {
    return function render({ items, customValues }) {
        const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY');
        const groups = buildGroups(items, customValues, priceKey);
        const dd     = buildPdf(groups, titleRight, generatedAt);

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
