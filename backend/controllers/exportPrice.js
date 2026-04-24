const fs   = require("fs");
const path = require("path");
const mime = require("mime");

const response      = require("../utils/response");
const $excel        = require("../utils/excel");
const $itemModel    = require("../models/item");
const $exportModel  = require("../models/export");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function streamFile(res, filePath, filename) {
    const mimetype = mime.lookup(filePath);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", mimetype);
    fs.createReadStream(filePath).pipe(res);
}

function roundPrice(raw) {
    if (raw % 100 <= 10) return Math.floor(raw / 100) * 100;
    return Math.ceil(raw / 100) * 100;
}

const HISTORY_DIR = path.join($rootPath, "public", "export_history");
function ensureHistoryDir() {
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/*
 * POST /export/erp
 * Body: { item_prices: [{ ig_id, pr_id, new_price }], cat_id, cat_name }
 */
module.exports._exportPriceListERP = async function (req, res) {
    try {
        const { item_prices, cat_id, cat_name } = req.body;
        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0)
            return response.error(res, "miss_param", null, 400);

        const ig_ids    = [...new Set(item_prices.map(i => i.ig_id))];
        const itemRows  = await $itemModel.getItemById(ig_ids);
        const priceTypes = await $itemModel.getPriceTypes();
        const erpPrices  = await $itemModel.getItemPriceERP(ig_ids);

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

        erpPrices.forEach(({ ig_id, pr_id, i_price }) => {
            const pt = priceTypes.find(p => p.pr_id === pr_id);
            if (pt && items[ig_id]) items[ig_id][pt.pr_code] = parseFloat(i_price);
        });

        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const code = prCodeMap[pr_id];
            if (!items[ig_id] || !code) return;
            items[ig_id][code] = roundPrice(parseFloat(new_price) * items[ig_id].weight);
        });

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
        priceTypes.forEach(pt => cols.push({ name: pt.pr_name, key: pt.pr_code, width: 15 }));

        const rows = ig_ids.map(id => {
            const row = items[id] || {};
            for (const k in row) {
                if (typeof row[k] === "string") row[k] = row[k].replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "");
                else if (typeof row[k] === "number" && isNaN(row[k])) row[k] = 0;
            }
            return row;
        });

        const ts       = moment().format("DDMMYYYYHHmmss");
        const filename = `PriceList_ERP_${ts}.xlsx`;
        const tmpPath  = await $excel.exportPriceListERP(filename, cols, rows);

        // Save persistent copy for history re-download
        ensureHistoryDir();
        const histFilename = `${(cat_name || "export").replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.xlsx`;
        const histPath     = path.join(HISTORY_DIR, histFilename);
        fs.copyFileSync(tmpPath, histPath);
        const fileSize = fs.statSync(histPath).size;

        // Insert export_log (fire-and-forget)
        $exportModel.insertExportLog({
            export_type:   "erp",
            cat_id:        cat_id   || null,
            cat_name:      cat_name || null,
            ig_ids:        ig_ids,
            item_count:    ig_ids.length,
            exported_by:   res.locals.user.id,
            exporter_name: res.locals.user.username || "unknown",
            file_name:     histFilename,
            file_size:     fileSize,
            file_path:     histPath,
        }).catch(e => console.error("[export_log]", e.message));

        streamFile(res, tmpPath, filename);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /export/manual
 * Body: { item_prices: [...], company_name, date, cat_id, cat_name }
 */
module.exports._exportPriceListManual = async function (req, res) {
    try {
        const { item_prices, company_name, date, cat_id, cat_name } = req.body;
        if (!item_prices || !Array.isArray(item_prices) || item_prices.length === 0)
            return response.error(res, "miss_param", null, 400);

        const ig_ids    = [...new Set(item_prices.map(i => i.ig_id))];
        const itemRows  = await $itemModel.getItemById(ig_ids);
        const priceTypes = await $itemModel.getPriceTypes();
        const erpPrices  = await $itemModel.getItemPriceERP(ig_ids);

        const items = {};
        itemRows.forEach(it => {
            items[it.ig_id] = { ig_id: it.ig_id, id: it.i_id, name: it.i_name, unit: it.unit, weight: parseFloat(it.i_weight) || 0 };
        });
        erpPrices.forEach(({ ig_id, pr_id, i_price }) => {
            const pt = priceTypes.find(p => p.pr_id === pr_id);
            if (pt && items[ig_id]) items[ig_id][pt.pr_code] = parseFloat(i_price);
        });
        const prCodeMap = { 2: "cash_gudang", 4: "kredit_gudang" };
        item_prices.forEach(({ ig_id, pr_id, new_price }) => {
            const code = prCodeMap[pr_id];
            if (!items[ig_id] || !code) return;
            items[ig_id][code] = roundPrice(parseFloat(new_price) * items[ig_id].weight);
        });

        const header = { company: company_name || "PT. HAMASA", title: "DAFTAR HARGA", date: date || moment().format("DD MMMM YYYY") };
        const cols = [
            { name: "NO",           key: "no",            width: 5  },
            { name: "KODE BARANG",  key: "id",            width: 20 },
            { name: "NAMA BARANG",  key: "name",          width: 35 },
            { name: "SATUAN",       key: "unit",          width: 10 },
            { name: "BERAT (kg)",   key: "weight",        width: 12 },
            { name: "HARGA CASH",   key: "cash_gudang",   width: 18 },
            { name: "HARGA KREDIT", key: "kredit_gudang", width: 18 },
        ];
        const rows = ig_ids.map((id, idx) => {
            const it = items[id] || {};
            return { no: idx + 1, id: it.id, name: it.name, unit: it.unit, weight: it.weight, cash_gudang: it.cash_gudang || 0, kredit_gudang: it.kredit_gudang || 0 };
        });

        const ts       = moment().format("DDMMYYYYHHmmss");
        const filename = `PriceList_Manual_${ts}.xlsx`;
        const tmpPath  = await $excel.exportPriceListManual(filename, header, cols, rows);

        ensureHistoryDir();
        const histFilename = `Manual_${(cat_name || "export").replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.xlsx`;
        const histPath     = path.join(HISTORY_DIR, histFilename);
        fs.copyFileSync(tmpPath, histPath);

        $exportModel.insertExportLog({
            export_type: "manual", cat_id, cat_name, ig_ids,
            item_count: ig_ids.length, exported_by: res.locals.user.id,
            exporter_name: res.locals.user.username || "unknown",
            file_name: histFilename, file_size: fs.statSync(histPath).size, file_path: histPath,
        }).catch(e => console.error("[export_log]", e.message));

        streamFile(res, tmpPath, filename);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /export/history?cat_id=BP&limit=20&offset=0
 */
module.exports._getExportHistory = async function (req, res) {
    try {
        const { cat_id, limit, offset } = req.query;
        const rows = await $exportModel.getExportHistory(cat_id || null, parseInt(limit) || 20, parseInt(offset) || 0);
        return response.success(res, rows);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * GET /export/history/:id/download
 */
module.exports._downloadHistory = async function (req, res) {
    try {
        const record = await $exportModel.getExportById(parseInt(req.params.id));
        if (!record) return response.error(res, "not_found", null, 404);
        if (!record.file_path || !fs.existsSync(record.file_path))
            return response.error(res, "file_not_found", null, 404);
        streamFile(res, record.file_path, record.file_name || `export_${record.id}.xlsx`);
    } catch (err) {
        return response.error(res, null, err);
    }
};

/*
 * POST /export/pdf — stub
 */
module.exports._exportPdf = function (req, res) {
    res.status(501).json({ status: "error", message: "PDF export belum tersedia" });
};
