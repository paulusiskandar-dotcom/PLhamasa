const fs   = require("fs");
const path = require("path");
const mime = require("mime");

const response    = require("../utils/response");
const $excel      = require("../utils/excel");
const $itemModel  = require("../models/item");
const $priceModel = require("../models/price");

// ─── Helper: stream file ke client ───────────────────────────────────────────
function streamFile(res, filePath, filename) {
    const mimetype = mime.lookup(filePath);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-Type", mimetype);
    fs.createReadStream(filePath).pipe(res);
}

// ─── Helper: round harga ke ratusan (dari existing program) ──────────────────
function roundPrice(raw) {
    if (raw % 100 <= 10) {
        return Math.floor(raw / 100) * 100;
    }
    return Math.ceil(raw / 100) * 100;
}

/*
 * POST /export/erp
 * Export Price List ke format template ERP (PLETL)
 *
 * Body: { item_prices: [{ ig_id, pr_id, new_price }] }
 *
 * Alur:
 *   1. Ambil master data item dari DB ERP
 *   2. Ambil price types dari DB ERP
 *   3. Ambil harga existing dari DB ERP (harga per unit)
 *   4. Untuk item yang diubah: harga_per_kg × berat → round → replace
 *   5. Export ke Excel format ETL/PLETL
 */
module.exports._exportPriceListERP = async function (req, res) {
    try {
        const { item_prices } = req.body;

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const ig_ids = [...new Set(item_prices.map(i => i.ig_id))];

        // 1. Master item dari DB ERP
        const itemRows = await $itemModel.getItemById(ig_ids);
        const items = {};
        itemRows.forEach(it => {
            items[it.ig_id] = {
                ig_id:  it.ig_id,
                id:     it.i_id,
                serial: it.serial_id,
                name:   it.i_name,
                grade:  it.grade,
                brand:  it.i_brand,
                group:  it.i_group,
                unit:   it.unit,
                weight: parseFloat(it.i_weight) || 0,
            };
        });

        // 2. Price types dari DB ERP
        const priceTypes = await $itemModel.getPriceTypes();

        // 3. Harga FINAL existing dari DB ERP (per unit)
        const existingPrices = await $itemModel.getItemPriceERP(ig_ids);
        existingPrices.forEach(({ ig_id, pr_id, i_price }) => {
            const pt = priceTypes.find(p => p.pr_id === pr_id);
            if (pt && items[ig_id]) {
                items[ig_id][pt.pr_code] = parseFloat(i_price);
            }
        });

        // 4. Terapkan harga baru (harga_per_kg × berat → round)
        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const pr_code = prCodeMap[pr_id];
            if (!items[ig_id] || !pr_code) return;

            const weight = items[ig_id].weight;
            const raw    = parseFloat(new_price) * weight;
            items[ig_id][pr_code] = roundPrice(raw);
        });

        // 5. Susun kolom ERP
        const cols = [
            { name: "ID BARANG",   key: "ig_id",  width: 10 },
            { name: "KODE BARANG", key: "id",     width: 20 },
            { name: "SERIAL",      key: "serial", width: 20 },
            { name: "NAMA BARANG", key: "name",   width: 30 },
            { name: "GRADE",       key: "grade",  width: 10 },
            { name: "MEREK",       key: "brand",  width: 15 },
            { name: "GOLONGAN",    key: "group",  width: 10 },
            { name: "UNIT",        key: "unit",   width: 10 },
            { name: "BERAT",       key: "weight", width: 10 },
        ];
        priceTypes.forEach(pt => {
            cols.push({ name: pt.pr_name, key: pt.pr_code, width: 15 });
        });

        // Sanitize rows
        const rows = ig_ids.map(ig_id => {
            const row = items[ig_id] || {};
            for (const k in row) {
                if (typeof row[k] === "string") {
                    row[k] = row[k].replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "");
                } else if (typeof row[k] === "number" && isNaN(row[k])) {
                    row[k] = 0;
                }
            }
            return row;
        });

        const filename = `PriceList_ERP_${moment().format("DDMMYYYYHHmmss")}.xlsx`;
        const outPath  = await $excel.exportPriceListERP(filename, cols, rows);
        streamFile(res, outPath, filename);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /export/manual
 * Export Price List ke format PL Manual
 *
 * Body: { item_prices: [{ ig_id, pr_id, new_price }], company_name, date }
 */
module.exports._exportPriceListManual = async function (req, res) {
    try {
        const { item_prices, company_name, date } = req.body;

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const ig_ids = [...new Set(item_prices.map(i => i.ig_id))];

        // Master item dari DB ERP
        const itemRows = await $itemModel.getItemById(ig_ids);
        const items = {};
        itemRows.forEach(it => {
            items[it.ig_id] = {
                ig_id:  it.ig_id,
                id:     it.i_id,
                name:   it.i_name,
                unit:   it.unit,
                weight: parseFloat(it.i_weight) || 0,
            };
        });

        // Harga existing dari DB ERP
        const priceTypes = await $itemModel.getPriceTypes();
        const existingPrices = await $itemModel.getItemPriceERP(ig_ids);
        existingPrices.forEach(({ ig_id, pr_id, i_price }) => {
            const pt = priceTypes.find(p => p.pr_id === pr_id);
            if (pt && items[ig_id]) {
                items[ig_id][pt.pr_code] = parseFloat(i_price);
            }
        });

        // Terapkan harga baru
        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const pr_code = prCodeMap[pr_id];
            if (!items[ig_id] || !pr_code) return;
            const weight = items[ig_id].weight;
            items[ig_id][pr_code] = roundPrice(parseFloat(new_price) * weight);
        });

        const header = {
            company: company_name || "PT. HAMASA",
            title:   "DAFTAR HARGA",
            date:    date || moment().format("DD MMMM YYYY"),
        };

        const cols = [
            { name: "NO",          key: "no",            width: 5  },
            { name: "KODE BARANG", key: "id",            width: 20 },
            { name: "NAMA BARANG", key: "name",          width: 35 },
            { name: "SATUAN",      key: "unit",          width: 10 },
            { name: "BERAT (kg)",  key: "weight",        width: 12 },
            { name: "HARGA CASH",  key: "cash_gudang",   width: 18 },
            { name: "HARGA KREDIT",key: "kredit_gudang", width: 18 },
        ];

        const rows = ig_ids.map((ig_id, idx) => {
            const it = items[ig_id] || {};
            return {
                no:            idx + 1,
                id:            it.id,
                name:          it.name,
                unit:          it.unit,
                weight:        it.weight,
                cash_gudang:   it.cash_gudang   || 0,
                kredit_gudang: it.kredit_gudang || 0,
            };
        });

        const filename = `PriceList_Manual_${moment().format("DDMMYYYYHHmmss")}.xlsx`;
        const outPath  = await $excel.exportPriceListManual(filename, header, cols, rows);
        streamFile(res, outPath, filename);
    } catch (err) {
        return response.error(res, null, err);
    }
};
