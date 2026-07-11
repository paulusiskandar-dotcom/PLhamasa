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

// Siku special rounding: round up to the next 500
function roundSpecialSiku(val) {
    if (!val) return 0;
    return Math.ceil(val / 500) * 500;
}

function fmtNum(n) {
    if (n === null || n === undefined || n === '' || n === 0) return '-';
    return new Intl.NumberFormat('id-ID').format(n);
}

function fmtBerat(b) {
    if (!b) return '';
    return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(b);
}

const meta = {
    name:         'Siku Kecil',
    cat_id:       null,
    cat_name:     'SIKU KECIL',
    description:  'Template Besi Siku Kecil — A4 landscape, 15 kolom, ukuran <= 70',
    custom_fields: [],
};

// Siku 50 x 50 x 5 x 6 m A
// Siku 30 x 30 x 3 x 6 m MS (A)
function parseSikuName(name) {
    if (!name) return null;
    const clean = name.replace(/\s+/g, ' ').trim();
    const m = clean.match(/^Siku\s+(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*m\s*(.*)$/i);
    if (m) {
        return {
            sizeLabel: m[1].replace(/\s+/g, '').replace(/x/g, ' x '),
            length: parseFloat(m[2]),
            suffix: m[3].trim()
        };
    }
    return null;
}

function classifyItem(item, parsed) {
    const brand = (item.i_brand || '').toUpperCase().trim();
    const suffix = parsed.suffix.toUpperCase().trim();
    
    // DELCO is DP brand or suffix has D
    if (brand === 'DP' || suffix === 'D') {
        return { type: 'DELCO', grade: 'F' };
    }
    
    // general KS brand / standard
    if (brand === 'KS' || suffix === 'A' || suffix === 'KS' || brand === 'IBB' || brand === 'LBI') {
        // Special case for 30x30x3 which doesn't have standard KS, only EQ/IW
        if (parsed.sizeLabel === '30 x 30 x 3') {
            if (suffix.includes('EQ')) return { type: 'MS_IW_EQ', grade: 'A' };
            if (suffix.includes('IW (B)') || suffix.includes('IW(B)')) return { type: 'MS_IW_EQ', grade: 'B' };
            if (suffix.includes('IW (C)') || suffix.includes('IW(C)')) return { type: 'MS_IW_EQ', grade: 'C' };
        }
        
        if (brand === 'KS' || brand === 'IBB' || brand === 'LBI' || suffix === 'KS' || suffix === 'A') {
            return { type: 'KS', grade: 'F' };
        }
    }
    
    // MS/IW/EQ sub-grades
    if (suffix.includes('EQ') || (brand === 'EQ' && suffix === 'A') || suffix === 'EQ') {
        return { type: 'MS_IW_EQ', grade: 'A' };
    }
    if (suffix.includes('IW (B)') || suffix === 'IW(B)' || suffix.includes('IW (B)') || (suffix === 'B' && (brand === '' || brand === '-'))) {
        return { type: 'MS_IW_EQ', grade: 'B' };
    }
    if (suffix.includes('IW (C)') || suffix === 'IW(C)' || suffix.includes('IW (C)') || (suffix === 'C' && (brand === '' || brand === '-'))) {
        return { type: 'MS_IW_EQ', grade: 'C' };
    }
    
    // Fallbacks
    if (brand === 'KS') return { type: 'KS', grade: 'F' };
    if (brand === 'DP') return { type: 'DELCO', grade: 'F' };
    if (item.name.toUpperCase().includes('EQ')) return { type: 'MS_IW_EQ', grade: 'A' };
    if (item.name.toUpperCase().includes('IW (B)') || item.name.toUpperCase().includes('IW(B)')) return { type: 'MS_IW_EQ', grade: 'B' };
    if (item.name.toUpperCase().includes('IW (C)') || item.name.toUpperCase().includes('IW(C)')) return { type: 'MS_IW_EQ', grade: 'C' };
    
    return null;
}

function render({ items, customValues }) {
    const _d = moment().tz('Asia/Jakarta');
    const _months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const generatedAt = 'Jakarta, ' + _d.format('DD') + ' ' + _months[_d.month()] + ' ' + _d.format('YYYY HH:mm');

    const grouped = {};
    items.forEach(item => {
        const parsed = parseSikuName(item.name);
        if (!parsed) return;
        
        // Skip non-6M items
        if (parsed.length !== 6) return;
        
        // Skip items larger than 70 (siku kecil only)
        const parts = parsed.sizeLabel.split('x').map(x => parseFloat(x.trim()));
        const width = parts[0];
        if (isNaN(width) || width > 70) return;
        
        const groupKey = `${parsed.sizeLabel} @ ${parsed.length}m`;
        if (!grouped[groupKey]) {
            grouped[groupKey] = {
                sizeLabel: parsed.sizeLabel,
                length: parsed.length,
                items: []
            };
        }
        
        const classification = classifyItem(item, parsed);
        if (classification) {
            grouped[groupKey].items.push({
                item: item,
                parsed: parsed,
                type: classification.type,
                grade: classification.grade
            });
        }
    });

    // Helper to get prices from item
    function getPrices(it) {
        if (!it) return { cashKg: 0, kreditKg: 0 };
        const prices = it.prices || {};
        const cashKg = (prices.cash_gudang && prices.cash_gudang.current) || 0;
        const kreditKg = (prices.kredit_gudang && prices.kredit_gudang.current) || 0;
        return { cashKg, kreditKg };
    }

    const outputRows = [];

    // Group keys sorting
    const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
        const ga = grouped[a], gb = grouped[b];
        const pa = ga.sizeLabel.split('x').map(x => parseFloat(x.trim()));
        const pb = gb.sizeLabel.split('x').map(x => parseFloat(x.trim()));
        for (let i = 0; i < 3; i++) {
            if (pa[i] !== pb[i]) return pa[i] - pb[i];
        }
        return ga.length - gb.length;
    });

    sortedGroupKeys.forEach(groupKey => {
        const group = grouped[groupKey];
        
        // Find standard items (F)
        const stdKSItem = group.items.find(x => x.type === 'KS' && x.grade === 'F');
        const stdDelcoItem = group.items.find(x => x.type === 'DELCO' && x.grade === 'F');
        
        // Find sub-grade items
        const gradeAItem = group.items.find(x => x.type === 'MS_IW_EQ' && x.grade === 'A');
        const gradeBItem = group.items.find(x => x.type === 'MS_IW_EQ' && x.grade === 'B');
        const gradeCItem = group.items.find(x => x.type === 'MS_IW_EQ' && x.grade === 'C');
        
        const hasSubGrades = !!(gradeAItem || gradeBItem || gradeCItem);
        const lenSuffix = group.length === 6 ? '' : ` @ ${group.length} m`;

        // Helper to output a standard PDF row array
        function makePdfRow(rowLabel, msIt, ksIt, delcoIt) {
            const row = [];
            
            // 1. Ukuran
            row.push({ text: rowLabel, alignment: 'left' });
            
            // 2. MS/IW/EQ Weight
            const msWt = msIt ? parseFloat(msIt.item.weight) || 0 : 0;
            row.push({ text: msWt > 0 ? fmtBerat(msWt) : '-', alignment: 'center' });
            
            // 3-6. MS/IW/EQ prices (with Rp 50/kg discount applied!)
            const msPrices = getPrices(msIt ? msIt.item : null);
            const msCashKg = msPrices.cashKg > 0 ? msPrices.cashKg - 50 : 0;
            const msKreditKg = msPrices.kreditKg > 0 ? msPrices.kreditKg - 50 : 0;
            const msCashBtg = (msCashKg && msWt) ? roundSpecialSiku(msCashKg * msWt) : 0;
            const msKreditBtg = (msKreditKg && msWt) ? roundSpecialSiku(msKreditKg * msWt) : 0;
            
            row.push({ text: fmtNum(msCashKg), alignment: 'right' });
            row.push({ text: fmtNum(msKreditKg), alignment: 'right' });
            row.push({ text: fmtNum(msCashBtg), alignment: 'right' });
            row.push({ text: fmtNum(msKreditBtg), alignment: 'right' });
            
            // 7. Berat STD
            const stdWtItem = ksIt || delcoIt;
            const stdWt = stdWtItem ? parseFloat(stdWtItem.item.weight) || 0 : 0;
            row.push({ text: stdWt > 0 ? fmtBerat(stdWt) : '-', alignment: 'center' });
            
            // 8-11. KS prices (no discount)
            const ksPrices = getPrices(ksIt ? ksIt.item : null);
            const ksCashKg = ksPrices.cashKg;
            const ksKreditKg = ksPrices.kreditKg;
            const ksCashBtg = (ksCashKg && stdWt) ? roundSpecialSiku(ksCashKg * stdWt) : 0;
            const ksKreditBtg = (ksKreditKg && stdWt) ? roundSpecialSiku(ksKreditKg * stdWt) : 0;
            
            row.push({ text: fmtNum(ksCashKg), alignment: 'right' });
            row.push({ text: fmtNum(ksKreditKg), alignment: 'right' });
            row.push({ text: fmtNum(ksCashBtg), alignment: 'right' });
            row.push({ text: fmtNum(ksKreditBtg), alignment: 'right' });
            
            // 12-15. DELCO prices (no discount)
            const delcoPrices = getPrices(delcoIt ? delcoIt.item : null);
            const delcoCashKg = delcoPrices.cashKg;
            const delcoKreditKg = delcoPrices.kreditKg;
            const delcoCashBtg = (delcoCashKg && stdWt) ? roundSpecialSiku(delcoCashKg * stdWt) : 0;
            const delcoKreditBtg = (delcoKreditKg && stdWt) ? roundSpecialSiku(delcoKreditKg * stdWt) : 0;
            
            row.push({ text: fmtNum(delcoCashKg), alignment: 'right' });
            row.push({ text: fmtNum(delcoKreditKg), alignment: 'right' });
            row.push({ text: fmtNum(delcoCashBtg), alignment: 'right' });
            row.push({ text: fmtNum(delcoKreditBtg), alignment: 'right' });
            
            return row;
        }

        if (hasSubGrades) {
            // Standard row (F)
            if (stdKSItem || stdDelcoItem) {
                outputRows.push(makePdfRow(`${group.sizeLabel} (F)${lenSuffix}`, null, stdKSItem, stdDelcoItem));
            }
            // Grade A row
            if (gradeAItem) {
                outputRows.push(makePdfRow(`${group.sizeLabel} (A)${lenSuffix}`, gradeAItem, null, null));
            }
            // Grade B row
            if (gradeBItem) {
                outputRows.push(makePdfRow(`${group.sizeLabel} (B)${lenSuffix}`, gradeBItem, null, null));
            }
            // Grade C row
            if (gradeCItem) {
                outputRows.push(makePdfRow(`${group.sizeLabel} (C)${lenSuffix}`, gradeCItem, null, null));
            }
        } else {
            // Single standard row without suffix
            if (stdKSItem || stdDelcoItem) {
                outputRows.push(makePdfRow(`${group.sizeLabel}${lenSuffix}`, null, stdKSItem, stdDelcoItem));
            }
        }
    });

    const hFill = '#E8ECF0';
    function h(text, extra) {
        return Object.assign({ text: text, bold: true, fillColor: hFill, alignment: 'center', fontSize: 9, margin: [0, 3, 0, 3] }, extra || {});
    }

    const headerRow1 = [
        h('SIKU', { border: [true, true, true, false] }),
        h('MS/IW/EQ',    { colSpan: 5 }), {}, {}, {}, {},
        h('Berat',       { border: [true, true, true, false] }),
        h('KS',          { colSpan: 4 }), {}, {}, {},
        h('DELCO',       { colSpan: 4 }), {}, {}, {},
    ];

    const headerRow2 = [
        h('UKURAN', { border: [true, false, true, false] }),
        h('Berat',       { border: [true, true, true, false] }),
        h('Harga / Kg', { colSpan: 2 }), {},
        h('Harga / Btg', { colSpan: 2 }), {},
        h('STD',         { border: [true, false, true, false] }),
        h('Harga / Kg', { colSpan: 2 }), {},
        h('Harga / Btg', { colSpan: 2 }), {},
        h('Harga / Kg', { colSpan: 2 }), {},
        h('Harga / Btg', { colSpan: 2 }), {},
    ];

    const headerRow3 = [
        h('@ 6 M', { border: [true, false, true, true] }),
        h('MS/IW/EQ',   { border: [true, false, true, true] }),
        h('Cash'), h('Kredit'),
        h('Cash'), h('Kredit'),
        h('(kg)',        { border: [true, false, true, true] }),
        h('Cash'), h('Kredit'),
        h('Cash'), h('Kredit'),
        h('Cash'), h('Kredit'),
        h('Cash'), h('Kredit'),
    ];

    const dd = {
        pageSize:        'A4',
        pageOrientation: 'landscape',
        pageMargins:     [16, 40, 16, 30],

        header: function () {
            return {
                text:      'SIKU KECIL',
                alignment: 'center',
                bold:      true,
                fontSize:  14,
                margin:    [0, 12, 0, 0],
            };
        },

        content: [
            {
                table: {
                    headerRows: 3,
                    widths: ['12%', '7.5%', '6.5%', '6.5%', '7.5%', '7.5%', '5.5%', '5.5%', '5.5%', '6.5%', '6.5%', '5.5%', '5.5%', '6.5%', '6.0%'],
                    body:   [headerRow1, headerRow2, headerRow3, ...outputRows],
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0.5; },
                    hLineColor: function () { return '#000000'; },
                    vLineColor: function () { return '#000000'; },
                    paddingLeft:   function () { return 2; },
                    paddingRight:  function () { return 2; },
                    paddingTop:    function (i, node) { return (node.table.headerRows && i < node.table.headerRows) ? 0 : 3; },
                    paddingBottom: function (i, node) { return (node.table.headerRows && i < node.table.headerRows) ? 0 : 3; },
                },
            },
        ],

        footer: function (currentPage, pageCount) {
            return {
                margin: [16, 5, 16, 0],
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: '• Harga sudah termasuk PPN', fontSize: 9, margin: [0, 0, 0, 1] },
                            { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: 9, margin: [0, 0, 0, 1] },
                            { text: '• HARGA DIPOTONG Rp. 50,-/kg', fontSize: 9, bold: true, italics: true, margin: [0, 0, 0, 0] },
                        ],
                    },
                    {
                        width:     'auto',
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
            fontSize: 9.5,
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
