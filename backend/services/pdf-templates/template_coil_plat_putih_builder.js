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
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(b);
}

// Brand mapping logic
function getBrand(item) {
    const rawBrand = item.brand || item.i_brand;
    if (!rawBrand) return 'OTHER';
    const b = String(rawBrand).toUpperCase();
    if (b === 'KS' || b.includes('KRAKATAU') || b.includes('SS400 KS')) return 'KS';
    if (b.includes('GRP')) return 'GRP';
    if (b.includes('AMNS') || b.includes('AM NS') || b.includes('AM/NS')) return 'AMNS';
    return 'OTHER';
}

function parseThicknessAndWidth(name) {
    let tebal = 999;
    let lebar = 1219; // default fallback width
    let rawTebal = '';

    const nameUpper = name.toUpperCase();
    
    // Parse Tebal
    const m = name.match(/(?:Plat|Coil)\s+(?:Putih)\s+([\d\.\,\/]+)/i) || name.match(/([\d\.\,\/]+)\s*mm/i);
    if (m) {
        rawTebal = m[1];
        tebal = parseFloat(rawTebal.replace(',', '.'));
    }

    // Isolate dimensions part after the thickness/mm
    let rest = nameUpper;
    const mmIndex = nameUpper.indexOf('MM');
    if (mmIndex !== -1) {
        rest = nameUpper.substring(mmIndex + 2).trim();
    } else if (m) {
        const index = nameUpper.indexOf(m[0].toUpperCase());
        if (index !== -1) {
            rest = nameUpper.substring(index + m[0].length).trim();
        }
    }

    // Match first dimension/width in the rest of the string (e.g., "X 4", "X 4'", "X 1219", "X 882")
    const widthMatch = rest.match(/(?:X|^|\s)\s*(\d+)\s*('?)/i);
    if (widthMatch) {
        const rawWidth = widthMatch[1];
        const isInch = widthMatch[2] === "'";
        const val = parseInt(rawWidth, 10);
        
        if (isInch || val < 10) {
            // Inch/Feet conversion (standard sheet widths in feet)
            if (val === 4) lebar = 1219;
            else if (val === 3) lebar = 914;
            else if (val === 5) lebar = 1524;
            else if (val === 6) lebar = 1829;
            else lebar = Math.round(val * 304.8); // general feet to mm
        } else {
            lebar = val;
        }
    }

    return { tebal, lebar, rawTebal, isCoil: nameUpper.includes('COIL') };
}

function makeRender(config) {
    return function render({ items, customValues }) {
        const generatedAt = moment().tz('Asia/Jakarta').format('DD MMM YYYY HH:mm');
        const fs = config.fontSize || 10;
        const priceField = config.priceType; // e.g., 'kredit_gudang' or 'cash_gudang'
        const priceLabel = config.priceLabel; // e.g., 'KREDIT' or 'CASH'

        const tableLayout = {
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0.5; },
            hLineColor: function () { return '#000000'; },
            vLineColor: function () { return '#000000'; },
            paddingLeft:   function () { return 3; },
            paddingRight:  function () { return 3; },
            paddingTop:    function () { return 3; },
            paddingBottom: function () { return 3; },
        };

        const tableWidths = [
            '16%', // Ukuran
            '*',   // Coil KS
            '*',   // Coil GRP
            '*',   // Coil AMNS
            '*',   // Plat KS (Kg)
            '*',   // Plat GRP (Kg)
            '*',   // Plat AMNS (Kg)
            '7%',  // TABEL
            '*',   // Plat KS (Lbr)
            '*',   // Plat GRP (Lbr)
            '*'    // Plat AMNS (Lbr)
        ];

        // Group items by (Tebal, Lebar)
        const groups = {};
        
        items.forEach(it => {
            const parsed = parseThicknessAndWidth(it.name);
            if (parsed.tebal === 999) return; // Skip invalid
            
            const key = `${parsed.tebal}_${parsed.lebar}`;
            if (!groups[key]) {
                groups[key] = {
                    tebal: parsed.tebal,
                    rawTebal: parsed.rawTebal,
                    lebar: parsed.lebar,
                    items: []
                };
            }
            it._parsed = parsed;
            it._brand = getBrand(it);
            groups[key].items.push(it);
        });

        // Function to extract price for a specific slot
        function getSlotPrice(grpItems, isCoil, brand, field) {
            const matching = grpItems.filter(i => i._parsed.isCoil === isCoil && i._brand === brand);
            if (!matching.length) return { price: 0, weight: 0 };
            
            // Pick mode price if multiple
            const counts = {};
            let modeItem = matching[0];
            let maxCount = 0;
            
            for (let i of matching) {
                const p = (i.prices && i.prices[field] && i.prices[field].current) || 0;
                if (p > 0) {
                    counts[p] = (counts[p] || 0) + 1;
                    if (counts[p] > maxCount) {
                        maxCount = counts[p];
                        modeItem = i;
                    }
                }
            }
            
            return {
                price: (modeItem.prices && modeItem.prices[field] && modeItem.prices[field].current) || 0,
                weight: modeItem.weight || 0
            };
        }

        const tableBody = [];
        
        // Header rows
        tableBody.push([
            { text: '', border: [true, true, true, false], fillColor: '#f2f2f2' },
            { text: 'Rp/Kg', colSpan: 6, alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            {}, {}, {}, {}, {},
            { text: '', border: [true, true, true, false], fillColor: '#f2f2f2' },
            { text: 'Rp/Lbr', colSpan: 3, alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            {}, {}
        ]);
        
        tableBody.push([
            { text: config.title, border: [true, false, true, true], alignment: 'center', bold: true, fontSize: fs + 1, fillColor: '#f2f2f2' },
            { text: priceLabel, colSpan: 6, alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            {}, {}, {}, {}, {},
            { text: 'BERAT', border: [true, false, true, false], alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: priceLabel, colSpan: 3, alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            {}, {}
        ]);
        
        tableBody.push([
            { text: 'Ukuran', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'Coil KS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'Coil GRP', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'Coil AMNS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLAT KS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLAT GRP', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLAT AMNS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'TABEL', border: [true, false, true, true], alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLT KS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLT GRP', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' },
            { text: 'PLT AMNS', alignment: 'center', bold: true, fontSize: fs, fillColor: '#f2f2f2' }
        ]);

        // Generate Rows
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const ga = groups[a];
            const gb = groups[b];
            if (ga.tebal !== gb.tebal) return ga.tebal - gb.tebal;
            return ga.lebar - gb.lebar;
        });

        sortedKeys.forEach(k => {
            const grp = groups[k];
            
            // Format Ukuran: 0.40 x 1219 x C
            let strTebal = grp.rawTebal;
            if (!strTebal.includes(',') && !strTebal.includes('.')) strTebal += '.00';
            else if (strTebal.length === 3 && (strTebal[1] === '.' || strTebal[1] === ',')) strTebal += '0';
            strTebal = strTebal.replace('.', ',');
            
            const ukuranLabel = `${strTebal} x ${grp.lebar} x C`;

            const coilKS = getSlotPrice(grp.items, true, 'KS', priceField);
            const coilGRP = getSlotPrice(grp.items, true, 'GRP', priceField);
            const coilAMNS = getSlotPrice(grp.items, true, 'AMNS', priceField);
            
            const platKS = getSlotPrice(grp.items, false, 'KS', priceField);
            const platGRP = getSlotPrice(grp.items, false, 'GRP', priceField);
            const platAMNS = getSlotPrice(grp.items, false, 'AMNS', priceField);

            // The 'TABEL' weight is typically taken from the Plat item. We'll find the max weight among plat items.
            let tableWeight = Math.max(platKS.weight, platGRP.weight, platAMNS.weight);
            if (tableWeight === 0) {
                // fallback to coil if no plat exists? Coil weight is usually thousands of kg.
                // It's better to leave it empty if no plat weight.
                tableWeight = 0;
            }

            const lbrKS = platKS.price > 0 && tableWeight > 0 ? roundSpecial(platKS.price * tableWeight) : 0;
            const lbrGRP = platGRP.price > 0 && tableWeight > 0 ? roundSpecial(platGRP.price * tableWeight) : 0;
            const lbrAMNS = platAMNS.price > 0 && tableWeight > 0 ? roundSpecial(platAMNS.price * tableWeight) : 0;

            // Only push row if there's at least one valid price
            if (!coilKS.price && !coilGRP.price && !coilAMNS.price && 
                !platKS.price && !platGRP.price && !platAMNS.price) {
                return;
            }

            tableBody.push([
                { text: ukuranLabel, alignment: 'center', fontSize: fs },
                { text: fmtNum(coilKS.price), alignment: 'right', fontSize: fs },
                { text: fmtNum(coilGRP.price), alignment: 'right', fontSize: fs },
                { text: fmtNum(coilAMNS.price), alignment: 'right', fontSize: fs },
                
                { text: fmtNum(platKS.price), alignment: 'right', fontSize: fs },
                { text: fmtNum(platGRP.price), alignment: 'right', fontSize: fs },
                { text: fmtNum(platAMNS.price), alignment: 'right', fontSize: fs },
                
                { text: fmtBerat(tableWeight), alignment: 'center', fontSize: fs },
                
                { text: fmtNum(lbrKS), alignment: 'right', fontSize: fs },
                { text: fmtNum(lbrGRP), alignment: 'right', fontSize: fs },
                { text: fmtNum(lbrAMNS), alignment: 'right', fontSize: fs },
            ]);
        });



        const dd = {
            pageSize:        'A4',
            pageOrientation: 'landscape',
            pageMargins:     [20, 12, 20, 28],

            content: [
                {
                    text: config.title,
                    style: 'header',
                    alignment: 'center',
                    margin: [0, 0, 0, 10]
                },
                {
                    table: {
                        headerRows: 3,
                        widths: tableWidths,
                        body: tableBody,
                        dontBreakRows: true,
                    },
                    layout: tableLayout,
                }
            ],

            footer: function (currentPage, pageCount) {
                return {
                    margin: [20, 5, 20, 0],
                    columns: [
                        { 
                            width: '*',
                            stack: [
                                { text: '• Harga sudah termasuk PPN', fontSize: 9 },
                                { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: 9 }
                            ],
                            alignment: 'left'
                        },
                        { 
                            width: 'auto',
                            text: 'Page ' + currentPage + '/' + pageCount, 
                            alignment: 'center', 
                            fontSize: 9 
                        },
                        { 
                            width: '*',
                            text: 'Jakarta, ' + generatedAt, 
                            alignment: 'right', 
                            fontSize: 9 
                        },
                    ],
                };
            },

            defaultStyle: {
                font:     'Helvetica',
                fontSize: fs,
                noWrap:   true,
            },
            styles: {
                header: {
                    fontSize: 16,
                    bold: true,
                },
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
    };
}

module.exports = { makeRender };
