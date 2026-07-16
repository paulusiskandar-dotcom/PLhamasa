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

function parseItemThickness(name) {
    let rawStr = '';
    let sortVal = 999;
    let is3Mtr = false;
    if (name.toUpperCase().includes('@ 3MTR') || name.toUpperCase().includes('@ 3 MTR') || name.toUpperCase().includes('@3MTR') || name.match(/x\s*3000/i)) {
        is3Mtr = true;
    }

    const m = name.match(/(?:Plat|Coil)\s+(?:Hitam|Putih)\s+([\d\.\,\/]+)/i) || name.match(/([\d\.\,\/]+)\s*mm/i);
    if (m) {
        rawStr = m[1];
        sortVal = parseFloat(rawStr.split('/')[0].replace(',', '.'));
    }

    let displayStr = rawStr.replace('.', ',');
    if (is3Mtr) displayStr += ' @ 3MTR';
    if (sortVal === 999) displayStr = 'Lain';
    
    if (displayStr === '1,2 @ 3MTR') displayStr = '1,20 @ 3MTR';
    if (displayStr === '1,7/1,75') displayStr = '1,70/1,75';
    if (displayStr === '1,9/1,95') displayStr = '1,90/1,95';

    return { sortVal: sortVal + (is3Mtr ? 0.001 : 0), displayStr: displayStr };
}

function makeRender(pagesConfig) {
    return function render({ items, customValues }) {
        const generatedAt = moment().tz('Asia/Jakarta').format('DD MMM YYYY HH:mm');
        const fsSize = pagesConfig[0].fontSize || 9;

        const content = [];
        
        const tableLayout = {
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0.5; },
            hLineColor: function () { return '#000000'; },
            vLineColor: function () { return '#000000'; },
            paddingLeft:   function () { return 3; },
            paddingRight:  function () { return 3; },
            paddingTop:    function () { return 2.4; },
            paddingBottom: function () { return 2.4; },
        };

        const tableWidths = [
            '10%', '8%', '8%',
            '2%',
            '8%', '8%',
            '8%', '8%', '12%',
            '8%', '8%', '12%'
        ];

        function getModePrice(prices) {
            const counts = {};
            let maxCount = 0;
            let mode = 0;
            for (let p of prices) {
                if (p > 0) {
                    counts[p] = (counts[p] || 0) + 1;
                    if (counts[p] > maxCount) {
                        maxCount = counts[p];
                        mode = p;
                    }
                }
            }
            return mode;
        }

        pagesConfig.forEach((page, index) => {
            const filtered = items.filter(i => {
                const low = i.name.toLowerCase();
                if (!(low.includes('coil') || low.includes('plat'))) return false;
                
                if (page.keywords && page.keywords.length > 0) {
                    return page.keywords.some(kw => low.includes(kw.toLowerCase()));
                } else {
                    // default 1200 class: exclude 1500/1800 classes
                    if (low.includes('1500') || low.includes('1524') || low.includes('1525') || low.includes('1800') || low.includes('1829')) {
                        return false;
                    }
                    return true;
                }
            });

            const getModeItem = (itemsArray) => {
                if (!itemsArray || itemsArray.length === 0) return null;
                const priceCounts = {};
                itemsArray.forEach(it => {
                    const cash = (it.prices && it.prices.cash_gudang && it.prices.cash_gudang.current) || 0;
                    const kredit = (it.prices && it.prices.kredit_gudang && it.prices.kredit_gudang.current) || 0;
                    if (cash > 0 || kredit > 0) {
                        const key = `${cash}_${kredit}`;
                        priceCounts[key] = (priceCounts[key] || 0) + 1;
                    }
                });
                
                let modeKey = null;
                let maxCount = 0;
                for (const key in priceCounts) {
                    if (priceCounts[key] > maxCount) {
                        maxCount = priceCounts[key];
                        modeKey = key;
                    }
                }
                
                if (modeKey) {
                    const [cashStr, kreditStr] = modeKey.split('_');
                    const cash = parseFloat(cashStr);
                    const kredit = parseFloat(kreditStr);
                    const modeItems = itemsArray.filter(it => {
                        const c = (it.prices && it.prices.cash_gudang && it.prices.cash_gudang.current) || 0;
                        const k = (it.prices && it.prices.kredit_gudang && it.prices.kredit_gudang.current) || 0;
                        return c === cash && k === kredit;
                    });
                    modeItems.sort((a, b) => b.weight - a.weight);
                    return modeItems[0];
                }
                
                itemsArray.sort((a, b) => b.weight - a.weight);
                return itemsArray[0];
            };

            const mapByTebal = {};
            filtered.forEach(item => {
                const isCoil = item.name.toLowerCase().includes('coil');
                const isPlat = item.name.toLowerCase().includes('plat');
                const tebalInfo = parseItemThickness(item.name);
                const key = tebalInfo.sortVal;
                
                if (!mapByTebal[key]) {
                    mapByTebal[key] = { sortVal: key, displayStr: tebalInfo.displayStr, coilItems: [], platItems: [] };
                }
                
                if (isCoil) {
                    mapByTebal[key].coilItems.push(item);
                }
                if (isPlat) {
                    mapByTebal[key].platItems.push(item);
                }
            });
            
            for (const key in mapByTebal) {
                mapByTebal[key].coilItem = getModeItem(mapByTebal[key].coilItems);
                mapByTebal[key].platItem = getModeItem(mapByTebal[key].platItems);
            }

            let tebalsToRender = page.tebals;
            if (!tebalsToRender || tebalsToRender.length === 0) {
                tebalsToRender = Object.values(mapByTebal)
                    .filter(t => t.sortVal !== 999) // exclude unparsed items if any
                    .filter(t => {
                        const hasCoilPrice = t.coilItem && t.coilItem.prices && (
                            (t.coilItem.prices.cash_gudang && t.coilItem.prices.cash_gudang.current > 0) ||
                            (t.coilItem.prices.kredit_gudang && t.coilItem.prices.kredit_gudang.current > 0)
                        );
                        const hasPlatPrice = t.platItem && t.platItem.prices && (
                            (t.platItem.prices.cash_gudang && t.platItem.prices.cash_gudang.current > 0) ||
                            (t.platItem.prices.kredit_gudang && t.platItem.prices.kredit_gudang.current > 0)
                        );
                        return hasCoilPrice || hasPlatPrice;
                    })
                    .sort((a, b) => a.sortVal - b.sortVal)
                    .map(t => t.displayStr);
            } else {
                tebalsToRender = tebalsToRender.filter(tStr => {
                    let is3Mtr = tStr.includes('@ 3MTR');
                    let rawNumStr = tStr.split('@')[0].split('/')[0].trim();
                    let sortVal = parseFloat(rawNumStr.replace(',', '.'));
                    let key = sortVal + (is3Mtr ? 0.001 : 0);

                    const t = mapByTebal[key];
                    if (!t) return false;
                    const hasCoilPrice = t.coilItem && t.coilItem.prices && (
                        (t.coilItem.prices.cash_gudang && t.coilItem.prices.cash_gudang.current > 0) ||
                        (t.coilItem.prices.kredit_gudang && t.coilItem.prices.kredit_gudang.current > 0)
                    );
                    const hasPlatPrice = t.platItem && t.platItem.prices && (
                        (t.platItem.prices.cash_gudang && t.platItem.prices.cash_gudang.current > 0) ||
                        (t.platItem.prices.kredit_gudang && t.platItem.prices.kredit_gudang.current > 0)
                    );
                    return hasCoilPrice || hasPlatPrice;
                });
            }

            const rightRows = tebalsToRender.map(tStr => {
                let is3Mtr = tStr.includes('@ 3MTR');
                let rawNumStr = tStr.split('@')[0].split('/')[0].trim();
                let sortVal = parseFloat(rawNumStr.replace(',', '.'));
                let key = sortVal + (is3Mtr ? 0.001 : 0);

                const entry = mapByTebal[key] || {};
                const coilItem = entry.coilItem || {};
                const platItem = entry.platItem || {};
                
                const coilCash   = (coilItem.prices && coilItem.prices.cash_gudang && coilItem.prices.cash_gudang.current) || 0;
                const coilKredit = (coilItem.prices && coilItem.prices.kredit_gudang && coilItem.prices.kredit_gudang.current) || 0;
                const platCash   = (platItem.prices && platItem.prices.cash_gudang && platItem.prices.cash_gudang.current) || 0;
                const platKredit = (platItem.prices && platItem.prices.kredit_gudang && platItem.prices.kredit_gudang.current) || 0;
                
                let berat = platItem.weight || 0;
                const cashBtg = roundSpecial(platCash * berat);
                const kreditBtg = roundSpecial(platKredit * berat);
                
                let displayStr = tStr.replace(/\./g, ',');
                
                return {
                    sortVal: key,
                    tLabel: displayStr.replace(/ /g, '\u00A0'),
                    berat: berat,
                    coilCash: coilCash,
                    platCash: platCash,
                    cashBtg: cashBtg,
                    coilKredit: coilKredit,
                    platKredit: platKredit,
                    kreditBtg: kreditBtg,
                };
            });

            if (page.hideEmptyRows) {
                for (let i = rightRows.length - 1; i >= 0; i--) {
                    const r = rightRows[i];
                    if (r.coilCash === 0 && r.platCash === 0 && r.coilKredit === 0 && r.platKredit === 0) {
                        rightRows.splice(i, 1);
                    }
                }
            }

            const leftRowsData = [];
            
            page.ranges.forEach(range => {
                const rangeItems = rightRows.filter(r => r.sortVal >= range.min && r.sortVal <= range.max);
                const coilPrice = getModePrice(rangeItems.map(r => r.coilCash));
                const platPrice = getModePrice(rangeItems.map(r => r.platCash));
                leftRowsData.push({ type: 'data', label: range.label.replace(/ /g, '\u00A0'), coilPrice: coilPrice, platPrice: platPrice });
            });
            
            leftRowsData.push({ type: 'spacer' });
            
            leftRowsData.push({ type: 'header1', title: page.tableTitle.replace(/ /g, '\u00A0'), subtitle: 'KREDIT Rp/kg'.replace(/ /g, '\u00A0') });
            leftRowsData.push({ type: 'header2' });
            
            page.ranges.forEach(range => {
                const rangeItems = rightRows.filter(r => r.sortVal >= range.min && r.sortVal <= range.max);
                const coilPrice = getModePrice(rangeItems.map(r => r.coilKredit));
                const platPrice = getModePrice(rangeItems.map(r => r.platKredit));
                leftRowsData.push({ type: 'data', label: range.label.replace(/ /g, '\u00A0'), coilPrice: coilPrice, platPrice: platPrice });
            });

            let currentTableWidths = tableWidths;
            const totalRows = page.includeSummary === false ? rightRows.length : Math.max(Math.max(0, leftRowsData.length - 1), rightRows.length);
            const tableBody = [];
            const hFill = '#E8ECF0';
            
            if (page.includeSummary === false) {
                currentTableWidths = [ '10%', '10%', '10%', '10%', '20%', '10%', '10%', '20%' ];
                
                // ROW 1
                tableBody.push([
                    { text: 'SPHC/SS 400'.replace(/ /g, '\u00A0'), rowSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', relativePosition: { x: 0, y: 5 } },
                    { text: 'BERAT'.replace(/ /g, '\u00A0'), rowSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', relativePosition: { x: 0, y: 5 } },
                    { text: 'CASH', colSpan: 3, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] }, {}, {},
                    { text: 'KREDIT', colSpan: 3, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] }, {}, {},
                ]);

                // ROW 2
                tableBody.push([
                    {}, // spanned
                    {}, // spanned
                    { text: 'COIL', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'PLAT', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'LEMBARAN', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'COIL', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'PLAT', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'LEMBARAN', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                ]);

                // ROW 3
                const dynamicTblTitle = "TBL X " + (page.tableTitle.match(/\d+/) || [""])[0];
                tableBody.push([
                    { text: dynamicTblTitle.replace(/ /g, '\u00A0'), fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: '(kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: '(Rp/btg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: '(Rp/btg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                ]);

                for (let i = 0; i < totalRows; i++) {
                    const right = rightRows[i];
                    if (right) {
                        tableBody.push([
                            { text: right.tLabel, alignment: 'center', fontSize: fsSize },
                            { text: fmtBerat(right.berat), alignment: 'center', fontSize: fsSize },
                            { text: fmtNum(right.coilCash), alignment: 'right', fontSize: fsSize },
                            { text: fmtNum(right.platCash), alignment: 'right', fontSize: fsSize },
                            { text: fmtNum(right.cashBtg), alignment: 'right', fontSize: fsSize },
                            { text: fmtNum(right.coilKredit), alignment: 'right', fontSize: fsSize },
                            { text: fmtNum(right.platKredit), alignment: 'right', fontSize: fsSize },
                            { text: fmtNum(right.kreditBtg), alignment: 'right', fontSize: fsSize },
                        ]);
                    } else {
                        tableBody.push([
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                        ]);
                    }
                }
            } else {
                // ROW 1
                tableBody.push([
                    { text: page.tableTitle.replace(/ /g, '\u00A0'), fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: 'CASH Rp/kg'.replace(/ /g, '\u00A0'), colSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    {},
                    { text: '', border: [false, false, false, false] },
                    { text: '', border: [true, true, true, false], colSpan: 2, fillColor: hFill },
                    {},
                    { text: 'CASH', colSpan: 3, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] }, {}, {},
                    { text: 'KREDIT', colSpan: 3, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] }, {}, {},
                ]);

                // ROW 2
                tableBody.push([
                    { text: 'TEBAL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: 'COIL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: 'PLAT', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] },
                    { text: '', border: [false, false, false, false] },
                    { text: 'SPHC/SS 400'.replace(/ /g, '\u00A0'), colSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', border: [true, false, true, true], relativePosition: { x: 0, y: -4 } },
                    {},
                    { text: 'COIL', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'PLAT', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'LEMBARAN', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'COIL', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'PLAT', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                    { text: 'LEMBARAN', border: [true, true, true, false], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' },
                ]);

                // ROW 3
                const left0 = leftRowsData[0];
                const row3 = [];
                if (left0) {
                    if (left0.type === 'data') {
                        row3.push({ text: left0.label, alignment: 'center', fontSize: fsSize });
                        row3.push({ text: fmtNum(left0.coilPrice), alignment: 'right', fontSize: fsSize });
                        row3.push({ text: fmtNum(left0.platPrice), alignment: 'right', fontSize: fsSize });
                    } else if (left0.type === 'header1') {
                        row3.push({ text: left0.title, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                        row3.push({ text: left0.subtitle, colSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                        row3.push({});
                    } else if (left0.type === 'header2') {
                        row3.push({ text: 'TEBAL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                        row3.push({ text: 'COIL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                        row3.push({ text: 'PLAT', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                    } else {
                        row3.push({ text: '', border: [false, false, false, false] });
                        row3.push({ text: '', border: [false, false, false, false] });
                        row3.push({ text: '', border: [false, false, false, false] });
                    }
                } else {
                    row3.push({ text: '', border: [false, false, false, false] });
                    row3.push({ text: '', border: [false, false, false, false] });
                    row3.push({ text: '', border: [false, false, false, false] });
                }
                row3.push({ text: '', border: [false, false, false, false] });
                
                // Generate the dynamic header for the table, matching what was exactly used (e.g. "TBL X 1200")
                const dynamicTblTitle = "TBL X " + (page.tableTitle.match(/\d+/) || [""])[0];
                
                row3.push({ text: dynamicTblTitle.replace(/ /g, '\u00A0'), fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] });
                row3.push({ text: 'Berat (kg)'.replace(/ /g, '\u00A0'), fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center', margin: [0, 2, 0, 2] });
                row3.push({ text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                row3.push({ text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                row3.push({ text: '(Rp/btg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                row3.push({ text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                row3.push({ text: '(Rp/kg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                row3.push({ text: '(Rp/btg)', border: [true, false, true, true], fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                tableBody.push(row3);
                
                // ROW 4
                const row4 = [];
                const left1 = leftRowsData[1];
                if (left1) {
                    if (left1.type === 'data') {
                        row4.push({ text: left1.label, alignment: 'center', fontSize: fsSize });
                        row4.push({ text: fmtNum(left1.coilPrice), alignment: 'right', fontSize: fsSize });
                        row4.push({ text: fmtNum(left1.platPrice), alignment: 'right', fontSize: fsSize });
                    } else if (left1.type === 'spacer') {
                        row4.push({ text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] });
                    }
                } else {
                    row4.push({ text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] });
                }
                
                tableBody.push(row4);

                for (let i = 0; i < totalRows; i++) {
                    const left = leftRowsData[i + 2];
                    const right = rightRows[i];
                    const rowArr = [];
                    
                    if (left) {
                        if (left.type === 'data') {
                            rowArr.push({ text: left.label, alignment: 'center', fontSize: fsSize });
                            rowArr.push({ text: fmtNum(left.coilPrice), alignment: 'right', fontSize: fsSize });
                            rowArr.push({ text: fmtNum(left.platPrice), alignment: 'right', fontSize: fsSize });
                        } else if (left.type === 'header1') {
                            rowArr.push({ text: left.title, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                            rowArr.push({ text: left.subtitle, colSpan: 2, fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                            rowArr.push({});
                        } else if (left.type === 'header2') {
                            rowArr.push({ text: 'TEBAL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                            rowArr.push({ text: 'COIL', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                            rowArr.push({ text: 'PLAT', fontSize: fsSize, bold: true, fillColor: hFill, alignment: 'center' });
                        } else {
                            rowArr.push({ text: '', border: [false, false, false, false] });
                            rowArr.push({ text: '', border: [false, false, false, false] });
                            rowArr.push({ text: '', border: [false, false, false, false] });
                        }
                    } else {
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                    }
                    
                    rowArr.push({ text: '', border: [false, false, false, false] });
                    
                    if (right) {
                        rowArr.push({ text: right.tLabel, alignment: 'center', fontSize: fsSize });
                        rowArr.push({ text: fmtBerat(right.berat), alignment: 'center', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.coilCash), alignment: 'right', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.platCash), alignment: 'right', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.cashBtg), alignment: 'right', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.coilKredit), alignment: 'right', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.platKredit), alignment: 'right', fontSize: fsSize });
                        rowArr.push({ text: fmtNum(right.kreditBtg), alignment: 'right', fontSize: fsSize });
                    } else {
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                        rowArr.push({ text: '', border: [false, false, false, false] });
                    }
                    
                    tableBody.push(rowArr);
                }
            }

            // Insert title as first row of table so it repeats on every page
            const colCount = currentTableWidths.length;
            const titleRow = [];
            titleRow.push({ text: page.title, colSpan: colCount, fontSize: 14, bold: true, alignment: 'center', border: [false, false, false, false], margin: [0, 0, 0, 2] });
            for (let c = 1; c < colCount; c++) titleRow.push({});
            tableBody.unshift(titleRow);

            if (index > 0) {
                content.push({ text: '', pageBreak: 'before' });
            }

            content.push({
                table: {
                    headerRows: 4,
                    widths: currentTableWidths,
                    body: tableBody,
                    dontBreakRows: true,
                },
                layout: tableLayout,
            });
        });

        const dd = {
            pageSize:        'A4',
            pageOrientation: 'landscape',
            pageMargins:     [20, 12, 20, 28],

            content: content,

            footer: function (currentPage, pageCount) {
                return {
                    margin: [20, 5, 20, 0],
                    columns: [
                        { 
                            width: '*',
                            stack: [
                                { text: '• Harga sudah termasuk PPN', fontSize: fsSize },
                                { text: '• Harga dapat berubah sewaktu-waktu tanpa pemberitahuan', fontSize: fsSize }
                            ],
                            alignment: 'left'
                        },
                        { 
                            width: 'auto',
                            text: 'Page ' + currentPage + '/' + pageCount, 
                            alignment: 'center', 
                            fontSize: fsSize 
                        },
                        { 
                            width: '*',
                            text: 'Jakarta, ' + generatedAt, 
                            alignment: 'right', 
                            fontSize: fsSize 
                        },
                    ],
                };
            },

            defaultStyle: {
                font:     'Helvetica',
                fontSize: fsSize,
                noWrap:   true,
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
