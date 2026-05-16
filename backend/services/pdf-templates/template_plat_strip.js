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

// ── ukuran parsing ────────────────────────────────────────────────────────────

const RE_PLAT = /Plat\s+Strip\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*m(\s+full)?/i;

function fmtPart(rawStr) {
    const n = parseFloat(rawStr.replace(',', '.'));
    return Number.isInteger(n) ? String(Math.round(n)) : rawStr.replace(',', '.');
}

function parseUkuran(name) {
    if (!name) return null;
    const m = RE_PLAT.exec(name);
    if (!m) return null;
    const tebal  = parseFloat(m[1].replace(',', '.'));
    const lebar  = parseFloat(m[2].replace(',', '.'));
    const isFull = !!m[4];
    const display = fmtPart(m[1]) + ' x ' + fmtPart(m[2]) + (isFull ? ' (F)' : '');
    return { tebal, lebar, isFull, display };
}

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
    name:          'Plat Strip',
    cat_id:        null,
    cat_name:      'PLAT STRIP',
    description:   'Template Plat Strip — A5 landscape, 2-kolom, gudang only (cash & kredit)',
    custom_fields: [],
};

// ── layout constants ──────────────────────────────────────────────────────────

const ROWS_PER_COL_P1 = 19;  // page 1 (title memotong ruang)
const ROWS_PER_COL    = 21;  // page 2+

const FS_H   = 9;
const FS_B   = 8;
const H_FILL = '#E8ECF0';
const BORDER = '#888';

// ── header cell helper ────────────────────────────────────────────────────────

function h(text, extra) {
    return Object.assign({
        text:               text,
        bold:               true,
        alignment:          'center',
        fontSize:           FS_H,
        fillColor:          H_FILL,
        verticalAlignment:  'middle',
    }, extra || {});
}

// ── table node ────────────────────────────────────────────────────────────────

function buildTableNode(rowItems) {
    const headerRow1 = [
        h('UKURAN', { rowSpan: 2 }),
        h('BERAT'),
        h('CASH',   { colSpan: 2 }), {},
        h('KREDIT', { colSpan: 2 }), {},
    ];
    const headerRow2 = [
        {},
        h('kg'),
        h('/kg'),
        h('/btg'),
        h('/kg'),
        h('/btg'),
    ];

    function c(text, alignment) {
        return { text: String(text), alignment: alignment, fontSize: FS_B };
    }

    const body = [headerRow1, headerRow2];

    for (const item of rowItems) {
        const weight   = parseFloat(item.weight) || 0;
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const cashBtg   = (cashKg   > 0 && weight > 0) ? roundSpecial(cashKg   * weight) : 0;
        const kreditBtg = (kreditKg > 0 && weight > 0) ? roundSpecial(kreditKg * weight) : 0;

        const parsed = parseUkuran(item.name || '');
        const ukuran = parsed ? parsed.display : (item.name || '-');

        body.push([
            c(ukuran,                                          'center'),
            c(weight   > 0 ? fmtBerat(weight)   : '-',        'center'),
            c(cashKg   > 0 ? fmtNum(cashKg)     : '-',        'right'),
            c(cashBtg  > 0 ? fmtNum(cashBtg)    : '-',        'right'),
            c(kreditKg > 0 ? fmtNum(kreditKg)   : '-',        'right'),
            c(kreditBtg > 0 ? fmtNum(kreditBtg) : '-',        'right'),
        ]);
    }

    return {
        table: {
            headerRows: 2,
            widths: ['18%', '14%', '17%', '17%', '17%', '17%'],
            body,
        },
        layout: {
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0.5; },
            hLineColor: function () { return BORDER; },
            vLineColor: function () { return BORDER; },
            paddingLeft:   function () { return 3; },
            paddingRight:  function () { return 3; },
            paddingTop:    function () { return 3; },
            paddingBottom: function () { return 3; },
        },
    };
}

// ── render ────────────────────────────────────────────────────────────────────

function render({ items }) {
    const generatedAt = formatJakartaTimestamp();

    // Sort: tebal ASC → lebar ASC → isFull ASC; regex-fail items last by i_name
    const parsed = [];
    const failed = [];

    for (const item of items) {
        const p = parseUkuran(item.name || '');
        if (p) {
            parsed.push({ item: item, tebal: p.tebal, lebar: p.lebar, isFull: p.isFull });
        } else {
            console.warn('[template_plat_strip] regex fail ig_id=' + item.ig_id + ' name="' + item.name + '"');
            failed.push(item);
        }
    }

    parsed.sort(function (a, b) {
        return (a.tebal - b.tebal) ||
               (a.lebar - b.lebar) ||
               (a.isFull ? 1 : 0) - (b.isFull ? 1 : 0);
    });
    failed.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    const allItems = parsed.map(function (e) { return e.item; }).concat(failed);

    // Column-major pagination: fill left column, then right, page-by-page
    const pages = [];
    let cursor = 0;
    while (cursor < allItems.length) {
        const perCol = pages.length === 0 ? ROWS_PER_COL_P1 : ROWS_PER_COL;
        const chunk  = allItems.slice(cursor, cursor + perCol * 2);
        pages.push({
            left:  chunk.slice(0, perCol),
            right: chunk.slice(perCol),
        });
        cursor += perCol * 2;
    }
    if (!pages.length) pages.push({ left: [], right: [] });

    // Content: title only on page 1; column blocks with pageBreak on page 2+
    const content = [];

    pages.forEach(function (pg, i) {
        if (i === 0) {
            content.push({
                text:      'PLAT STRIP',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 0, 0, 4],
            });
        }

        const block = {
            columns: [
                { width: '*', stack: [buildTableNode(pg.left)]  },
                { width: 10,  text: ''                          },
                { width: '*', stack: [buildTableNode(pg.right)] },
            ],
        };

        if (i > 0) block.pageBreak = 'before';
        content.push(block);
    });

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 8, 8, 25],

        footer: function (currentPage, pageCount) {
            return {
                margin: [8, 5, 8, 0],
                columns: [
                    { text: '• Harap lihat stock untuk panjang-panjangnya', alignment: 'left',   fontSize: 7, color: '#444', width: '*'    },
                    { text: 'Page ' + currentPage + '/' + pageCount,        alignment: 'center', fontSize: 7, color: '#444', width: 'auto' },
                    { text: generatedAt,                                      alignment: 'right',  fontSize: 7, color: '#444', width: '*'    },
                ],
            };
        },

        content: content,

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
