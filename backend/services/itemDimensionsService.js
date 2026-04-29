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

async function syncTebalForCategory(catId) {
    const items = await dbERP().any(
        'SELECT ig_id, i_name FROM item WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true',
        [catId]
    );
    for (const item of items) {
        const existing = await dbPLM().oneOrNone(
            'SELECT is_tebal_manual FROM item_dimensions WHERE ig_id = $1',
            [item.ig_id]
        );
        if (existing && existing.is_tebal_manual) continue;
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
    }
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

module.exports = { parseTebal, formatTebalLabel, getTebalMap, updateTebal };
