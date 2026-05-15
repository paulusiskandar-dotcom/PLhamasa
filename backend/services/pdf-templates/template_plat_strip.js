'use strict';
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

// ── helpers ──────────────────────────────────────────────────────────────────

function roundSpecial(raw) {
    if (!raw) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

const _MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function formatJakartaTimestamp() {
    const d = moment().tz('Asia/Jakarta');
    return 'Jakarta, ' + d.format('DD') + ' ' + _MONTHS[d.month()] + ' ' + d.format('YYYY HH:mm');
}

function fmtNum(n) {
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

// Sort key only — display always uses raw i_name
const RE_SORT = /Plat\s+Strip\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i;

function parseSortKey(name) {
    if (!name) return null;
    const m = RE_SORT.exec(name);
    if (!m) return null;
    return {
        tebal: parseFloat(m[1].replace(',', '.')),
        lebar: parseFloat(m[2].replace(',', '.')),
    };
}

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
    name:         'Plat Strip',
    cat_id:       null,
    cat_name:     'PLAT STRIP',
    description:  'Template Plat Strip — A5 landscape, gudang only (cash & kredit)',
    custom_fields: [],
};

// ── render ────────────────────────────────────────────────────────────────────

function render({ items }) {
    const generatedAt = formatJakartaTimestamp();

    // ── Sort: tebal ASC → lebar ASC → i_name ASC ─────────────────────────────

    const parsed = [];
    const failed = [];

    for (const item of items) {
        const sk = parseSortKey(item.name);
        if (sk) {
            parsed.push({ item, tebal: sk.tebal, lebar: sk.lebar });
        } else {
            console.warn('[template_plat_strip] regex fail ig_id=' + item.ig_id + ' name="' + item.name + '"');
            failed.push(item);
        }
    }

    parsed.sort(function (a, b) {
        return (a.tebal - b.tebal) || (a.lebar - b.lebar) || (a.item.name || '').localeCompare(b.item.name || '');
    });
    failed.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    const sorted = parsed.map(function (e) { return e.item; }).concat(failed);

    // ── Header & body cell builders ───────────────────────────────────────────

    const FS_H  = 10;
    const FS_B  = 9;
    const hFill = '#E8ECF0';

    function h(text, extra) {
        return Object.assign({
            text: text, bold: true, alignment: 'center',
            fontSize: FS_H, fillColor: hFill,
        }, extra || {});
    }

    function bc(text, alignment, extra) {
        return Object.assign({ text: String(text), alignment: alignment, fontSize: FS_B }, extra || {});
    }

    // ── Header rows (7 columns) ───────────────────────────────────────────────
    //
    // Col layout: UKURAN | BERAT(×2) | CASH /kg | CASH /btg | CREDIT /kg | CREDIT /btg
    //
    // Row 1: UKURAN(rowSpan=2) | BERAT(colSpan=2) | CASH(colSpan=2) | CREDIT(colSpan=2)
    // Row 2:       {}           |   kg(colSpan=2)  |   /kg  |  /btg  |   /kg   |  /btg

    const headerRow1 = [
        h('UKURAN', { rowSpan: 2, verticalAlignment: 'middle' }),
        h('BERAT',  { colSpan: 2, verticalAlignment: 'middle' }), {},
        h('CASH',   { colSpan: 2, verticalAlignment: 'middle' }), {},
        h('CREDIT', { colSpan: 2, verticalAlignment: 'middle' }), {},
    ];

    const headerRow2 = [
        {},
        h('kg',   { colSpan: 2, verticalAlignment: 'middle' }), {},
        h('/kg',  { verticalAlignment: 'middle' }),
        h('/btg', { verticalAlignment: 'middle' }),
        h('/kg',  { verticalAlignment: 'middle' }),
        h('/btg', { verticalAlignment: 'middle' }),
    ];

    // ── Body rows ─────────────────────────────────────────────────────────────
    // BERAT uses colSpan=2 to span the two narrow columns under BERAT header

    const bodyRows = sorted.map(function (it) {
        const weight   = parseFloat(it.weight) || 0;
        const cashKg   = (it.prices && it.prices.cash_gudang   && it.prices.cash_gudang.current)   || 0;
        const kreditKg = (it.prices && it.prices.kredit_gudang && it.prices.kredit_gudang.current) || 0;
        const cashBtg   = (cashKg   > 0 && weight > 0) ? roundSpecial(cashKg   * weight) : 0;
        const kreditBtg = (kreditKg > 0 && weight > 0) ? roundSpecial(kreditKg * weight) : 0;

        return [
            bc(it.name || '-', 'left'),
            Object.assign(bc(weight > 0 ? fmtBerat(weight) : '-', 'center'), { colSpan: 2 }), {},
            bc(cashKg   > 0 ? fmtNum(cashKg)   : '-', 'right'),
            bc(cashBtg  > 0 ? fmtNum(cashBtg)  : '-', 'right'),
            bc(kreditKg > 0 ? fmtNum(kreditKg) : '-', 'right'),
            bc(kreditBtg > 0 ? fmtNum(kreditBtg) : '-', 'right'),
        ];
    });

    // ── Document definition ───────────────────────────────────────────────────

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 10, 8, 25],

        content: [
            {
                text:      'PLAT STRIP',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 4],
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['24%', '8%', '8%', '15%', '15%', '15%', '15%'],
                    body: [headerRow1, headerRow2].concat(bodyRows),
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#888'; },
                    vLineColor: function () { return '#888'; },
                    paddingLeft:   function () { return 3; },
                    paddingRight:  function () { return 3; },
                    paddingTop:    function () { return 4; },
                    paddingBottom: function () { return 4; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [8, 5, 8, 0],
                columns: [
                    { text: '• Harap lihat stock untuk panjang-panjangnya', alignment: 'left',   fontSize: 7.5, color: '#444', width: '*'    },
                    { text: 'Page ' + currentPage + '/' + pageCount,        alignment: 'center', fontSize: 7.5, color: '#444', width: 'auto' },
                    { text: generatedAt,                                      alignment: 'right',  fontSize: 7.5, color: '#444', width: '*'    },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: FS_B,
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
