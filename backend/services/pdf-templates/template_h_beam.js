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
    const n = parseFloat(b);
    if (!n || n === 0) return '';
    return new Intl.NumberFormat('id-ID').format(n);
}

function parseHBeamName(name) {
    if (!name) return null;
    const m = name.match(/(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*([\d.]+)\s*[mM]\b/);
    if (!m) return null;
    return {
        size:   parseInt(m[1], 10),
        size2:  parseInt(m[2], 10),
        length: parseFloat(m[3]),
    };
}

// i_brand → page (1|2) and column (0..3) on that page.
// Page 1 col 3: intentionally empty slot. Page 2 col 2: GMS, no source in DB.
// GG IMP is excluded entirely; GG RSI is rendered under the "GG SS" column header.
const BRAND_MAP = {
    'GG':     { page: 1, col: 0 },
    'LS':     { page: 1, col: 1 },
    'KS':     { page: 1, col: 2 },
    'GG RSI': { page: 2, col: 0 },
    'KPSS':   { page: 2, col: 1 },
    'IMP':    { page: 2, col: 3 },
};

const PAGE_BRANDS = [
    ['GG',    'LS',   'KS',   ''   ],
    ['GG SS', 'KPSS', 'GMS',  'IMP'],
];

const PAGE_HAS_DATA = [
    [true, true, true, false],
    [true, true, false, true],
];

const CANONICAL_SIZES = [
    { key: 100, label: 'H 100'  },
    { key: 125, label: 'H 125'  },
    { key: 150, label: 'H 150'  },
    { key: 175, label: 'H 175'  },
    { key: 200, label: 'H 200'  },
    { key: 250, label: 'H 250'  },
    { key: 300, label: 'H 300'  },
    { key: 350, label: 'H 350'  },
    { key: 400, label: 'WB 400' },
    { key: 700, label: 'WB 700' },
    { key: 800, label: 'WB 800' },
    { key: 900, label: 'WB 900' },
];

const GROUP_LABELS = [
    'HB 100',
    'HB 125',
    'HB 150 – 175',
    'HB 200',
    'HB 250 – 350',
    'WB 400 – 900',
];

function sizeToGroup(size) {
    if (size === 100) return 'HB 100';
    if (size === 125) return 'HB 125';
    if (size === 150 || size === 175) return 'HB 150 – 175';
    if (size === 200) return 'HB 200';
    if (size === 250 || size === 300 || size === 350) return 'HB 250 – 350';
    if (size >= 400) return 'WB 400 – 900';
    return null;
}

function mode(arr) {
    if (!arr || !arr.length) return 0;
    const counts = new Map();
    let bestVal = arr[0], bestCount = 0;
    for (const v of arr) {
        const c = (counts.get(v) || 0) + 1;
        counts.set(v, c);
        if (c > bestCount) { bestCount = c; bestVal = v; }
    }
    return bestVal;
}

const meta = {
    name:         'H-Beam',
    cat_id:       null,
    cat_name:     'H-BEAM',
    description:  'Template H-Beam — A5 landscape, 2 halaman cash-only, 4 merk per halaman',
    custom_fields: [
        { key: 'ukuran', label: 'Ukuran (display override)', type: 'text' },
    ],
};

function render({ items, customValues }) {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    customValues = customValues || {};

    // body[size][page][col] = { pab_btg, gud_btg }
    const body = {};
    const weights = {};
    const sizeUkuran = {};
    // bottomPrices[group][page][col] = { pabrik: [], gudang: [] }
    const bottomPrices = {};

    for (const it of items) {
        if (!it || !it.name) continue;
        const parsed = parseHBeamName(it.name);
        if (!parsed) continue;
        const brand = (it.i_brand || '').trim();
        const mapping = BRAND_MAP[brand];
        if (!mapping) continue;

        const size = parsed.size;
        const len  = parsed.length;
        const group = sizeToGroup(size);
        if (!group) continue;

        const pCash = (it.prices && it.prices.cash_pabrik && it.prices.cash_pabrik.current) || 0;
        const gCash = (it.prices && it.prices.cash_gudang && it.prices.cash_gudang.current) || 0;
        const weight = parseFloat(it.weight) || 0;

        if (len === 12) {
            if (!body[size]) body[size] = {};
            if (!body[size][mapping.page]) body[size][mapping.page] = {};
            if (!body[size][mapping.page][mapping.col]) {
                body[size][mapping.page][mapping.col] = { pab_btg: 0, gud_btg: 0 };
            }
            const cell = body[size][mapping.page][mapping.col];
            const pab = pCash > 0 && weight > 0 ? roundSpecial(pCash * weight) : 0;
            const gud = gCash > 0 && weight > 0 ? roundSpecial(gCash * weight) : 0;
            if (pab > cell.pab_btg) cell.pab_btg = pab;
            if (gud > cell.gud_btg) cell.gud_btg = gud;
            if (!weights[size] && weight > 0) weights[size] = weight;
            if (!sizeUkuran[size]) {
                const cv = customValues[it.ig_id] || {};
                if (cv.ukuran) sizeUkuran[size] = cv.ukuran;
            }
        }

        if (!bottomPrices[group]) bottomPrices[group] = {};
        if (!bottomPrices[group][mapping.page]) bottomPrices[group][mapping.page] = {};
        if (!bottomPrices[group][mapping.page][mapping.col]) {
            bottomPrices[group][mapping.page][mapping.col] = { pabrik: [], gudang: [] };
        }
        if (pCash > 0) bottomPrices[group][mapping.page][mapping.col].pabrik.push(pCash);
        if (gCash > 0) bottomPrices[group][mapping.page][mapping.col].gudang.push(gCash);
    }

    const HEADER_FILL      = '#E8ECF0';
    const PLACEHOLDER_FILL = '#FAFAFA';
    const BOTTOM_FILL      = '#F4F2EC';

    function h(text, extra) {
        return Object.assign({
            text: text, bold: true, fillColor: HEADER_FILL,
            alignment: 'center', fontSize: 9,
        }, extra || {});
    }
    function ph() {
        return { text: '–', fontSize: 8, color: '#BBB', alignment: 'center', fillColor: PLACEHOLDER_FILL };
    }
    function phBottom() {
        return { text: '–', fontSize: 8, color: '#BBB', alignment: 'center', fillColor: PLACEHOLDER_FILL };
    }

    const tableLayout = {
        hLineWidth: function () { return 0.5; },
        vLineWidth: function () { return 0.5; },
        hLineColor: function () { return '#888'; },
        vLineColor: function () { return '#888'; },
        paddingLeft:   function () { return 3; },
        paddingRight:  function () { return 3; },
        paddingTop:    function () { return 1; },
        paddingBottom: function () { return 1; },
    };

    const ROW_H_BODY   = 12;
    const ROW_H_BOTTOM = 12;
    const ROW_H_HEADER = undefined; // auto

    function buildPage(pageIndex) {
        const pageNum  = pageIndex + 1;
        const brands   = PAGE_BRANDS[pageIndex];
        const hasData  = PAGE_HAS_DATA[pageIndex];

        const titleStrip = {
            columns: [
                { text: 'H-BEAM', bold: true, fontSize: 14, alignment: 'left' },
                { text: 'CASH',   bold: true, fontSize: 11, characterSpacing: 1, color: '#444', alignment: 'right' },
            ],
            margin: [0, 0, 0, 6],
        };

        const bodyHeader1 = [
            h('UKURAN',     { rowSpan: 2, verticalAlignment: 'middle' }),
            h('BERAT\n(kg)',{ rowSpan: 2, verticalAlignment: 'middle' }),
            h(brands[0], { colSpan: 2 }), {},
            h(brands[1], { colSpan: 2 }), {},
            h(brands[2], { colSpan: 2 }), {},
            h(brands[3], { colSpan: 2 }), {},
        ];
        const bodyHeader2 = [
            {}, {},
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
        ];

        const bodyRows = CANONICAL_SIZES.map(function (sz) {
            const label = sizeUkuran[sz.key] || sz.label;
            const w     = weights[sz.key];
            const row = [
                { text: label,        alignment: 'left',   fontSize: 9 },
                { text: fmtBerat(w),  alignment: 'center', fontSize: 9 },
            ];
            for (let col = 0; col < 4; col++) {
                if (!hasData[col]) {
                    row.push(ph()); row.push(ph());
                    continue;
                }
                const data = body[sz.key] && body[sz.key][pageNum] && body[sz.key][pageNum][col];
                if (!data) {
                    row.push({ text: '-', alignment: 'right', fontSize: 9, color: '#999' });
                    row.push({ text: '-', alignment: 'right', fontSize: 9, color: '#999' });
                } else {
                    row.push({ text: fmtNum(data.pab_btg), alignment: 'right', fontSize: 9 });
                    row.push({ text: fmtNum(data.gud_btg), alignment: 'right', fontSize: 9 });
                }
            }
            return row;
        });

        const bodyTable = {
            table: {
                headerRows: 2,
                widths: ['17%', '7%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%'],
                heights: function (r) { return r < 2 ? ROW_H_HEADER : ROW_H_BODY; },
                body: [bodyHeader1, bodyHeader2].concat(bodyRows),
            },
            layout: tableLayout,
        };

        const bottomTitle = { text: 'Harga / Kg', fontSize: 10, margin: [0, 6, 0, 2] };
        const bottomHeader1 = [
            h('KELOMPOK UKURAN', { rowSpan: 2, verticalAlignment: 'middle', alignment: 'left' }),
            h(brands[0], { colSpan: 2 }), {},
            h(brands[1], { colSpan: 2 }), {},
            h(brands[2], { colSpan: 2 }), {},
            h(brands[3], { colSpan: 2 }), {},
        ];
        const bottomHeader2 = [
            {},
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
            h('Pabrik', { fontSize: 8 }), h('Gudang', { fontSize: 8 }),
        ];

        const bottomRows = GROUP_LABELS.map(function (grp) {
            const row = [{ text: grp, alignment: 'left', fontSize: 9, fillColor: BOTTOM_FILL }];
            for (let col = 0; col < 4; col++) {
                if (!hasData[col]) {
                    row.push(phBottom()); row.push(phBottom());
                    continue;
                }
                const bucket = bottomPrices[grp] && bottomPrices[grp][pageNum] && bottomPrices[grp][pageNum][col];
                const pab = mode(bucket && bucket.pabrik);
                const gud = mode(bucket && bucket.gudang);
                row.push({ text: fmtNum(pab), alignment: 'right', fontSize: 9, fillColor: BOTTOM_FILL });
                row.push({ text: fmtNum(gud), alignment: 'right', fontSize: 9, fillColor: BOTTOM_FILL });
            }
            return row;
        });

        const bottomTable = {
            table: {
                headerRows: 2,
                widths: ['24%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%', '9.5%'],
                heights: function (r) { return r < 2 ? ROW_H_HEADER : ROW_H_BODY; },
                body: [bottomHeader1, bottomHeader2].concat(bottomRows),
            },
            layout: tableLayout,
        };

        const out = [titleStrip, bodyTable, bottomTitle, bottomTable];
        if (pageIndex === 0) {
            out.push({ text: '', pageBreak: 'after' });
        }
        return out;
    }

    const content = buildPage(0).concat(buildPage(1));

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 10, 8, 18],
        content:         content,
        footer: function (currentPage, pageCount) {
            return {
                margin: [8, 5, 8, 0],
                columns: [
                    { text: '', width: '*' },
                    { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'center', fontSize: 8, width: 'auto' },
                    { text: generatedAt, alignment: 'right', fontSize: 8, italics: true, width: '*' },
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
