/*
 * subcategory.js — PLhamasa subcategory model
 * All queries use global.dbPLM.
 */

const db = () => global.dbPLM;

module.exports.listByCategory = function (catId) {
    return db().any(`
        SELECT s.*,
               COUNT(si.id) AS item_count,
               u.username AS created_by_name
        FROM subcategory s
        LEFT JOIN subcategory_item si ON si.subcategory_id = s.id
        LEFT JOIN users u ON u.id = s.created_by
        WHERE s.cat_id = $1
        GROUP BY s.id, u.username
        ORDER BY s.name ASC
    `, [catId]);
};

module.exports.getById = function (id) {
    return db().oneOrNone('SELECT * FROM subcategory WHERE id=$1', [id]);
};

module.exports.create = function (catId, catName, name, userId) {
    return db().one(
        `INSERT INTO subcategory (cat_id, cat_name, name, created_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [catId, catName, name, userId]
    );
};

module.exports.update = function (id, name, userId) {
    return db().one(
        'UPDATE subcategory SET name=$1, updated_by=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
        [name, userId, id]
    );
};

module.exports.delete = function (id) {
    return db().none('DELETE FROM subcategory WHERE id=$1', [id]);
};

module.exports.getItems = function (subcatId) {
    return db().any('SELECT ig_id FROM subcategory_item WHERE subcategory_id=$1', [subcatId]);
};

module.exports.assignItems = async function (subcatId, igIds, userId) {
    if (!igIds || !igIds.length) return;
    return db().tx(async t => {
        // Remove these items from other subcategories in the same category
        const subcat = await t.one('SELECT cat_id FROM subcategory WHERE id=$1', [subcatId]);
        const otherSubs = await t.any(
            'SELECT id FROM subcategory WHERE cat_id=$1 AND id != $2',
            [subcat.cat_id, subcatId]
        );
        if (otherSubs.length) {
            const otherIds = otherSubs.map(s => s.id);
            await t.none(
                'DELETE FROM subcategory_item WHERE subcategory_id = ANY($1::int[]) AND ig_id = ANY($2::int[])',
                [otherIds, igIds]
            );
        }
        // Remove existing assignments for these items in current subcat
        await t.none('DELETE FROM subcategory_item WHERE subcategory_id=$1 AND ig_id = ANY($2::int[])', [subcatId, igIds]);
        // Insert new
        for (const igId of igIds) {
            await t.none(
                'INSERT INTO subcategory_item (subcategory_id, ig_id) VALUES ($1,$2) ON CONFLICT (ig_id) DO UPDATE SET subcategory_id=EXCLUDED.subcategory_id',
                [subcatId, igId]
            );
        }
    });
};

module.exports.removeItem = function (subcatId, igId) {
    return db().none('DELETE FROM subcategory_item WHERE subcategory_id=$1 AND ig_id=$2', [subcatId, igId]);
};

module.exports.getItemAssignments = async function (catId) {
    const rows = await db().any(`
        SELECT si.ig_id, si.subcategory_id
        FROM subcategory_item si
        JOIN subcategory s ON s.id = si.subcategory_id
        WHERE s.cat_id = $1
    `, [catId]);
    const map = {};
    rows.forEach(r => { map[r.ig_id] = r.subcategory_id; });
    return map;
};
