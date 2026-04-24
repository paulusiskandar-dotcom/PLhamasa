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
