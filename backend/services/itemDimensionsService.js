const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

function parseTebal(itemName) {
    if (!itemName) return null;
    const normalized = itemName.replace(/(\d),(\d)/g, '$1.$2');
    const m1 = normalized.match(/(\d+\.?\d*)\s*mm/i);
    if (m1) {
        const val = parseFloat(m1[1]);
        if (val >= 0.1 && val <= 100) return val;
    }
    const m2 = normalized.match(/(\d+\.?\d*)\s*[xX]/);
    if (m2) {
        const val = parseFloat(m2[1]);
        if (val >= 0.1 && val <= 100) return val;
    }
    return null;
}

function formatTebalLabel(tebal) {
    if (tebal === null || tebal === undefined) return '(tidak terdeteksi)';
    const s = String(parseFloat(tebal.toFixed(3))).replace(/\.?0+$/, '');
    return s + ' mm';
}

async function syncTebalForCategory(catId, { forceAll = false } = {}) {
    const items = await dbERP().any(
        'SELECT ig_id, i_name FROM item WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true',
        [catId]
    );
    if (!items.length) return { synced: 0, detected: 0, skipped: 0, total: 0 };

    const igIds = items.map(it => it.ig_id);
    const existing = await dbPLM().any(
        'SELECT ig_id, is_tebal_manual FROM item_dimensions WHERE ig_id = ANY($1)',
        [igIds]
    );
    const existingMap = {};
    existing.forEach(e => { existingMap[e.ig_id] = e; });

    let synced = 0, detected = 0, skipped = 0;

    for (const item of items) {
        const ex = existingMap[item.ig_id];
        if (ex && ex.is_tebal_manual) { skipped++; continue; }
        if (ex && !forceAll) { skipped++; continue; }

        const tebal = parseTebal(item.i_name);
        const label = formatTebalLabel(tebal);
        await dbPLM().none(
            `INSERT INTO item_dimensions (ig_id, tebal, tebal_label, is_tebal_manual)
             VALUES ($1, $2, $3, FALSE)
             ON CONFLICT (ig_id) DO UPDATE SET
               tebal = EXCLUDED.tebal,
               tebal_label = EXCLUDED.tebal_label,
               updated_at = NOW()`,
            [item.ig_id, tebal, label]
        );
        synced++;
        if (tebal !== null) detected++;
    }

    return { synced, detected, skipped, total: items.length };
}

async function forceReparseCategory(catId) {
    return syncTebalForCategory(catId, { forceAll: true });
}

async function getTebalMap(priceListId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT cat_id FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) throw new Error('Pricelist tidak ditemukan');

    await syncTebalForCategory(pl.cat_id);

    const items = await dbERP().any(
        'SELECT ig_id FROM item WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true',
        [pl.cat_id]
    );
    const igIds = items.map(function (i) { return i.ig_id; });
    if (!igIds.length) return {};

    const dims = await dbPLM().any(
        'SELECT ig_id, tebal, tebal_label, is_tebal_manual FROM item_dimensions WHERE ig_id = ANY($1)',
        [igIds]
    );

    const map = {};
    dims.forEach(function (d) { map[d.ig_id] = d; });
    return map;
}

async function updateTebal(igId, tebal, userId) {
    const label = (tebal !== null && tebal !== undefined) ? formatTebalLabel(parseFloat(tebal)) : '(tidak terdeteksi)';
    await dbPLM().none(
        `INSERT INTO item_dimensions (ig_id, tebal, tebal_label, is_tebal_manual, updated_by, updated_at)
         VALUES ($1, $2, $3, TRUE, $4, NOW())
         ON CONFLICT (ig_id) DO UPDATE SET
           tebal = EXCLUDED.tebal,
           tebal_label = EXCLUDED.tebal_label,
           is_tebal_manual = TRUE,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [igId, tebal !== null && tebal !== undefined ? parseFloat(tebal) : null, label, userId]
    );
}

async function listCategoryStats() {
    const cats = await dbERP().any(`
        SELECT ic.cat_id, ic.cat_name
        FROM item_category ic
        WHERE EXISTS (
            SELECT 1 FROM item i
            WHERE i.cat_id = ic.cat_id AND i.deleted_at IS NULL AND i.is_item = true
        )
        AND (ic.cat_name ILIKE '%plat%' OR ic.cat_name ILIKE '%coil%')
        ORDER BY ic.cat_name
    `);
    if (!cats.length) return [];

    const catIds = cats.map(c => c.cat_id);

    const allItems = await dbERP().any(
        'SELECT cat_id, ig_id FROM item WHERE cat_id = ANY($1) AND deleted_at IS NULL AND is_item = true',
        [catIds]
    );
    const allIgIds = allItems.map(it => it.ig_id);

    const dims = allIgIds.length
        ? await dbPLM().any(
            'SELECT ig_id FROM item_dimensions WHERE ig_id = ANY($1) AND tebal IS NOT NULL',
            [allIgIds]
          )
        : [];
    const detectedSet = new Set(dims.map(d => d.ig_id));

    const totalByCat = {};
    const detectedByCat = {};
    allItems.forEach(it => {
        totalByCat[it.cat_id] = (totalByCat[it.cat_id] || 0) + 1;
        if (detectedSet.has(it.ig_id)) detectedByCat[it.cat_id] = (detectedByCat[it.cat_id] || 0) + 1;
    });

    const configs = catIds.length
        ? await dbPLM().any(
            'SELECT cat_id, require_tebal FROM category_dimension_config WHERE cat_id = ANY($1)',
            [catIds]
          )
        : [];
    const configMap = {};
    configs.forEach(c => { configMap[c.cat_id] = c; });

    return cats.map(cat => ({
        cat_id: cat.cat_id,
        cat_name: cat.cat_name,
        total: totalByCat[cat.cat_id] || 0,
        detected: detectedByCat[cat.cat_id] || 0,
        require_tebal: (configMap[cat.cat_id] && configMap[cat.cat_id].require_tebal) || false
    }));
}

async function getCategoryConfig(catId) {
    const cfg = await dbPLM().oneOrNone(
        'SELECT cat_id, cat_name, require_tebal FROM category_dimension_config WHERE cat_id = $1',
        [catId]
    );
    return cfg || { cat_id: catId, require_tebal: false };
}

async function setRequireTebal(catId, catName, requireTebal, userId) {
    await dbPLM().none(
        `INSERT INTO category_dimension_config (cat_id, cat_name, require_tebal, enabled_by, enabled_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (cat_id) DO UPDATE SET
           require_tebal = EXCLUDED.require_tebal,
           enabled_by = EXCLUDED.enabled_by,
           enabled_at = NOW()`,
        [catId, catName, requireTebal, userId]
    );
}

async function validateTebalRequirement(priceListId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT cat_id FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) throw new Error('Pricelist tidak ditemukan');

    const required = await isCategoryRequireTebal(pl.cat_id);
    if (!required) return { ok: true, unassigned_count: 0 };

    const items = await dbERP().any(
        'SELECT ig_id FROM item WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true',
        [pl.cat_id]
    );
    if (!items.length) return { ok: true, unassigned_count: 0 };

    const igIds = items.map(it => it.ig_id);
    const dims = await dbPLM().any(
        'SELECT ig_id FROM item_dimensions WHERE ig_id = ANY($1) AND tebal IS NOT NULL',
        [igIds]
    );
    const assignedSet = new Set(dims.map(d => d.ig_id));
    const unassigned = items.filter(it => !assignedSet.has(it.ig_id));

    return {
        ok: unassigned.length === 0,
        unassigned_count: unassigned.length,
        unassigned_ig_ids: unassigned.map(it => it.ig_id)
    };
}

async function isCategoryRequireTebal(catId) {
    const cfg = await dbPLM().oneOrNone(
        'SELECT require_tebal FROM category_dimension_config WHERE cat_id = $1',
        [catId]
    );
    return (cfg && cfg.require_tebal) || false;
}

module.exports = {
    parseTebal,
    formatTebalLabel,
    syncTebalForCategory,
    forceReparseCategory,
    getTebalMap,
    updateTebal,
    listCategoryStats,
    getCategoryConfig,
    setRequireTebal,
    validateTebalRequirement,
    isCategoryRequireTebal
};
