const fs   = require("fs");
const path = require("path");
const mime = require("mime");

const response   = require("../utils/response");
const $excel     = require("../utils/excel");
const $itemModel = require("../models/item");
const $priceModel = require("../models/price");

// ─── Helper: stream file to client ───────────────────────────────────────────
function streamFile(res, filePath, filename) {
    const mimetype = mime.lookup(filePath);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-Type", mimetype);
    fs.createReadStream(filePath).pipe(res);
}

/*
 * POST /export/erp
 * Export Price List ke format template ERP (PLETL)
 * Body: { item_prices: [{ ig_id, pr_id, new_price }] }
 */
module.exports._exportPriceListERP = async function (req, res) {
    try {
        const { item_prices } = req.body;

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const ig_ids = [...new Set(item_prices.map(i => i.ig_id))];

        // Ambil data item
        const itemRows = await $itemModel.getItemById(ig_ids);
        const items = {};
        itemRows.forEach(it => {
            if (!items[it.ig_id]) items[it.ig_id] = it;
        });

        // Ambil price types dari DB
        const priceTypes = await $priceModel.getPriceTypes();

        // Ambil harga existing
        const existingPrices = await $priceModel.getPricesInfo(ig_ids);
        const priceMap = {};
        existingPrices.forEach(p => { priceMap[p.ig_id] = p; });

        // Terapkan harga baru
        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const pr_code = prCodeMap[pr_id] || `price_${pr_id}`;
            const weight  = parseFloat(items[ig_id]?.weight || 0);
            const raw     = parseFloat(new_price) * weight;
            if (!priceMap[ig_id]) priceMap[ig_id] = {};
            priceMap[ig_id][pr_code] = raw % 100 <= 10
                ? Math.floor(raw / 100) * 100
                : Math.ceil(raw / 100) * 100;
        });

        // Susun kolom ERP
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

        // Susun rows
        const rows = ig_ids.map(ig_id => {
            const it = items[ig_id] || {};
            const pr = priceMap[ig_id] || {};
            const row = {
                ig_id:  it.ig_id,
                id:     it.id,
                serial: it.serial,
                name:   it.name,
                grade:  it.grade,
                brand:  it.brand,
                group:  it.group,
                unit:   it.unit,
                weight: it.weight,
            };
            priceTypes.forEach(pt => { row[pt.pr_code] = pr[pt.pr_code] || 0; });
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
 * Export Price List ke format PL Manual (lebih ringkas, per unit)
 * Body: { item_prices: [{ ig_id, pr_id, new_price }], company_name, date }
 */
module.exports._exportPriceListManual = async function (req, res) {
    try {
        const { item_prices, company_name, date } = req.body;

        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0) {
            return response.error(res, "miss_param", null, 400);
        }

        const ig_ids = [...new Set(item_prices.map(i => i.ig_id))];

        // Ambil data item
        const itemRows = await $itemModel.getItemById(ig_ids);
        const items = {};
        itemRows.forEach(it => {
            if (!items[it.ig_id]) items[it.ig_id] = it;
        });

        // Ambil harga existing
        const existingPrices = await $priceModel.getPricesInfo(ig_ids);
        const priceMap = {};
        existingPrices.forEach(p => { priceMap[p.ig_id] = p; });

        // Terapkan harga baru (per kg → per unit)
        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const pr_code = prCodeMap[pr_id] || `price_${pr_id}`;
            const weight  = parseFloat(items[ig_id]?.weight || 0);
            const raw     = parseFloat(new_price) * weight;
            if (!priceMap[ig_id]) priceMap[ig_id] = {};
            priceMap[ig_id][pr_code] = raw % 100 <= 10
                ? Math.floor(raw / 100) * 100
                : Math.ceil(raw / 100) * 100;
        });

        const header = {
            company: company_name || "PT. PRICE LIST MANAGER",
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
            const pr = priceMap[ig_id] || {};
            return {
                no:            idx + 1,
                id:            it.id,
                name:          it.name,
                unit:          it.unit,
                weight:        it.weight,
                cash_gudang:   pr.cash_gudang   || 0,
                kredit_gudang: pr.kredit_gudang || 0,
            };
        });

        const filename = `PriceList_Manual_${moment().format("DDMMYYYYHHmmss")}.xlsx`;
        const outPath  = await $excel.exportPriceListManual(filename, header, cols, rows);
        streamFile(res, outPath, filename);
    } catch (err) {
        return response.error(res, null, err);
    }
};
