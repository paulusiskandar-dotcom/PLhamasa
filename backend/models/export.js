/*
 * Export Model — query ke DB PLM (export_log)
 */

function parseIgIds(raw) {
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === "string")
        return raw.replace(/[{}]/g, "").split(",").filter(Boolean).map(Number);
    return [];
}

/*
 * Insert export record.
 * data: { export_type, cat_id, cat_name, ig_ids[], item_count, exported_by,
 *         exporter_name, file_name, file_size, file_path }
 */
module.exports.insertExportLog = function (data) {
    return dbPLM.one(`
        INSERT INTO export_log
            (export_type, cat_id, cat_name, ig_ids, item_count,
             exported_by, exporter_name, file_name, file_size, file_path)
        VALUES ($1, $2, $3, $4::int[], $5, $6, $7, $8, $9, $10)
        RETURNING id, exported_at
    `, [
        data.export_type,
        data.cat_id   || null,
        data.cat_name || null,
        data.ig_ids   || [],
        data.item_count || 0,
        data.exported_by   || null,
        data.exporter_name || null,
        data.file_name || null,
        data.file_size || null,
        data.file_path || null,
    ]);
};

/*
 * Paginated export history for a category.
 */
module.exports.getExportHistory = async function (cat_id, limit, offset) {
    const rows = await dbPLM.any(`
        SELECT id, export_type, cat_id, cat_name, ig_ids,
               item_count, exporter_name, exported_at, file_name, file_size
        FROM export_log
        WHERE ($1::text IS NULL OR cat_id = $1)
        ORDER BY exported_at DESC
        LIMIT $2 OFFSET $3
    `, [cat_id || null, limit || 20, offset || 0]);

    return rows.map(r => ({ ...r, ig_ids: parseIgIds(r.ig_ids) }));
};

/*
 * Get single export record for re-download.
 */
module.exports.getExportById = async function (id) {
    const r = await dbPLM.oneOrNone(
        "SELECT * FROM export_log WHERE id = $1",
        [id]
    );
    if (!r) return null;
    return { ...r, ig_ids: parseIgIds(r.ig_ids) };
};
