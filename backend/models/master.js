/*
 * Master Model — query ke DB ERP (READ ONLY)
 * Untuk dropdown: kategori, merek, grade
 */

module.exports.getAllCategories = function () {
    const query = `
        SELECT cat_id, cat_name
        FROM item_category
        ORDER BY cat_name ASC
    `;
    return dbERP.any(query);
};

module.exports.getAllBrands = function () {
    const query = `
        SELECT DISTINCT i_brand
        FROM item
        WHERE i_brand IS NOT NULL
          AND i_brand != ''
          AND length(trim(i_brand)) > 1
          AND i_brand ~ '^[A-Za-z0-9]'
          AND deleted_at IS NULL
        ORDER BY i_brand ASC
    `;
    return dbERP.any(query);
};

module.exports.getAllGrades = function () {
    // Jika ada tabel item_grade
    const query = `
        SELECT g_id, g_name
        FROM item_grade
        ORDER BY g_name ASC
    `;
    return dbERP.any(query).catch(() => {
        // Fallback: ambil distinct grade dari tabel item
        return dbERP.any(`
            SELECT DISTINCT grade
            FROM item
            WHERE grade IS NOT NULL
              AND grade != ''
              AND deleted_at IS NULL
            ORDER BY grade ASC
        `);
    });
};
