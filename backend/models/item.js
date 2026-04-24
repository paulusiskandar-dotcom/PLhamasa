/*
 * Item Model
 * Sesuaikan nama tabel & kolom dengan schema DB Anda
 */

module.exports.getItems = function (params) {
    let where = "item.deleted_at IS NULL";
    const values = [];
    let vi = 1;

    if (params.cat_id    && params.cat_id    !== "null") { where += ` AND item.cat_id = $${vi++}`;   values.push(params.cat_id); }
    if (params.brand_id  && params.brand_id  !== "null") { where += ` AND item.brand_id = $${vi++}`; values.push(params.brand_id); }
    if (params.grade_id  && params.grade_id  !== "null") { where += ` AND item.grade_id = $${vi++}`; values.push(params.grade_id); }
    if (params.group_id  && params.group_id  !== "null") { where += ` AND item.ig_group = $${vi++}`; values.push(params.group_id); }
    if (params.item_name && params.item_name !== "null") { where += ` AND lower(item.ig_name) LIKE $${vi++}`; values.push(`%${params.item_name.toLowerCase()}%`); }

    const query = `
        SELECT
            item.ig_id,
            item.i_id       AS id,
            item.ig_name    AS name,
            item.ig_serial  AS serial,
            item.ig_grade   AS grade,
            item.ig_group   AS "group",
            item.ig_unit    AS unit,
            item.ig_weight  AS weight,
            brand.b_name    AS brand
        FROM item
        LEFT JOIN brand ON brand.b_id = item.brand_id
        WHERE ${where}
        ORDER BY item.ig_id ASC
        LIMIT $${vi++} OFFSET $${vi++}
    `;
    values.push(params.limit, params.offset);

    return db.any(query, values);
};

module.exports.getItemById = function (ig_ids) {
    const query = `
        SELECT
            item.ig_id,
            item.i_id       AS id,
            item.ig_name    AS name,
            item.ig_serial  AS serial,
            item.ig_grade   AS grade,
            item.ig_group   AS "group",
            item.ig_unit    AS unit,
            item.ig_weight  AS weight,
            brand.b_name    AS brand
        FROM item
        LEFT JOIN brand ON brand.b_id = item.brand_id
        WHERE item.ig_id IN ($1:csv)
        ORDER BY item.ig_id ASC
    `;
    return db.any(query, [ig_ids]);
};
