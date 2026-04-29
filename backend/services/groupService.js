/*
 * groupService.js — Grouping system for Plat/Coil categories
 */

const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

// ── Thickness parsing ─────────────────────────────────────────────────────────

function parseThickness(itemName) {
    if (!itemName) return null;

    // Pattern 1: number followed by 'x' or 'X'
    const m1 = itemName.match(/(\d+\.?\d*)\s*[xX]/);
    if (m1) {
        const val = parseFloat(m1[1]);
        if (val >= 0.1 && val <= 50) return val;
    }

    // Pattern 2: number followed by 'mm'
    const m2 = itemName.match(/(\d+\.?\d*)\s*mm/i);
    if (m2) {
        const val = parseFloat(m2[1]);
        if (val >= 0.1 && val <= 50) return val;
    }

    return null;
}

function autoDetectGroups(items) {
    const groupMap = {};
    const undetected = [];

    items.forEach(function (item) {
        const t = parseThickness(item.i_name);
        if (t === null) {
            undetected.push(item.ig_id);
            return;
        }
        if (!groupMap[t]) groupMap[t] = [];
        groupMap[t].push(item.ig_id);
    });

    const groups = Object.keys(groupMap)
        .map(function (t) { return { thickness: parseFloat(t), items: groupMap[t] }; })
        .sort(function (a, b) { return a.thickness - b.thickness; });

    return { groups, undetected };
}

// ── Config ────────────────────────────────────────────────────────────────────

async function isGroupingEnabled(catId) {
    const cfg = await dbPLM().oneOrNone(
        'SELECT is_enabled FROM category_grouping_config WHERE cat_id = $1',
        [catId]
    );
    return cfg ? cfg.is_enabled : false;
}

async function listCategoryConfigs() {
    return dbPLM().any('SELECT * FROM category_grouping_config ORDER BY cat_name');
}

async function enableGrouping(catId, catName, userId) {
    await dbPLM().none(
        `INSERT INTO category_grouping_config (cat_id, cat_name, is_enabled, enabled_by, enabled_at)
         VALUES ($1, $2, TRUE, $3, NOW())
         ON CONFLICT (cat_id) DO UPDATE
         SET is_enabled = TRUE, enabled_by = EXCLUDED.enabled_by, enabled_at = NOW()`,
        [catId, catName, userId]
    );
}

async function disableGrouping(catId) {
    await dbPLM().none(
        'UPDATE category_grouping_config SET is_enabled = FALSE WHERE cat_id = $1',
        [catId]
    );
}

// ── Init groups ───────────────────────────────────────────────────────────────

async function previewInitGroups(priceListId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT id, cat_id, cat_name FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) throw new Error('Pricelist tidak ditemukan');
    if (!(await isGroupingEnabled(pl.cat_id))) {
        throw new Error('Grouping belum di-enable untuk kategori ini');
    }

    const items = await dbERP().any(
        `SELECT ig_id, i_name, i_weight
         FROM item
         WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true
         ORDER BY i_name`,
        [pl.cat_id]
    );

    const { groups, undetected } = autoDetectGroups(items);
    const itemMap = {};
    items.forEach(function (it) { itemMap[it.ig_id] = it; });

    return {
        price_list_id:  priceListId,
        cat_id:         pl.cat_id,
        cat_name:       pl.cat_name,
        groups: groups.map(function (g) {
            return {
                thickness:       g.thickness,
                thickness_label: g.thickness + ' mm',
                items: g.items.map(function (igId) {
                    return {
                        ig_id:    igId,
                        i_name:   itemMap[igId].i_name,
                        i_weight: itemMap[igId].i_weight,
                    };
                }),
            };
        }),
        undetected: undetected.map(function (igId) {
            return {
                ig_id:    igId,
                i_name:   itemMap[igId].i_name,
                i_weight: itemMap[igId].i_weight,
            };
        }),
        total_items:    items.length,
        grouped_count:  items.length - undetected.length,
    };
}

async function applyInitGroups(priceListId, userId) {
    return dbPLM().tx(async function (t) {
        const pl = await t.oneOrNone(
            'SELECT cat_id FROM price_list WHERE id = $1',
            [priceListId]
        );
        if (!pl) throw new Error('Pricelist tidak ditemukan');

        const existing = await t.oneOrNone(
            'SELECT COUNT(*) AS c FROM item_group_definition WHERE price_list_id = $1',
            [priceListId]
        );
        if (parseInt(existing.c) > 0) {
            throw new Error('Groups sudah pernah di-init untuk pricelist ini');
        }

        const items = await dbERP().any(
            `SELECT ig_id, i_name FROM item
             WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true`,
            [pl.cat_id]
        );

        const { groups } = autoDetectGroups(items);
        let order = 0;

        for (const g of groups) {
            const def = await t.one(
                `INSERT INTO item_group_definition
                   (price_list_id, cat_id, thickness_value, thickness_label, display_order)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [priceListId, pl.cat_id, g.thickness, g.thickness + ' mm', order++]
            );
            for (const igId of g.items) {
                await t.none(
                    'INSERT INTO item_group_assignment (group_id, ig_id, assigned_by) VALUES ($1, $2, $3)',
                    [def.id, igId, userId]
                );
            }
        }

        return { success: true, groups_created: groups.length };
    });
}

// ── Read groups ───────────────────────────────────────────────────────────────

async function getGroupsWithItems(priceListId) {
    const groups = await dbPLM().any(
        `SELECT id, thickness_value, thickness_label, display_order
         FROM item_group_definition
         WHERE price_list_id = $1
         ORDER BY display_order, thickness_value`,
        [priceListId]
    );
    if (!groups.length) return [];

    const groupIds = groups.map(function (g) { return g.id; });
    const assignments = await dbPLM().any(
        'SELECT group_id, ig_id FROM item_group_assignment WHERE group_id = ANY($1)',
        [groupIds]
    );

    const igIds = assignments.map(function (a) { return a.ig_id; });
    const itemDetails = igIds.length
        ? await dbERP().any(
            'SELECT ig_id, i_name, i_weight, un_name FROM item WHERE ig_id = ANY($1::int[]) AND deleted_at IS NULL',
            [igIds]
          )
        : [];

    const itemMap = {};
    itemDetails.forEach(function (it) { itemMap[it.ig_id] = it; });

    return groups.map(function (g) {
        return {
            id:              g.id,
            thickness_value: parseFloat(g.thickness_value),
            thickness_label: g.thickness_label,
            display_order:   g.display_order,
            items: assignments
                .filter(function (a) { return a.group_id === g.id; })
                .map(function (a) {
                    const it = itemMap[a.ig_id] || {};
                    return {
                        ig_id:    a.ig_id,
                        i_name:   it.i_name  || ('Item ' + a.ig_id),
                        i_weight: parseFloat(it.i_weight) || 0,
                        un_name:  it.un_name || '',
                    };
                }),
        };
    });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function moveItemToGroup(igId, fromGroupId, toGroupId) {
    return dbPLM().tx(async function (t) {
        const defs = await t.any(
            'SELECT id, price_list_id FROM item_group_definition WHERE id = ANY($1)',
            [[fromGroupId, toGroupId]]
        );
        if (defs.length !== 2) throw new Error('Group tidak valid');
        if (String(defs[0].price_list_id) !== String(defs[1].price_list_id)) {
            throw new Error('Group harus dalam pricelist yang sama');
        }
        await t.none(
            'UPDATE item_group_assignment SET group_id = $1 WHERE group_id = $2 AND ig_id = $3',
            [toGroupId, fromGroupId, igId]
        );
    });
}

async function detectNewItems(priceListId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT cat_id FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) return [];

    const erpItems = await dbERP().any(
        `SELECT ig_id, i_name, i_weight
         FROM item WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true`,
        [pl.cat_id]
    );

    const assigned = await dbPLM().any(
        `SELECT iga.ig_id FROM item_group_assignment iga
         JOIN item_group_definition igd ON igd.id = iga.group_id
         WHERE igd.price_list_id = $1`,
        [priceListId]
    );
    const assignedSet = new Set(assigned.map(function (a) { return a.ig_id; }));
    const newItems = erpItems.filter(function (it) { return !assignedSet.has(it.ig_id); });
    if (!newItems.length) return [];

    const groups = await dbPLM().any(
        'SELECT id, thickness_value FROM item_group_definition WHERE price_list_id = $1',
        [priceListId]
    );

    return newItems.map(function (it) {
        const detected = parseThickness(it.i_name);
        const suggested = detected !== null
            ? groups.find(function (g) { return Math.abs(parseFloat(g.thickness_value) - detected) < 0.01; })
            : null;
        return {
            ig_id:                it.ig_id,
            i_name:               it.i_name,
            i_weight:             parseFloat(it.i_weight) || 0,
            detected_thickness:   detected,
            suggested_group_id:   suggested ? suggested.id : null,
            suggested_thickness:  suggested ? parseFloat(suggested.thickness_value) : null,
        };
    });
}

async function confirmNewItemAssignment(priceListId, igId, groupId, userId) {
    const group = await dbPLM().oneOrNone(
        'SELECT id FROM item_group_definition WHERE id = $1 AND price_list_id = $2',
        [groupId, priceListId]
    );
    if (!group) throw new Error('Group tidak ditemukan');
    await dbPLM().none(
        `INSERT INTO item_group_assignment (group_id, ig_id, assigned_by)
         VALUES ($1, $2, $3) ON CONFLICT (group_id, ig_id) DO NOTHING`,
        [groupId, igId, userId]
    );
}

async function createGroup(priceListId, thicknessValue, userId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT cat_id FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) throw new Error('Pricelist tidak ditemukan');

    const existing = await dbPLM().oneOrNone(
        'SELECT id FROM item_group_definition WHERE price_list_id = $1 AND thickness_value = $2',
        [priceListId, thicknessValue]
    );
    if (existing) throw new Error('Group dengan tebal ini sudah ada');

    const max = await dbPLM().oneOrNone(
        `SELECT COALESCE(MAX(display_order), 0) AS max_order
         FROM item_group_definition WHERE price_list_id = $1`,
        [priceListId]
    );

    return dbPLM().one(
        `INSERT INTO item_group_definition
           (price_list_id, cat_id, thickness_value, thickness_label, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, thickness_value, thickness_label`,
        [priceListId, pl.cat_id, thicknessValue, thicknessValue + ' mm', max.max_order + 1]
    );
}

module.exports = {
    parseThickness,
    autoDetectGroups,
    isGroupingEnabled,
    listCategoryConfigs,
    enableGrouping,
    disableGrouping,
    previewInitGroups,
    applyInitGroups,
    getGroupsWithItems,
    moveItemToGroup,
    detectNewItems,
    confirmNewItemAssignment,
    createGroup,
};
