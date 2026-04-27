const ExcelJS = require("exceljs");
const path    = require("path");

// ─── Color palette ────────────────────────────────────────────────────────────
const COLOR = {
    primary:     "FF1E3A5F",  // Navy
    secondary:   "FFD4A843",  // Gold
    headerText:  "FFFFFFFF",
    border:      "FFB0B0B0",
    rowEven:     "FFF5F7FA",
    rowOdd:      "FFFFFFFF",
    total:       "FFE8F0E9",
};

function borderAll(color) {
    const s = { style: "thin", color: { argb: color || COLOR.border } };
    return { top: s, left: s, bottom: s, right: s };
}

/*
 * Export PL ERP — format ETL / PLETL
 * Sama seperti existing, kolom: ID, KODE, SERIAL, NAMA, GRADE, MEREK, GOLONGAN, UNIT, BERAT + price types
 */
module.exports.exportPriceListERP = async function (filename, cols, rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Price List ERP");

    // Row 1: ETL code
    ws.getCell("A1").value = "ETL code :";
    ws.getCell("B1").value = "PLETL";
    ws.getCell("A1").font = { bold: true };

    // Row 2: kosong
    // Row 3: Header kolom
    const headerRow = ws.getRow(3);
    cols.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value           = col.name;
        cell.font            = { bold: true, color: { argb: COLOR.headerText } };
        cell.fill            = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.primary } };
        cell.alignment       = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border          = borderAll();
    });
    headerRow.height = 30;

    // Set column widths
    ws.columns = cols.map(c => ({ width: c.width || 15 }));

    // Data rows mulai dari row 4
    rows.forEach((row, idx) => {
        const wsRow = ws.addRow(cols.map(c => row[c.key] ?? ""));
        const fillColor = idx % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;
        wsRow.eachCell({ includeEmpty: true }, cell => {
            cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
            cell.border = borderAll();
            cell.alignment = { vertical: "middle" };
        });
    });

    const filePath = path.join($rootPath, "public", "tmp_file", filename);
    await wb.xlsx.writeFile(filePath);
    return filePath;
};

/*
 * generateErpExcel — ETL template matching PERUBAHAN_HARGA_*.xlsx
 * Returns { buffer: Buffer, filename: string }
 */
module.exports.generateErpExcel = async function (priceListId) {
    const dbPLM = () => global.dbPLM;
    const dbERP = () => global.dbERP;
    const $blacklist = require('../models/blacklist');

    // 1. Get price list metadata
    const pl = await dbPLM().oneOrNone('SELECT id, cat_id, cat_name, status FROM price_list WHERE id = $1', [priceListId]);
    if (!pl) throw new Error('price_list_not_found');

    // 2. Get price list items
    const plmItems = await dbPLM().any(
        'SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1',
        [priceListId]
    );
    if (!plmItems.length) throw new Error('no_items');

    // Group prices by ig_id → { pr_id: price }
    const priceByIg = {};
    plmItems.forEach(it => {
        if (!priceByIg[it.ig_id]) priceByIg[it.ig_id] = {};
        priceByIg[it.ig_id][it.pr_id] = parseFloat(it.i_price);
    });

    // Exclude blacklisted items (only for OPEN records)
    let igIds = Object.keys(priceByIg).map(Number);
    if (pl.status !== 'PUBLISHED') {
        const blacklistedIds = await $blacklist.getBlacklistedIds();
        if (blacklistedIds.length) {
            igIds = igIds.filter(function (id) { return !blacklistedIds.includes(id); });
        }
    }

    // 3. Get item info from ERP
    const items = await dbERP().any(`
        SELECT i.ig_id, i.i_id, i.serial_id, i.i_name, i.grade,
               i.i_brand, i.i_group, i.i_weight,
               i.un_name
        FROM item i
        WHERE i.ig_id = ANY($1::int[]) AND i.deleted_at IS NULL AND i.is_item = true
        ORDER BY i.i_name ASC
    `, [igIds]);

    // 4. Build workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet 1');

    // Row 1
    ws.getCell('A1').value = 'ETL code :';
    ws.getCell('B1').value = 'PLETL';

    // Row 3 — headers
    const HEADERS = [
        'ID BARANG', 'KODE BARANG', 'SERIAL', 'NAMA BARANG', 'GRADE',
        'MEREK', 'GOLONGAN', 'UNIT', 'BERAT',
        'CASH PABRIK', 'CASH GUDANG', 'KREDIT PABRIK', 'KREDIT GUDANG'
    ];
    const headerRow = ws.getRow(3);
    HEADERS.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        if (i >= 8) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Column widths
    const COL_WIDTHS = [10, 20, 13, 40.57, 9.14, 13, 10, 9.14, 9.14, 15, 13, 13, 13];
    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // 5. Data rows from row 4
    function roundSpecial(raw) {
        if (!raw) return 0;
        const sisa = Math.round(raw) % 100;
        return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
    }

    items.forEach((item, idx) => {
        const prices = priceByIg[item.ig_id] || {};
        const weight = parseFloat(item.i_weight) || 0;

        const row = ws.getRow(4 + idx);
        row.getCell(1).value  = item.ig_id;
        row.getCell(2).value  = item.i_id || '';
        row.getCell(3).value  = item.serial_id || '-';
        row.getCell(4).value  = item.i_name || '';
        row.getCell(5).value  = item.grade || '';
        row.getCell(6).value  = item.i_brand || '';
        row.getCell(7).value  = item.i_group || '';
        row.getCell(8).value  = item.un_name || 'Btg';
        row.getCell(9).value  = weight;
        row.getCell(10).value = prices[1] ? roundSpecial(prices[1] * weight) : 0; // CASH PABRIK  (pr_id=1)
        row.getCell(11).value = prices[2] ? roundSpecial(prices[2] * weight) : 0; // CASH GUDANG  (pr_id=2)
        row.getCell(12).value = prices[3] ? roundSpecial(prices[3] * weight) : 0; // KREDIT PABRIK (pr_id=3)
        row.getCell(13).value = prices[4] ? roundSpecial(prices[4] * weight) : 0; // KREDIT GUDANG (pr_id=4)

        for (let c = 9; c <= 13; c++) {
            row.getCell(c).alignment = { horizontal: 'center' };
        }
    });

    // 6. Build filename and return buffer
    const slug = pl.cat_name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const filename = `PERUBAHAN_HARGA_${slug}.xlsx`;

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer, filename };
};

/*
 * Export PL Manual — format rapi untuk distribusi manual
 * Header perusahaan, judul, tanggal, tabel dengan styling
 */
module.exports.exportPriceListManual = async function (filename, header, cols, rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Price List Manual");

    const totalCols = cols.length;

    // ── Row 1: Nama perusahaan ──────────────────────────────────────────────
    ws.mergeCells(1, 1, 1, totalCols);
    const companyCell = ws.getCell("A1");
    companyCell.value     = header.company;
    companyCell.font      = { bold: true, size: 14, color: { argb: COLOR.primary } };
    companyCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height   = 28;

    // ── Row 2: Judul ─────────────────────────────────────────────────────────
    ws.mergeCells(2, 1, 2, totalCols);
    const titleCell = ws.getCell("A2");
    titleCell.value     = header.title;
    titleCell.font      = { bold: true, size: 16, color: { argb: COLOR.headerText } };
    titleCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.primary } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 36;

    // ── Row 3: Tanggal ────────────────────────────────────────────────────────
    ws.mergeCells(3, 1, 3, totalCols);
    const dateCell = ws.getCell("A3");
    dateCell.value     = `Tanggal : ${header.date}`;
    dateCell.font      = { italic: true, size: 10, color: { argb: COLOR.primary } };
    dateCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(3).height = 18;

    // ── Row 4: kosong ─────────────────────────────────────────────────────────
    ws.getRow(4).height = 8;

    // ── Row 5: Header tabel ───────────────────────────────────────────────────
    const headerRow = ws.getRow(5);
    cols.forEach((col, i) => {
        const cell       = headerRow.getCell(i + 1);
        cell.value       = col.name;
        cell.font        = { bold: true, color: { argb: COLOR.headerText } };
        cell.fill        = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.secondary } };
        cell.alignment   = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border      = borderAll();
    });
    headerRow.height = 28;

    // ── Set column widths ─────────────────────────────────────────────────────
    ws.columns = cols.map(c => ({ width: c.width || 15 }));

    // ── Data rows mulai row 6 ─────────────────────────────────────────────────
    const currencyFmt = '#,##0';
    rows.forEach((row, idx) => {
        const wsRow    = ws.addRow(cols.map(c => row[c.key] ?? ""));
        const fillColor = idx % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;

        wsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
            cell.border = borderAll();
            cell.alignment = { vertical: "middle" };

            // Format currency untuk kolom harga (kolom 6 & 7)
            if (colNumber >= 6) {
                cell.numFmt    = currencyFmt;
                cell.alignment = { horizontal: "right", vertical: "middle" };
            }
            // Kolom NO center
            if (colNumber === 1) {
                cell.alignment = { horizontal: "center", vertical: "middle" };
            }
        });
        wsRow.height = 20;
    });

    // ── Footer: total items ───────────────────────────────────────────────────
    ws.addRow([]);
    const footerRow = ws.addRow([`Total: ${rows.length} item`]);
    footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF888888" } };

    const filePath = path.join($rootPath, "public", "tmp_file", filename);
    await wb.xlsx.writeFile(filePath);
    return filePath;
};
