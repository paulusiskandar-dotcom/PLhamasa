/*
 * Settings Model — query ke DB PLM
 */

module.exports.getExtendedCategories = async function () {
    const row = await dbPLM.oneOrNone(
        "SELECT value FROM settings WHERE key = 'extended_categories'"
    );
    if (!row) return [];
    const val = row.value;
    return Array.isArray(val) ? val : [];
};

module.exports.setExtendedCategories = function (catIds, userId) {
    return dbPLM.none(`
        INSERT INTO settings (key, value, updated_by, updated_at)
        VALUES ('extended_categories', $1::jsonb, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET
            value      = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
    `, [JSON.stringify(catIds), userId]);
};
