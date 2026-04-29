/*
 * postReportPdf.js — Generate PDF Laporan Post to ERP
 */

const PdfPrinter = require('pdfmake/src/printer');
const fs         = require('fs').promises;
const path       = require('path');
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

const REPORT_DIR = path.join(__dirname, '../storage/post-reports');

const PR_LABEL = {
    1: 'Cash Pabrik',
    2: 'Cash Gudang',
    3: 'Kredit Pabrik',
    4: 'Kredit Gudang',
};

function fmtNum(n) {
    if (n === null || n === undefined || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

/**
 * Generate PDF Laporan Post to ERP dan simpan ke disk.
 *
 * @param {Object} data
 *   data.priceList     — { id, cat_name, revision_no, posted_at, posted_by_name, target_erp_name }
 *   data.items         — [{ ig_id, ig_name, pr_id, harga_lama, harga_baru }]
 *   data.summary       — { total, duration_ms, mismatch_count }
 * @returns {Promise<string>} relative path dari backend root
 */
async function generate(data) {
    await fs.mkdir(REPORT_DIR, { recursive: true });

    const pl      = data.priceList;
    const items   = (data.items || []).slice().sort(function (a, b) {
        return (a.ig_name || '').localeCompare(b.ig_name || '');
    });
    const summary = data.summary || {};

    const safeCat  = (pl.cat_name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
    const revPad   = String(pl.revision_no || 0).padStart(3, '0');
    const ts       = moment(pl.posted_at).tz('Asia/Jakarta').format('YYYYMMDD_HHmm');
    const fileName = 'Post_ERP_' + safeCat + '_' + revPad + '_' + ts + '.pdf';
    const filePath = path.join(REPORT_DIR, fileName);

    const hFill  = '#1E3A5F';
    const hColor = '#fff';

    const headerRow = [
        { text: 'NAMA BARANG',   alignment: 'left',   bold: true, fontSize: 11, fillColor: hFill, color: hColor },
        { text: 'JENIS',         alignment: 'center', bold: true, fontSize: 11, fillColor: hFill, color: hColor },
        { text: 'Harga Sebelum', alignment: 'right',  bold: true, fontSize: 11, fillColor: hFill, color: hColor },
        { text: 'Harga Sesudah', alignment: 'right',  bold: true, fontSize: 11, fillColor: hFill, color: hColor },
    ];

    const rows = items.map(function (item) {
        return [
            { text: item.ig_name || '',               alignment: 'left',   fontSize: 10 },
            { text: PR_LABEL[item.pr_id] || ('PR ' + item.pr_id), alignment: 'center', fontSize: 10 },
            { text: fmtNum(item.harga_lama),           alignment: 'right',  fontSize: 10 },
            { text: fmtNum(item.harga_baru),           alignment: 'right',  fontSize: 10, bold: true },
        ];
    });

    const infoTable = [
        [{ text: 'Kategori',      bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: pl.cat_name || '-',                                            fontSize: 10, border: [false,false,false,false] }],
        [{ text: 'Revisi',        bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: '#' + revPad,                                                   fontSize: 10, border: [false,false,false,false] }],
        [{ text: 'Posted by',     bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: pl.posted_by_name || '-',                                       fontSize: 10, border: [false,false,false,false] }],
        [{ text: 'Timestamp',     bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: moment(pl.posted_at).tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm:ss'), fontSize: 10, border: [false,false,false,false] }],
        [{ text: 'Target ERP',    bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: pl.target_erp_name || 'Default',                                fontSize: 10, border: [false,false,false,false] }],
        [{ text: 'Total dipost',  bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] }, { text: (summary.total || 0) + ' harga (' + (summary.duration_ms || 0) + 'ms)', fontSize: 10, border: [false,false,false,false] }],
        [
            { text: 'Cross-check', bold: true, fontSize: 10, fillColor: '#F5F7FA', border: [false,false,false,false] },
            {
                text:  summary.mismatch_count > 0
                    ? (summary.mismatch_count + ' mismatch (kemungkinan rounding ERP)')
                    : 'Semua match',
                fontSize: 10,
                color: summary.mismatch_count > 0 ? '#E65100' : '#2E7D32',
                border: [false,false,false,false],
            },
        ],
    ];

    const dd = {
        pageSize:        'A4',
        pageOrientation: 'portrait',
        pageMargins:     [40, 30, 40, 50],

        content: [
            { text: 'LAPORAN POST TO ERP',   alignment: 'center', bold: true, fontSize: 16, margin: [0, 0, 0, 4] },
            { text: 'PT. Hamasa Steel Centre', alignment: 'center', fontSize: 10, color: '#5A6C7E', margin: [0, 0, 0, 16] },
            { table: { widths: ['28%', '72%'], body: infoTable }, margin: [0, 0, 0, 16] },
            { text: 'DETAIL HARGA YANG DIPOST', bold: true, fontSize: 12, color: '#1E3A5F', margin: [0, 0, 0, 6] },
            {
                table: {
                    headerRows: 1,
                    widths: ['42%', '20%', '19%', '19%'],
                    body: [headerRow].concat(rows),
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#C5CCD3'; },
                    vLineColor: function () { return '#C5CCD3'; },
                    paddingLeft:   function () { return 6; },
                    paddingRight:  function () { return 6; },
                    paddingTop:    function () { return 5; },
                    paddingBottom: function () { return 5; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [40, 10, 40, 0],
                columns: [
                    { text: 'Hal. ' + currentPage + ' dari ' + pageCount, alignment: 'left',  fontSize: 9, color: '#5A6C7E' },
                    { text: 'Generated: ' + moment().tz('Asia/Jakarta').format('DD MMM YYYY HH:mm'), alignment: 'right', fontSize: 9, color: '#5A6C7E' },
                ],
            };
        },

        defaultStyle: { font: 'Helvetica', fontSize: 10 },
    };

    return new Promise(function (resolve, reject) {
        const printer = new PdfPrinter(fonts);
        const pdfDoc  = printer.createPdfKitDocument(dd);
        const chunks  = [];
        pdfDoc.on('data',  function (chunk) { chunks.push(chunk); });
        pdfDoc.on('end',   async function () {
            try {
                await fs.writeFile(filePath, Buffer.concat(chunks));
                // Return relative path from backend root
                const relPath = path.relative(path.join(__dirname, '..'), filePath);
                resolve(relPath);
            } catch (err) { reject(err); }
        });
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}

module.exports = { generate, REPORT_DIR };
