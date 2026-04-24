/*
 * Item Model — query ke DB ERP (READ ONLY)
 *
 * Schema di DB ERP:
 *   item              : ig_id, i_id, i_name, i_weight, i_group, i_brand,
 *                       serial_id, cat_id, grade, un_id, deleted_at, is_item
 *   item_category     : cat_id, cat_name, unit, unit_code, type_code, type
 *   brand (optional)  : b_id, b_name
 *   unit (optional)   : un_id, un_name
 */

/*
 * Search items by filter
 * params: { cat_id, brand_id, group_id, grade_id, item_name, limit, offset }
 */
module.exports.getItemByQuery = function (params) {
    const queryParams = [];
    let where = "item.deleted_at IS NULL";

    if (params.cat_id && params.cat_id !== "null") {
        queryParams.push(params.cat_id);
        where += ` AND item.cat_id = $${queryParams.length}`;
    }
    if (params.brand_id && params.brand_id !== "null") {
        queryParams.push(params.brand_id);
        where += ` AND item.i_brand = $${queryParams.length}`;
    }
    if (params.group_id && params.group_id !== "null") {
        queryParams.push(params.group_id);
        where += ` AND item.i_group = $${queryParams.length}`;
    }
    if (params.grade_id && params.grade_id !== "null") {
        queryParams.push(params.grade_id);
        where += ` AND item.grade = $${queryParams.length}`;
    }
    if (params.item_name && params.item_name !== "null") {
        queryParams.push(`%${params.item_name}%`);
        where += ` AND item.i_name ILIKE $${queryParams.length}`;
    }

    const query = `
        SELECT
            item.ig_id,
            item.i_id,
            item.i_name,
            item.i_weight,
            item.i_group,
            item.i_brand,
            item.serial_id,
            item.cat_id,
            item.grade,
            item.is_item,
            item_category.cat_name,
            item_category.unit,
            item_category.unit_code,
            item_category.type_code,
            item_category.type
        FROM item
        LEFT JOIN item_category ON item_category.cat_id = item.cat_id
        WHERE ${where}
        ORDER BY item.i_name ASC
    `;

    return dbERP.any(query, queryParams);
};

/*
 * Get items by array of ig_id
 */
module.exports.getItemById = function (ig_ids) {
    const ids = Array.isArray(ig_ids) ? ig_ids : [ig_ids];

    const query = `
        SELECT
            item.ig_id,
            item.i_id,
            item.i_name,
            item.i_weight,
            item.i_group,
            item.i_brand,
            item.serial_id,
            item.cat_id,
            item.grade,
            item.is_item,
            item_category.cat_name,
            item_category.unit,
            item_category.unit_code,
            item_category.type_code,
            item_category.type
        FROM item
        LEFT JOIN item_category ON item_category.cat_id = item.cat_id
        WHERE item.ig_id = ANY($1::int[])
          AND item.deleted_at IS NULL
        ORDER BY item.ig_id ASC
    `;

    return dbERP.any(query, [ids]);
};

/*
 * Get price types dari DB ERP (cash_gudang, kredit_gudang, dll)
 */
module.exports.getPriceTypes = function () {
    return dbERP.any("SELECT pr_id, pr_code, pr_name FROM price ORDER BY pr_id ASC");
};

/*
 * Get harga FINAL (sudah × berat) dari DB ERP untuk export ERP
 */
module.exports.getItemPriceERP = function (ig_ids) {
    const ids = Array.isArray(ig_ids) ? ig_ids : [ig_ids];

    const query = `
        SELECT ig_id, pr_id, i_price
        FROM item_price
        WHERE ig_id = ANY($1::int[])
    `;
    return dbERP.any(query, [ids]);
};
