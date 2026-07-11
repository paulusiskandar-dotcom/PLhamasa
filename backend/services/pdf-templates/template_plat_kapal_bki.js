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
    if (!b) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(b);
}

function fmtThickness(t) {
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(t) + ' mm';
}

const meta = {
    name:         'Plat Kapal BKI',
    cat_id:       null,
    cat_name:     'PLAT KAPAL',
    description:  'Template Plat Kapal BKI — A5 landscape, dikelompokkan per ukuran',
    item_name_like: '%BKI%',
    custom_fields: [],
};

function parseBkiItem(name) {
    if (!name) return null;
    const clean = name.replace(/\s+/g, ' ').trim();
    const m = clean.match(/Plat\s+([\d\.]+)\s*mm\s*x\s*(\d+'?\s*x\s*\d+'?)\s*(BKI(?:\s+[A-D])?)/i);
    if (m) {
        return {
            thickness: parseFloat(m[1]),
            size: m[2].trim(),
            suffix: m[3].trim().toUpperCase()
        };
    }
    const m2 = clean.match(/([\d\.]+)\s*mm\s*x\s*(\d+'?\s*x\s*\d+'?)/i);
    if (m2) {
        const suffixMatch = clean.match(/(BKI(?:\s+[A-D])?)/i);
        return {
            thickness: parseFloat(m2[1]),
            size: m2[2].trim(),
            suffix: suffixMatch ? suffixMatch[1].trim().toUpperCase() : 'BKI'
        };
    }
    return null;
}

function render({ items, customValues }) {
    const _d      = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    const validItems = items.filter(function (item) {
        const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
        const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;
        const hasPrice = cashKg > 0 || kreditKg > 0;
        const parsed = parseBkiItem(item.name);
        if (!hasPrice || !parsed) return false;
        
        const correctSize = parsed.size === "5' x 20'" || parsed.size === "6' x 20'";
        if (!correctSize) return false;

        const brand = (item.i_brand || item.brand || '').toUpperCase().trim();
        return brand === 'KS' || parsed.suffix === 'BKI A';
    });

    const grouped = {};
    validItems.forEach(function (item) {
        const parsed = parseBkiItem(item.name);
        const size = parsed.size;
        if (!grouped[size]) {
            grouped[size] = [];
        }
        grouped[size].push({
            item: item,
            parsed: parsed
        });
    });

    const sortedSizes = Object.keys(grouped).sort(function (a, b) {
        if (a === "5' x 20'") return -1;
        if (b === "5' x 20'") return 1;
        if (a === "6' x 20'") return -1;
        if (b === "6' x 20'") return 1;
        return a.localeCompare(b);
    });

    const hFill = '#E8ECF0';
    const content = [];

    if (sortedSizes.length === 0) {
        content.push({ text: 'Tidak ada data harga Plat Kapal BKI.', alignment: 'center', margin: [0, 20, 0, 0] });
    } else {
        sortedSizes.forEach(function (size, idx) {
            if (idx > 0) {
                content.push({ text: '', pageBreak: 'before' });
            }

            const sizeItems = grouped[size];
            sizeItems.sort(function (a, b) {
                if (a.parsed.thickness !== b.parsed.thickness) {
                    return a.parsed.thickness - b.parsed.thickness;
                }
                return a.parsed.suffix.localeCompare(b.parsed.suffix);
            });

            const rows = sizeItems.map(function (entry) {
                const item = entry.item;
                const parsed = entry.parsed;
                const weight = parseFloat(item.weight) || 0;

                const cashKg   = (item.prices && item.prices.cash_gudang   && item.prices.cash_gudang.current)   || 0;
                const kreditKg = (item.prices && item.prices.kredit_gudang && item.prices.kredit_gudang.current) || 0;

                const cashLbr   = weight > 0 && cashKg   > 0 ? roundSpecial(cashKg   * weight) : 0;
                const kreditLbr = weight > 0 && kreditKg > 0 ? roundSpecial(kreditKg * weight) : 0;

                const thicknessStr = fmtThickness(parsed.thickness);
                const label = thicknessStr;

                return [
                    { text: label,             alignment: 'center', fontSize: 11 },
                    { text: fmtBerat(weight),  alignment: 'center', fontSize: 11 },
                    { text: fmtNum(cashKg),    alignment: 'right',  fontSize: 11 },
                    { text: fmtNum(cashLbr),   alignment: 'right',  fontSize: 11 },
                    { text: fmtNum(kreditKg),  alignment: 'right',  fontSize: 11 },
                    { text: fmtNum(kreditLbr), alignment: 'right',  fontSize: 11 },
                ];
            });

            const titleRow = [
                { text: `PL. KPL BKI ${size}`, colSpan: 6, alignment: 'center', bold: true, fontSize: 14, border: [false, false, false, false], margin: [0, 0, 0, 4] },
                {}, {}, {}, {}, {}
            ];
            const headerRow1 = [
                { text: 'TEBAL',  rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
                { text: 'BERAT',  rowSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill },
                { text: 'CASH',   colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
                { text: 'KREDIT', colSpan: 2, alignment: 'center', bold: true, fontSize: 12, fillColor: hFill }, {},
            ];
            const headerRow2 = [
                {}, {},
                { text: '/ KG',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
                { text: '/ LBR', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
                { text: '/ KG',  alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
                { text: '/ LBR', alignment: 'center', bold: true, fontSize: 11, fillColor: hFill },
            ];

            content.push({
                table: {
                    headerRows: 3,
                    widths: ['32%', '12%', '13%', '15%', '13%', '15%'],
                    body: [titleRow, headerRow1, headerRow2, ...rows],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#000000'; },
                    vLineColor: function () { return '#000000'; },
                    paddingLeft:   function () { return 4; },
                    paddingRight:  function () { return 4; },
                    paddingTop:    function () { return 4; },
                    paddingBottom: function () { return 4; },
                },
            });
        });
    }

    const dd = {
        pageSize:        'A5',
        pageOrientation: 'landscape',
        pageMargins:     [8, 30, 8, 25],

        header: function () {
            return {
                text:      'PLAT KAPAL BKI',
                alignment: 'center',
                bold:      true,
                fontSize:  16,
                margin:    [0, 8, 0, 6],
            };
        },

        content: content,

        footer: function (currentPage, pageCount) {
            return {
                margin: [10, 5, 10, 0],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN', fontSize: 9, margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: 9, margin: [0, 0, 0, 0] },
                        ],
                    },
                    {
                        width:     'auto',
                        text:      'Page ' + currentPage + '/' + pageCount,
                        fontSize:  9,
                        bold:      true,
                        alignment: 'center',
                        margin:    [0, 10, 0, 0],
                    },
                    {
                        width:     '*',
                        text:      generatedAt,
                        fontSize:  9,
                        italics:   true,
                        alignment: 'right',
                        margin:    [0, 10, 0, 0],
                    },
                ],
            };
        },

        defaultStyle: {
            font:     'Helvetica',
            fontSize: 11,
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
function filterItems(item) {
    const parsed = parseBkiItem(item.name || item.i_name);
    if (!parsed) return false;
    const correctSize = parsed.size === "5' x 20'" || parsed.size === "6' x 20'";
    if (!correctSize) return false;

    const brand = (item.i_brand || item.brand || '').toUpperCase().trim();
    return brand === 'KS' || parsed.suffix === 'BKI A';
}

module.exports = { meta, render, filterItems };
