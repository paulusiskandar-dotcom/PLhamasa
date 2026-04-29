/*
 * groupService.js — Grouping system for Plat/Coil categories
 */

const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

function roundSpecial(raw) {
    if (!raw || raw <= 0) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 49 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

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
            // Seed default group prices from first item's existing prices
            if (g.items.length > 0) {
                const firstIgId = g.items[0];
                const existingPrices = await t.any(
                    'SELECT pr_id, i_price FROM price_list_item WHERE price_list_id = $1 AND ig_id = $2',
                    [priceListId, firstIgId]
                );
                if (existingPrices.length > 0) {
                    const prMap = {};
                    existingPrices.forEach(function (p) { prMap[Number(p.pr_id)] = parseFloat(p.i_price) || 0; });
                    await t.none(
                        `UPDATE item_group_definition
                         SET cash_pabrik_kg = $2, cash_gudang_kg = $3,
                             kredit_pabrik_kg = $4, kredit_gudang_kg = $5
                         WHERE id = $1`,
                        [def.id, prMap[1] || 0, prMap[2] || 0, prMap[3] || 0, prMap[4] || 0]
                    );
                }
            }
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
        `SELECT id, thickness_value, thickness_label, display_order,
                cash_gudang_kg, cash_pabrik_kg, kredit_gudang_kg, kredit_pabrik_kg
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
        const cgKg = parseFloat(g.cash_gudang_kg)   || 0;
        const cpKg = parseFloat(g.cash_pabrik_kg)   || 0;
        const kgKg = parseFloat(g.kredit_gudang_kg) || 0;
        const kpKg = parseFloat(g.kredit_pabrik_kg) || 0;

        const items = assignments
            .filter(function (a) { return a.group_id === g.id; })
            .map(function (a) {
                const it     = itemMap[a.ig_id] || {};
                const weight = parseFloat(it.i_weight) || 0;
                return {
                    ig_id:             a.ig_id,
                    i_name:            it.i_name  || ('Item ' + a.ig_id),
                    i_weight:          weight,
                    un_name:           it.un_name || '',
                    cash_gudang_lbr:   roundSpecial(cgKg * weight),
                    cash_pabrik_lbr:   roundSpecial(cpKg * weight),
                    kredit_gudang_lbr: roundSpecial(kgKg * weight),
                    kredit_pabrik_lbr: roundSpecial(kpKg * weight),
                };
            })
            .sort(function (a, b) { return a.i_weight - b.i_weight; });

        return {
            id:               g.id,
            thickness_value:  parseFloat(g.thickness_value),
            thickness_label:  g.thickness_label,
            display_order:    g.display_order,
            cash_gudang_kg:   cgKg,
            cash_pabrik_kg:   cpKg,
            kredit_gudang_kg: kgKg,
            kredit_pabrik_kg: kpKg,
            items:            items,
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

async function updateGroupPrice(groupId, prices, userId) {
    return dbPLM().tx(async function (t) {
        const group = await t.oneOrNone(
            'SELECT id, price_list_id, cat_id FROM item_group_definition WHERE id = $1',
            [groupId]
        );
        if (!group) throw new Error('Group tidak ditemukan');

        const fields = ['cash_gudang_kg', 'cash_pabrik_kg', 'kredit_gudang_kg', 'kredit_pabrik_kg'];
        const updates = [];
        const vals    = [groupId, userId];
        let idx = 3;
        fields.forEach(function (key) {
            if (prices[key] !== undefined) {
                updates.push(key + ' = $' + idx++);
                vals.push(parseFloat(prices[key]) || 0);
            }
        });
        if (!updates.length) return { ok: true, cascaded: 0 };

        await t.none(
            'UPDATE item_group_definition SET ' + updates.join(', ') +
            ', last_modified_by = $2, last_modified_at = NOW() WHERE id = $1',
            vals
        );

        const assignments = await t.any(
            'SELECT ig_id FROM item_group_assignment WHERE group_id = $1',
            [groupId]
        );
        if (!assignments.length) return { ok: true, cascaded: 0 };

        const igIds = assignments.map(function (a) { return a.ig_id; });
        const erpItems = await dbERP().any(
            'SELECT ig_id, i_weight FROM item WHERE ig_id = ANY($1) AND deleted_at IS NULL',
            [igIds]
        );
        const weightMap = {};
        erpItems.forEach(function (it) { weightMap[it.ig_id] = parseFloat(it.i_weight) || 0; });

        const groupNow = await t.one(
            'SELECT cash_gudang_kg, cash_pabrik_kg, kredit_gudang_kg, kredit_pabrik_kg FROM item_group_definition WHERE id = $1',
            [groupId]
        );

        // pr_id: 1=cash_pabrik, 2=cash_gudang, 3=kredit_pabrik, 4=kredit_gudang
        const prPriceMap = [
            [1, parseFloat(groupNow.cash_pabrik_kg)   || 0],
            [2, parseFloat(groupNow.cash_gudang_kg)   || 0],
            [3, parseFloat(groupNow.kredit_pabrik_kg) || 0],
            [4, parseFloat(groupNow.kredit_gudang_kg) || 0],
        ];

        let cascaded = 0;
        for (const igId of igIds) {
            for (const pair of prPriceMap) {
                const prId    = pair[0];
                const priceKg = pair[1];
                await t.none(
                    `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by, updated_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())
                     ON CONFLICT (price_list_id, ig_id, pr_id) DO UPDATE SET
                       i_price = EXCLUDED.i_price, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
                    [group.price_list_id, igId, prId, priceKg, userId]
                );
                cascaded++;
            }
        }
        return { ok: true, cascaded, group_id: groupId };
    });
}

async function detectChanges(priceListId) {
    const pl = await dbPLM().oneOrNone(
        'SELECT cat_id FROM price_list WHERE id = $1',
        [priceListId]
    );
    if (!pl) return { new_items: [], removed_items: [], available_groups: [] };

    const erpItems = await dbERP().any(
        `SELECT ig_id, i_name, i_weight FROM item
         WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true`,
        [pl.cat_id]
    );
    const erpIdSet = new Set(erpItems.map(function (it) { return it.ig_id; }));

    const assigned = await dbPLM().any(
        `SELECT iga.ig_id, iga.group_id, igd.thickness_label
         FROM item_group_assignment iga
         JOIN item_group_definition igd ON igd.id = iga.group_id
         WHERE igd.price_list_id = $1`,
        [priceListId]
    );
    const assignedSet = new Set(assigned.map(function (a) { return a.ig_id; }));

    const newItems = erpItems.filter(function (it) { return !assignedSet.has(it.ig_id); });
    const removedItems = assigned.filter(function (a) { return !erpIdSet.has(a.ig_id); });

    const groups = await dbPLM().any(
        `SELECT id, thickness_value, thickness_label FROM item_group_definition
         WHERE price_list_id = $1 ORDER BY thickness_value`,
        [priceListId]
    );

    const newItemsEnriched = newItems.map(function (it) {
        const detected = parseThickness(it.i_name);
        const suggested = detected !== null
            ? groups.find(function (g) { return Math.abs(parseFloat(g.thickness_value) - detected) < 0.01; })
            : null;
        return {
            ig_id:               it.ig_id,
            i_name:              it.i_name,
            i_weight:            parseFloat(it.i_weight) || 0,
            detected_thickness:  detected,
            suggested_group_id:  suggested ? suggested.id : null,
            suggested_thickness: suggested ? parseFloat(suggested.thickness_value) : null,
            suggested_label:     suggested ? suggested.thickness_label : null,
            can_create_group:    detected !== null && !suggested,
        };
    });

    const removedItemsEnriched = removedItems.map(function (r) {
        return {
            ig_id:           r.ig_id,
            group_id:        r.group_id,
            thickness_label: r.thickness_label,
            i_name:          '(item ' + r.ig_id + ' — sudah dihapus dari ERP)',
        };
    });

    return {
        new_items:       newItemsEnriched,
        removed_items:   removedItemsEnriched,
        available_groups: groups.map(function (g) {
            return { id: g.id, thickness_value: parseFloat(g.thickness_value), thickness_label: g.thickness_label };
        }),
    };
}

async function confirmNewItemsBatch(priceListId, assignments, userId) {
    return dbPLM().tx(async function (t) {
        let assignedCount = 0;
        let createdGroups = 0;

        for (const a of assignments) {
            let groupId = a.group_id;

            if (!groupId && a.create_new_thickness) {
                const pl = await t.one('SELECT cat_id FROM price_list WHERE id = $1', [priceListId]);
                const existing = await t.oneOrNone(
                    'SELECT id FROM item_group_definition WHERE price_list_id = $1 AND thickness_value = $2',
                    [priceListId, a.create_new_thickness]
                );
                if (existing) {
                    groupId = existing.id;
                } else {
                    const max = await t.oneOrNone(
                        'SELECT COALESCE(MAX(display_order), 0) AS max_order FROM item_group_definition WHERE price_list_id = $1',
                        [priceListId]
                    );
                    const newGroup = await t.one(
                        `INSERT INTO item_group_definition
                           (price_list_id, cat_id, thickness_value, thickness_label, display_order)
                         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [priceListId, pl.cat_id, a.create_new_thickness, a.create_new_thickness + ' mm', max.max_order + 1]
                    );
                    groupId = newGroup.id;
                    createdGroups++;
                }
            }

            if (groupId) {
                await t.none(
                    `INSERT INTO item_group_assignment (group_id, ig_id, assigned_by)
                     VALUES ($1, $2, $3) ON CONFLICT (group_id, ig_id) DO NOTHING`,
                    [groupId, a.ig_id, userId]
                );
                assignedCount++;
            }
        }

        return { ok: true, assigned_count: assignedCount, created_groups: createdGroups };
    });
}

async function validatePostReadiness(priceListId) {
    const changes = await detectChanges(priceListId);
    const blockers = [];
    const warnings = [];

    if (changes.new_items.length > 0) {
        blockers.push({
            type:     'unassigned_items',
            severity: 'block',
            count:    changes.new_items.length,
            message:  changes.new_items.length + ' item baru belum di-assign group',
        });
    }

    const zeroGroups = await dbPLM().any(
        `SELECT id, thickness_label FROM item_group_definition
         WHERE price_list_id = $1 AND cash_gudang_kg = 0 AND kredit_gudang_kg = 0`,
        [priceListId]
    );
    if (zeroGroups.length > 0) {
        warnings.push({
            type:     'zero_price_groups',
            severity: 'warn',
            count:    zeroGroups.length,
            groups:   zeroGroups.map(function (g) { return g.thickness_label; }),
            message:  zeroGroups.length + ' group masih harga 0',
        });
    }

    const emptyGroups = await dbPLM().any(
        `SELECT igd.id, igd.thickness_label FROM item_group_definition igd
         LEFT JOIN item_group_assignment iga ON iga.group_id = igd.id
         WHERE igd.price_list_id = $1
         GROUP BY igd.id, igd.thickness_label HAVING COUNT(iga.id) = 0`,
        [priceListId]
    );
    if (emptyGroups.length > 0) {
        warnings.push({
            type:     'empty_groups',
            severity: 'info',
            count:    emptyGroups.length,
            groups:   emptyGroups.map(function (g) { return g.thickness_label; }),
            message:  emptyGroups.length + ' group kosong (tidak ada item)',
        });
    }

    return {
        can_post:             blockers.length === 0,
        blockers,
        warnings,
        new_items_count:      changes.new_items.length,
        removed_items_count:  changes.removed_items.length,
    };
}

async function deleteEmptyGroup(groupId) {
    return dbPLM().tx(async function (t) {
        const cnt = await t.one(
            'SELECT COUNT(*) AS c FROM item_group_assignment WHERE group_id = $1',
            [groupId]
        );
        if (parseInt(cnt.c) > 0) throw new Error('Group tidak kosong, tidak bisa dihapus');
        await t.none('DELETE FROM item_group_definition WHERE id = $1', [groupId]);
    });
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
    updateGroupPrice,
    detectChanges,
    confirmNewItemsBatch,
    validatePostReadiness,
    deleteEmptyGroup,
};
