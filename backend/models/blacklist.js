const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

module.exports.listAll = async function () {
    const rows = await dbPLM().any(`
        SELECT b.id, b.ig_id, b.reason, b.blacklisted_at,
               b.blacklisted_by, u.username AS blacklisted_by_name
        FROM item_blacklist b
        LEFT JOIN users u ON u.id = b.blacklisted_by
        ORDER BY b.blacklisted_at DESC
    `);
    if (!rows.length) return [];

    const igIds = rows.map(function (r) { return r.ig_id; });
    const items = await dbERP().any(`
        SELECT i.ig_id, i.i_name, i.cat_id, ic.cat_name
        FROM item i
        LEFT JOIN item_category ic ON ic.cat_id = i.cat_id
        WHERE i.ig_id = ANY($1::int[])
    `, [igIds]);

    const itemMap = {};
    items.forEach(function (it) { itemMap[it.ig_id] = it; });

    return rows.map(function (r) {
        const it = itemMap[r.ig_id] || {};
        return {
            ...r,
            i_name:   it.i_name   || '(item dihapus dari ERP)',
            cat_id:   it.cat_id   || null,
            cat_name: it.cat_name || '-',
        };
    });
};

module.exports.itemsForCategory = async function (catId, search) {
    const blacklisted = await dbPLM().any('SELECT ig_id FROM item_blacklist');
    const blacklistedIds = blacklisted.map(function (b) { return b.ig_id; });

    let q = `
        SELECT i.ig_id, i.i_name, i.i_brand, i.grade, i.un_name
        FROM item i
        WHERE i.cat_id = $1 AND i.deleted_at IS NULL AND i.is_item = true
    `;
    const params = [catId];

    if (blacklistedIds.length) {
        params.push(blacklistedIds);
        q += ` AND i.ig_id != ALL($${params.length}::int[])`;
    }

    if (search && search.trim()) {
        params.push('%' + search.trim() + '%');
        q += ` AND LOWER(i.i_name) LIKE LOWER($${params.length})`;
    }

    q += ' ORDER BY i.i_name ASC LIMIT 500';
    return dbERP().any(q, params);
};

module.exports.addMany = async function (igIds, reason, userId) {
    if (!igIds || !igIds.length) return { added: 0 };
    let added = 0;
    for (const igId of igIds) {
        await dbPLM().none(
            `INSERT INTO item_blacklist (ig_id, reason, blacklisted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (ig_id) DO NOTHING`,
            [igId, reason || null, userId]
        );
        added++;
    }
    return { added };
};

module.exports.remove = async function (igId) {
    await dbPLM().none('DELETE FROM item_blacklist WHERE ig_id = $1', [igId]);
    return { removed: 1 };
};

module.exports.getBlacklistedIds = async function () {
    const rows = await dbPLM().any('SELECT ig_id FROM item_blacklist');
    return rows.map(function (r) { return r.ig_id; });
};
