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

// ── constants ─────────────────────────────────────────────────────────────────

const GRAY  = '#E8E8E8';
const HFILL = '#E0E7EF';

const BULLET = '•';

const FOOTER = {
    note1: 'Untuk pesanan panjang lebih atau kurang dari 6 mtr, harga ditambah Rp 50/kg & pesanan min. 25 btg.',
    note2: 'Untuk tebal Non Standard, harga ditambah Rp 100/kg dan pesanan minimum 200 btg.',
    note3: 'CNP KW2 Rp 9.500,-/kg dari berat timbangan',
};

// ── number helpers ────────────────────────────────────────────────────────────

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

function formatTimestamp(d) {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return String(d.getDate()).padStart(2, '0') + ' ' +
           months[d.getMonth()] + ' ' +
           d.getFullYear() + ' ' +
           String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
}

// ── string helpers ────────────────────────────────────────────────────────────

function shortenUkuran(name) {
    // "CNP 100 x 50 x 2.1 mm x 6 m"   → "100 x 50 x 2,1"
    // "CNP 100 x 50 x 3.2 mm x 6 m F" → "100 x 50 x 3,2"
    return String(name)
        .replace(/^CNP\s+/i, '')
        .replace(/[\s\n]+F\s*$/i, '')
        .replace(/\s*x\s*\d+\s*m\s*$/i, '')
        .replace(/\s*mm\b/gi, '')
        .replace(/\./g, ',')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanBahan(raw) {
    // "1.80 mm" → "1,80"   "3,20" → "3,20"
    if (!raw) return '';
    return String(raw).replace(/\s*mm\b/gi, '').replace(/\./g, ',').trim();
}

function isRowF(rawBahan) {
    const v = parseFloat(String(rawBahan || '').replace(/\s*mm\b/gi, '').replace(',', '.'));
    return !isNaN(v) && Math.abs(v - 3.20) < 0.01;
}

function extractBaseSize(name) {
    const m = String(name).match(/CNP\s+(\d+)\s*x\s*(\d+)/i);
    return m ? m[1] + ' x ' + m[2] : String(name).replace(/^CNP\s+/i, '');
}

function extractThickness(ukuran) {
    const clean = String(ukuran).replace(/\s*F\s*$/i, '');
    const parts = clean.split(/\s*x\s*/);
    return parseFloat(String(parts[parts.length - 1]).replace(',', '.')) || 0;
}

// ── data grouping + sort ──────────────────────────────────────────────────────

function buildRows(items, customValues, priceKey) {
    const groupMap   = {};
    const groupOrder = [];

    for (const item of items) {
        const cv      = customValues[item.ig_id] || {};
        const rawBahan = cv.bahan || '';
        const f        = isRowF(rawBahan);
        const base     = shortenUkuran(item.name);
        const ukuran   = f ? base + ' F' : base;
        const bahan    = cleanBahan(rawBahan);
        const beratAsli = (cv.berat_asli || '').trim();
        const baseSize  = extractBaseSize(item.name);

        const weight = parseFloat(item.weight) || 0;
        const kg     = (item.prices && item.prices[priceKey] && item.prices[priceKey].current) || 0;
        const btg    = (kg && weight) ? roundSpecial(kg * weight) : 0;

        if (!groupMap[baseSize]) {
            groupMap[baseSize] = [];
            groupOrder.push(baseSize);
        }
        groupMap[baseSize].push({
            ukuran, bahan, weight, kg, btg, beratAsli,
            isF:        f,
            _thickness: extractThickness(ukuran),
        });
    }

    // sort groups numerically: 75x45, 100x50, 125x50, …
    groupOrder.sort(function (a, b) {
        const pa = a.split(' x ').map(Number);
        const pb = b.split(' x ').map(Number);
        return (pa[0] - pb[0]) || (pa[1] - pb[1]);
    });

    // within each group: F last, then thickness asc, then weight asc
    groupOrder.forEach(function (key) {
        groupMap[key].sort(function (a, b) {
            if (a.isF && !b.isF) return 1;
            if (!a.isF && b.isF) return -1;
            const dt = a._thickness - b._thickness;
            return dt !== 0 ? dt : a.weight - b.weight;
        });
    });

    // flatten
    const all = [];
    groupOrder.forEach(function (key) {
        groupMap[key].forEach(function (r) { all.push(r); });
    });
    return all;
}

// ── strict 50/50 split ────────────────────────────────────────────────────────

function splitFiftyFifty(rows) {
    const mid   = Math.ceil(rows.length / 2);
    const left  = rows.slice(0, mid);
    const right = rows.slice(mid);
    // pad right with null so both columns share same height
    while (right.length < left.length) right.push(null);
    return { left, right };
}

// ── table node builder ────────────────────────────────────────────────────────

function buildTableNode(rows) {
    function h1(text) {
        return { text, bold: true, fontSize: 8, alignment: 'center', fillColor: HFILL };
    }
    function h2(text) {
        return { text, italics: true, fontSize: 6.5, alignment: 'center', color: '#666666', fillColor: HFILL };
    }

    const headerRow1 = [h1('Ukuran'), h1('Bahan'), h1('B. Tabel'), h1('Harga'), h1('Harga'), h1('B. Asli')];
    const headerRow2 = [h2('(panjang 6 meter)'), h2('(mm)'), h2('(kg)'), h2('/kg'), h2('/btg'), h2('(kg)')];

    const body = [headerRow1, headerRow2];

    for (const r of rows) {
        if (!r) {
            body.push([
                { text: '', fontSize: 7 }, { text: '', fontSize: 7 }, { text: '', fontSize: 7 },
                { text: '', fontSize: 7 }, { text: '', fontSize: 7 },
                { text: '', fontSize: 7, fillColor: GRAY },
            ]);
            continue;
        }

        const rowFill = r.isF ? GRAY : null;

        function dc(text, alignment, extra) {
            const cell = Object.assign({ text: String(text || ''), fontSize: 7, alignment }, extra || {});
            if (rowFill && !cell.fillColor) cell.fillColor = rowFill;
            if (r.isF) cell.bold = true;
            return cell;
        }

        body.push([
            dc(r.ukuran,         'center'),
            dc(r.bahan,          'center', { bold: true }),
            dc(fmtBerat(r.weight), 'center'),
            dc(fmtNum(r.kg),     'right'),
            dc(fmtNum(r.btg),    'right'),
            dc(r.beratAsli,      'right',  { bold: true, italics: true, fillColor: GRAY }),
        ]);
    }

    return {
        table: {
            headerRows: 2,
            // Per table: (573pt available - 6pt gap) / 2 ≈ 283.5pt
            widths: [73, 41, 43, 36, 48, 43],
            body,
        },
        layout: {
            hLineWidth: function (i) {
                if (i === 0 || i === 2) return 0.5;
                if (i === 1) return 0.15;
                return 0.2;
            },
            vLineWidth: function ()   { return 0.25; },
            hLineColor: function ()   { return '#000000'; },
            vLineColor: function ()   { return '#000000'; },
            paddingLeft:   function () { return 3; },
            paddingRight:  function () { return 3; },
            paddingTop:    function () { return 1.5; },
            paddingBottom: function () { return 1.5; },
        },
    };
}

// ── pdf definition ────────────────────────────────────────────────────────────

function buildDocDef(rows, titleRight, ts) {
    const { left, right } = splitFiftyFifty(rows);

    return {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [11, 24, 11, 35],

        header: function () {
            return {
                columns: [
                    { text: 'CNP',      bold: true, fontSize: 9, alignment: 'left',  margin: [13, 8, 0, 0] },
                    { text: titleRight, bold: true, fontSize: 9, alignment: 'right', margin: [0,  8, 13, 0] },
                ],
            };
        },

        footer: function () {
            return {
                stack: [
                    {
                        columns: [
                            { text: BULLET + ' ' + FOOTER.note1, italics: true, fontSize: 7.5, width: '*' },
                            { text: ts, italics: true, fontSize: 7.5, alignment: 'right', width: 'auto' },
                        ],
                        margin:    [13, 0, 13, 0],
                        columnGap: 8,
                    },
                    { text: BULLET + ' ' + FOOTER.note2, italics: true, fontSize: 7.5, margin: [13, 1, 13, 0] },
                    { text: BULLET + ' ' + FOOTER.note3, fontSize: 8,                  margin: [13, 1, 13, 0] },
                ],
            };
        },

        content: [
            {
                columns: [
                    { width: '*', stack: [buildTableNode(left)]  },
                    { width: 6,   text:  ''                      },
                    { width: '*', stack: [buildTableNode(right)] },
                ],
            },
        ],

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 7,
        },
    };
}

// ── render factory ────────────────────────────────────────────────────────────

function makeRender(priceKey, titleRight) {
    return function render({ items, customValues }) {
        const ts   = formatTimestamp(new Date());
        const rows = buildRows(items, customValues, priceKey);
        const dd   = buildDocDef(rows, titleRight, ts);

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
