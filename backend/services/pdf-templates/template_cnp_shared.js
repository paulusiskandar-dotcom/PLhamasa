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
    // "CNP 100 x 50 x 2.1 mm x 6 m"   → "100 x 50 x 2,1"
    // "CNP 100 x 50 x 3.2 mm x 6 m F" → "100 x 50 x 3,2"  (strip trailing F + x N m)
    return name
        .replace(/^CNP\s+/i, '')
        .replace(/[\s\n]+F\s*$/i, '')       // strip trailing " F" or "\nF" before other ops
        .replace(/\s*x\s*\d+\s*m\s*$/i, '') // strip " x 6 m" (or any length)
        .replace(/\s*mm\b/gi, '')            // strip all "mm" occurrences
        .replace(/\./g, ',')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanBahan(raw) {
    // "1.80 mm" → "1,80"   "3,20" → "3,20"   null → ""
    if (!raw) return '';
    return String(raw)
        .replace(/\s*mm\b/gi, '')
        .replace(/\./g, ',')
        .trim();
}

function isRowF(bahan) {
    // Works on raw value (with or without "mm" suffix, dot or comma)
    const v = parseFloat(String(bahan || '').replace(',', '.'));
    return !isNaN(v) && Math.abs(v - 3.20) < 0.01;
}

// ── grouping ─────────────────────────────────────────────────────────────────

function buildGroups(items, customValues, priceKey) {
    const groupMap  = {};
    const groupOrder = [];

    for (const item of items) {
        const cv       = customValues[item.ig_id] || {};
        const rawBahan  = cv.bahan || '';
        const bahan     = cleanBahan(rawBahan);
        const beratAsli = (cv.berat_asli || '').trim();
        const f         = isRowF(rawBahan);
        const baseSize  = extractBaseSize(item.name);
        const base      = shortenUkuran(item.name);       // F already stripped from name
        const ukuran    = f ? base + ' F' : base;         // append F only when detected

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

    // Within each group: thickness ascending, then weight ascending; F always last
    function getThickness(ukuran) {
        const parts = String(ukuran).split(/\s*x\s*/);
        return parseFloat(String(parts[parts.length - 1]).replace(',', '.')) || 0;
    }

    groupOrder.forEach(function (key) {
        groupMap[key].sort(function (a, b) {
            if (a.isF && !b.isF) return 1;
            if (!a.isF && b.isF) return -1;
            const dt = getThickness(a.ukuran) - getThickness(b.ukuran);
            if (dt !== 0) return dt;
            return a.weight - b.weight;
        });
    });

    return groupOrder.map(function (key) {
        return { baseSize: key, rows: groupMap[key] };
    });
}

// ── strict 50/50 split with pagination ───────────────────────────────────────

// ~23 rows per column × 2 = 46 rows per page (with increased padding)
const ROWS_PER_PAGE = 46;

function flattenAndPaginate(groups) {
    const allRows = [];
    for (const g of groups) {
        for (const r of g.rows) allRows.push(r);
    }

    const pages = [];
    for (let i = 0; i < allRows.length; i += ROWS_PER_PAGE) {
        const pageRows = allRows.slice(i, i + ROWS_PER_PAGE);
        const mid = Math.ceil(pageRows.length / 2);
        pages.push({
            leftRows:  pageRows.slice(0, mid),
            rightRows: pageRows.slice(mid),
        });
    }

    if (!pages.length) pages.push({ leftRows: [], rightRows: [] });

    return pages;
}

// ── table node builder ────────────────────────────────────────────────────────

const H_FILL   = '#E0E7EF';
const GRAY_ROW = '#E8E8E8';

function buildTableNode(rows, fs) {
    const fsSub = Math.max(fs - 1.5, 5.5);

    function h1(text) {
        return { text, bold: true, fontSize: fs, alignment: 'center', fillColor: H_FILL };
    }
    function h2(text) {
        return { text, italics: true, fontSize: fsSub, color: '#444', alignment: 'center', fillColor: H_FILL };
    }

    const headerRow1 = [h1('UKURAN'),            h1('BAHAN'), h1('B. Tabel'), h1('Harga'), h1('Harga'), h1('B. Asli')];
    const headerRow2 = [h2('(panjang 6 meter)'), h2('(mm)'),  h2('(kg)'),     h2('/kg'),   h2('/btg'),  h2('(kg)')   ];

    const body = [headerRow1, headerRow2];

    for (const r of rows) {
        const fill = r.isF ? GRAY_ROW : null;

        function dc(text, extra) {
            return Object.assign({ text: text || '', fontSize: fs, margin: [2, 1, 2, 1] }, extra || {});
        }

        body.push([
            dc(r.ukuran,           { alignment: 'left',   bold: r.isF, fillColor: fill }),
            dc(r.bahan,            { alignment: 'center', bold: true,  fillColor: fill }),
            dc(fmtBerat(r.weight), { alignment: 'right',               fillColor: fill }),
            dc(fmtNum(r.kg),       { alignment: 'right',               fillColor: fill }),
            dc(fmtNum(r.btg),      { alignment: 'right', bold: r.isF,  fillColor: fill }),
            dc(r.beratAsli,        { alignment: 'right', bold: true, italics: true, fillColor: GRAY_ROW }),
        ]);
    }

    return {
        table: {
            headerRows: 2,
            widths: ['*', 34, 36, 32, 42, 36],
            body,
        },
        layout: {
            hLineWidth: function (i) {
                if (i === 0 || i === 2) return 0.5;  // top border + after header block
                if (i === 1) return 0.15;             // between header row 1 and 2
                return 0.25;
            },
            vLineWidth: function ()   { return 0.25; },
            hLineColor: function ()   { return '#555'; },
            vLineColor: function ()   { return '#888'; },
            paddingLeft:   function () { return 2; },
            paddingRight:  function () { return 2; },
            // i=0 header row1, i=1 header row2 → more breathing room
            paddingTop:    function (i) { return i < 2 ? 4 : 2.5; },
            paddingBottom: function (i) { return i < 2 ? 4 : 2.5; },
        },
    };
}

// ── footer notes ──────────────────────────────────────────────────────────────

const BULLET = '•';

const FOOTER_NOTES = {
    note1: 'Untuk pesanan panjang lebih atau kurang dari 6 mtr, harga ditambah Rp 50/kg & pesanan min. 25 btg.',
    note2: 'Untuk tebal Non Standard, harga ditambah Rp 100/kg dan pesanan minimum 200 btg.',
    note3: 'CNP KW2 Rp 9.500,-/kg dari berat timbangan',
};

function formatTimestamp(d) {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const dd   = String(d.getDate()).padStart(2, '0');
    const mon  = months[d.getMonth()];
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, '0');
    const mi   = String(d.getMinutes()).padStart(2, '0');
    return dd + ' ' + mon + ' ' + yyyy + ' ' + hh + ':' + mi;
}

// ── pdf definition ────────────────────────────────────────────────────────────

function buildPdf(groups, titleRight, generatedAt) {
    const pages = flattenAndPaginate(groups);

    let maxPerCol = 0;
    pages.forEach(function (pg) {
        if (pg.leftRows.length  > maxPerCol) maxPerCol = pg.leftRows.length;
        if (pg.rightRows.length > maxPerCol) maxPerCol = pg.rightRows.length;
    });

    const fs = maxPerCol <= 24 ? 9 : (maxPerCol <= 28 ? 8 : 7.5);

    const content = [];

    pages.forEach(function (pg, idx) {
        const block = {
            columns: [
                { width: '*', stack: [buildTableNode(pg.leftRows,  fs)] },
                { width: 8,   text: '' },
                { width: '*', stack: [buildTableNode(pg.rightRows, fs)] },
            ],
        };

        if (idx > 0) block.pageBreak = 'before';
        content.push(block);
    });

    return {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 22, 8, 38],

        header: function () {
            return {
                margin: [8, 5, 8, 0],
                columns: [
                    { text: 'CNP',      bold: true, fontSize: 11, alignment: 'left'  },
                    { text: titleRight, bold: true, fontSize: 11, alignment: 'right' },
                ],
            };
        },

        footer: function () {
            return {
                stack: [
                    {
                        columns: [
                            { text: BULLET + ' ' + FOOTER_NOTES.note1, fontSize: 7.5, italics: true, width: '*' },
                            { text: generatedAt, fontSize: 7.5, italics: true, alignment: 'right', width: 'auto' },
                        ],
                        columnGap: 8,
                        margin: [8, 3, 8, 0],
                    },
                    { text: BULLET + ' ' + FOOTER_NOTES.note2, fontSize: 7.5, italics: true, margin: [8, 1, 8, 0] },
                    { text: BULLET + ' ' + FOOTER_NOTES.note3, fontSize: 8,                  margin: [8, 1, 8, 0] },
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
        const generatedAt = formatTimestamp(new Date());
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
