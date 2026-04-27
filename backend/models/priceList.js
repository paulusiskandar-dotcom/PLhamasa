/*
 * priceList.js — PLhamasa price_list model
 * All queries use global.dbPLM (PLhamasa DB) or global.dbERP (ERP read-only).
 */

const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

function roundSpecial(raw) {
    const sisa = Math.round(raw) % 100;
    return sisa <= 49
        ? Math.floor(raw / 100) * 100
        : Math.ceil(raw / 100) * 100;
}

// ── Auto-sync new ERP items into an OPEN price list ───────────────────────────

module.exports.syncItemsFromErp = async function (plId, validPrIds) {
    // validPrIds: [2,4] for Standard or [1,2,3,4] for Extended

    // 1. Get already-present ig_ids
    const existingRows = await dbPLM().any(
        'SELECT DISTINCT ig_id FROM price_list_item WHERE price_list_id = $1', [plId]
    );
    const existingIds = existingRows.map(function (r) { return r.ig_id; });

    // 2. Get blacklisted ig_ids
    const blRows = await dbPLM().any('SELECT ig_id FROM item_blacklist');
    const blIds  = blRows.map(function (r) { return r.ig_id; });

    // 3. Get cat_id for this price list
    const pl = await dbPLM().oneOrNone('SELECT cat_id FROM price_list WHERE id = $1', [plId]);
    if (!pl) return { synced: 0, items: [] };

    // 4. Find new items in ERP not yet in the price list and not blacklisted
    const exclude = [...new Set([...existingIds, ...blIds])];
    let q = `
        SELECT i.ig_id, i.i_name, i.i_weight
        FROM item i
        WHERE i.cat_id = $1 AND i.deleted_at IS NULL AND i.is_item = true
    `;
    const params = [pl.cat_id];
    if (exclude.length) {
        params.push(exclude);
        q += ` AND i.ig_id != ALL($${params.length}::int[])`;
    }
    q += ' ORDER BY i.i_name ASC';

    const newItems = await dbERP().any(q, params);
    if (!newItems.length) return { synced: 0, items: [] };

    // 5. Get ERP unit prices for new items
    const newIgIds = newItems.map(function (i) { return i.ig_id; });
    const erpPrices = await dbERP().any(
        'SELECT ig_id, pr_id, i_price FROM item_price WHERE ig_id = ANY($1::int[])',
        [newIgIds]
    );

    // 6. Insert per-kg prices for each new item × each pr_id
    for (const item of newItems) {
        const weight = parseFloat(item.i_weight) || 0;
        for (const prId of validPrIds) {
            const ep = erpPrices.find(function (r) { return r.ig_id === item.ig_id && r.pr_id === prId; });
            const unitPrice = ep ? parseFloat(ep.i_price) : 0;
            const perKg = (weight > 0 && unitPrice > 0) ? roundSpecial(unitPrice / weight) : 0;
            await dbPLM().none(
                `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (price_list_id, ig_id, pr_id) DO NOTHING`,
                [plId, item.ig_id, prId, perKg]
            );
        }
    }

    return {
        synced: newItems.length,
        items:  newItems.map(function (i) { return { ig_id: i.ig_id, i_name: i.i_name }; }),
    };
};

// ── List ──────────────────────────────────────────────────────────────────────

module.exports.listAll = async function (catId, currentUserId) {
    const params = [];
    let whereClause = '';
    if (catId != null) {
        params.push(catId);
        whereClause = 'WHERE pl.cat_id = $1';
    }

    const rows = await dbPLM().any(`
        SELECT pl.*,
               uc.username AS created_by_name,
               up.username AS posted_by_name,
               ul.username AS locked_by_name,
               (SELECT COUNT(*) FROM price_list_item pli WHERE pli.price_list_id = pl.id) AS item_count,
               (SELECT MAX(logged_at) FROM price_list_log pll WHERE pll.price_list_id = pl.id) AS last_log_at
        FROM price_list pl
        LEFT JOIN users uc ON uc.id = pl.created_by
        LEFT JOIN users up ON up.id = pl.posted_by
        LEFT JOIN users ul ON ul.id = pl.locked_by
        ${whereClause}
        ORDER BY pl.cat_name ASC, pl.status ASC, pl.revision_no DESC
    `, params);

    const now = new Date();
    return rows.map(r => {
        let locked_status = null;
        if (r.locked_by != null) {
            if (r.locked_by === currentUserId) {
                locked_status = 'mine';
            } else if (r.locked_heartbeat) {
                const diffMs = now - new Date(r.locked_heartbeat);
                locked_status = diffMs < 5 * 60 * 1000 ? 'other_active' : 'other_idle';
            } else {
                locked_status = 'other_idle';
            }
        }
        return { ...r, locked_status };
    });
};

// ── Get by ID ─────────────────────────────────────────────────────────────────

module.exports.getById = async function (id, currentUserId) {
    const pl = await dbPLM().oneOrNone(`
        SELECT pl.*,
               uc.username AS created_by_name,
               up.username AS posted_by_name,
               ul.username AS locked_by_name
        FROM price_list pl
        LEFT JOIN users uc ON uc.id = pl.created_by
        LEFT JOIN users up ON up.id = pl.posted_by
        LEFT JOIN users ul ON ul.id = pl.locked_by
        WHERE pl.id = $1
    `, [id]);
    if (!pl) return null;

    const items = await dbPLM().any(
        'SELECT ig_id, pr_id, i_price, updated_by, updated_at FROM price_list_item WHERE price_list_id = $1 ORDER BY ig_id, pr_id',
        [id]
    );

    const now = new Date();
    let locked_status = null;
    if (pl.locked_by != null) {
        if (pl.locked_by === currentUserId) {
            locked_status = 'mine';
        } else if (pl.locked_heartbeat) {
            const diffMs = now - new Date(pl.locked_heartbeat);
            locked_status = diffMs < 5 * 60 * 1000 ? 'other_active' : 'other_idle';
        } else {
            locked_status = 'other_idle';
        }
    }
    return { ...pl, items, locked_status };
};

// ── Open for category ─────────────────────────────────────────────────────────

module.exports.getOpenForCategory = function (catId) {
    return dbPLM().oneOrNone(
        "SELECT * FROM price_list WHERE cat_id = $1 AND status = 'OPEN'",
        [catId]
    );
};

// ── Revision helpers ──────────────────────────────────────────────────────────

module.exports.getNextRevisionNo = async function (catId) {
    const r = await dbPLM().oneOrNone(
        'SELECT MAX(revision_no) AS max_rev FROM price_list WHERE cat_id = $1',
        [catId]
    );
    return (r && r.max_rev != null) ? parseInt(r.max_rev) + 1 : 1;
};

// ── Create from baseline ──────────────────────────────────────────────────────

module.exports.createOpenFromBaseline = async function (catId, catName, userId, baselineItems) {
    return dbPLM().tx(async t => {
        const revNo = await module.exports.getNextRevisionNo(catId);
        const pl = await t.one(
            `INSERT INTO price_list (cat_id, cat_name, revision_no, status, created_by)
             VALUES ($1, $2, $3, 'OPEN', $4) RETURNING *`,
            [catId, catName, revNo, userId]
        );
        if (baselineItems && baselineItems.length) {
            for (const item of baselineItems) {
                await t.none(
                    `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [pl.id, item.ig_id, item.pr_id, item.i_price, userId]
                );
            }
        }
        const items = await t.any('SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1', [pl.id]);
        return { ...pl, items };
    });
};

// ── Create from based-on ──────────────────────────────────────────────────────

module.exports.createOpenFromBasedOn = async function (basedOnId, userId, excludeIgIds) {
    const excludeSet = new Set(excludeIgIds || []);
    return dbPLM().tx(async t => {
        const source = await t.one('SELECT * FROM price_list WHERE id = $1', [basedOnId]);
        const revNo = await module.exports.getNextRevisionNo(source.cat_id);
        const pl = await t.one(
            `INSERT INTO price_list (cat_id, cat_name, revision_no, status, created_by, based_on_id)
             VALUES ($1, $2, $3, 'OPEN', $4, $5) RETURNING *`,
            [source.cat_id, source.cat_name, revNo, userId, basedOnId]
        );
        const sourceItems = await t.any('SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1', [basedOnId]);
        for (const item of sourceItems) {
            if (excludeSet.has(item.ig_id)) continue;
            await t.none(
                `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by)
                 VALUES ($1, $2, $3, $4, $5)`,
                [pl.id, item.ig_id, item.pr_id, item.i_price, userId]
            );
        }
        const items = await t.any('SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1', [pl.id]);
        return { ...pl, items };
    });
};

// ── Lock management ───────────────────────────────────────────────────────────

module.exports.acquireLock = async function (plId, userId) {
    const pl = await dbPLM().oneOrNone('SELECT * FROM price_list WHERE id = $1', [plId]);
    if (!pl) return { success: false, error: 'not_found' };

    const now = new Date();
    const canAcquire = (
        pl.locked_by == null ||
        pl.locked_by === userId ||
        !pl.locked_heartbeat ||
        (now - new Date(pl.locked_heartbeat)) >= 5 * 60 * 1000
    );
    if (!canAcquire) return { success: false, error: 'locked_by_other' };

    await dbPLM().none(
        'UPDATE price_list SET locked_by=$1, locked_at=NOW(), locked_heartbeat=NOW() WHERE id=$2',
        [userId, plId]
    );
    const updated = await dbPLM().one(
        'SELECT pl.locked_by, u.username AS locked_by_name FROM price_list pl LEFT JOIN users u ON u.id = pl.locked_by WHERE pl.id = $1',
        [plId]
    );
    return { success: true, locked_by: updated.locked_by, locked_by_name: updated.locked_by_name };
};

module.exports.releaseLock = async function (plId, userId) {
    const pl = await dbPLM().oneOrNone('SELECT locked_by FROM price_list WHERE id = $1', [plId]);
    if (!pl) return { success: false, error: 'not_found' };
    if (pl.locked_by !== userId) return { success: false, error: 'not_your_lock' };
    await dbPLM().none(
        'UPDATE price_list SET locked_by=NULL, locked_at=NULL, locked_heartbeat=NULL WHERE id=$1',
        [plId]
    );
    return { success: true };
};

module.exports.heartbeat = async function (plId, userId) {
    const pl = await dbPLM().oneOrNone('SELECT locked_by FROM price_list WHERE id = $1', [plId]);
    if (!pl) return { success: false, error: 'not_found' };
    if (pl.locked_by !== userId) return { success: false, error: 'lock_lost' };
    await dbPLM().none('UPDATE price_list SET locked_heartbeat=NOW() WHERE id=$1', [plId]);
    return { success: true };
};

// ── Item price updates ────────────────────────────────────────────────────────

module.exports.updateItemPrice = async function (plId, igId, prId, newPrice, userId) {
    return dbPLM().tx(async t => {
        const pl = await t.oneOrNone('SELECT status, locked_by FROM price_list WHERE id=$1', [plId]);
        if (!pl) return { success: false, error: 'not_found' };
        if (pl.status !== 'OPEN') return { success: false, error: 'not_open' };
        if (pl.locked_by !== userId) return { success: false, error: 'lock_required' };

        const existing = await t.oneOrNone('SELECT i_price FROM price_list_item WHERE price_list_id=$1 AND ig_id=$2 AND pr_id=$3', [plId, igId, prId]);
        const oldPrice = existing ? parseFloat(existing.i_price) : null;

        await t.none(
            `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by, updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW())
             ON CONFLICT (price_list_id, ig_id, pr_id) DO UPDATE SET i_price=EXCLUDED.i_price, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
            [plId, igId, prId, newPrice, userId]
        );

        const log = await t.one(
            `INSERT INTO price_list_log (price_list_id, ig_id, pr_id, old_price, new_price, user_id)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [plId, igId, prId, oldPrice, newPrice, userId]
        );

        await t.none('UPDATE price_list SET locked_heartbeat=NOW() WHERE id=$1', [plId]);
        return { success: true, log };
    });
};

module.exports.bulkUpdateItemPrices = async function (plId, items, userId) {
    return dbPLM().tx(async t => {
        const pl = await t.oneOrNone('SELECT status, locked_by FROM price_list WHERE id=$1', [plId]);
        if (!pl) return { success: false, error: 'not_found' };
        if (pl.status !== 'OPEN') return { success: false, error: 'not_open' };
        if (pl.locked_by !== userId) return { success: false, error: 'lock_required' };

        const logs = [];
        for (const item of items) {
            const existing = await t.oneOrNone('SELECT i_price FROM price_list_item WHERE price_list_id=$1 AND ig_id=$2 AND pr_id=$3', [plId, item.ig_id, item.pr_id]);
            const oldPrice = existing ? parseFloat(existing.i_price) : null;

            await t.none(
                `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by, updated_at)
                 VALUES ($1,$2,$3,$4,$5,NOW())
                 ON CONFLICT (price_list_id, ig_id, pr_id) DO UPDATE SET i_price=EXCLUDED.i_price, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
                [plId, item.ig_id, item.pr_id, item.new_price, userId]
            );

            const log = await t.one(
                `INSERT INTO price_list_log (price_list_id, ig_id, pr_id, old_price, new_price, user_id)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                [plId, item.ig_id, item.pr_id, oldPrice, item.new_price, userId]
            );
            logs.push(log.id);
        }

        await t.none('UPDATE price_list SET locked_heartbeat=NOW() WHERE id=$1', [plId]);
        return { success: true, updated_count: items.length, log_ids: logs };
    });
};

// ── Log ───────────────────────────────────────────────────────────────────────

module.exports.getLog = async function (plId, limit = 100, offset = 0) {
    const logs = await dbPLM().any(`
        SELECT pll.id, pll.logged_at, pll.ig_id, pll.pr_id,
               pll.old_price, pll.new_price,
               u.username AS user_name
        FROM price_list_log pll
        LEFT JOIN users u ON u.id = pll.user_id
        WHERE pll.price_list_id = $1
        ORDER BY pll.logged_at DESC
        LIMIT $2 OFFSET $3
    `, [plId, limit, offset]);

    if (!logs.length) return logs;

    const igIds = [...new Set(logs.map(l => l.ig_id))];
    const prIds = [...new Set(logs.map(l => l.pr_id))];

    const [erpItems, erpPrices] = await Promise.all([
        dbERP().any(
            'SELECT ig_id, i_name FROM item WHERE ig_id = ANY($1::int[]) AND deleted_at IS NULL',
            [igIds]
        ),
        dbERP().any(
            'SELECT pr_id, pr_code, pr_name FROM price WHERE pr_id = ANY($1::int[])',
            [prIds]
        ),
    ]);

    const itemMap = {};
    erpItems.forEach(r => { itemMap[r.ig_id] = r.i_name; });

    const prMap = {};
    erpPrices.forEach(p => {
        const label = (p.pr_name && p.pr_name.trim())
            ? p.pr_name.trim()
            : (p.pr_code || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        prMap[p.pr_id] = label;
    });

    return logs.map(l => ({
        ...l,
        i_name:   itemMap[l.ig_id] || ('IG#' + l.ig_id),
        pr_label: prMap[l.pr_id]   || ('PR#' + l.pr_id),
    }));
};

// ── Export audit log ──────────────────────────────────────────────────────────

module.exports.logExport = function (priceListId, exportType, fileName, filePath, userId) {
    return dbPLM().none(
        `INSERT INTO price_list_export (price_list_id, export_type, file_name, file_path, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [priceListId, exportType, fileName || null, filePath || null, userId]
    );
};

// ── Post to ERP ───────────────────────────────────────────────────────────────

module.exports.postToErp = async function (plId, userId, erpTargetId) {
    const { pgp } = require('../configs/database');

    // 1. Validate
    const pl = await dbPLM().oneOrNone('SELECT * FROM price_list WHERE id=$1', [plId]);
    if (!pl) return { success: false, error: 'not_found' };
    if (pl.status !== 'OPEN') return { success: false, error: 'not_open' };
    if (pl.locked_by !== userId) return { success: false, error: 'lock_required' };

    // 2. Get items (excluding blacklisted)
    const $blacklist = require('./blacklist');
    const blacklistedIds = await $blacklist.getBlacklistedIds();
    const allItems = await dbPLM().any('SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id=$1', [plId]);
    const items = blacklistedIds.length
        ? allItems.filter(function (i) { return !blacklistedIds.includes(i.ig_id); })
        : allItems;
    if (!items.length) return { success: false, error: 'no_items' };

    // 3. Get ERP target
    const erpTarget = await dbPLM().oneOrNone('SELECT * FROM erp_target WHERE id=$1', [erpTargetId]);
    if (!erpTarget) return { success: false, error: 'erp_target_not_found' };

    // 4. Get item weights from ERP for per-unit price calculation
    const ig_ids = [...new Set(items.map(i => i.ig_id))];
    const erpItems = await dbERP().any(
        'SELECT ig_id, i_weight FROM item WHERE ig_id = ANY($1::int[]) AND deleted_at IS NULL',
        [ig_ids]
    );
    const weightMap = {};
    erpItems.forEach(r => { weightMap[r.ig_id] = parseFloat(r.i_weight) || 0; });

    // 5. Connect to ERP target DB
    const pgpDynamic = pgp;
    const erpTargetDb = pgpDynamic({
        host: erpTarget.host,
        port: erpTarget.port,
        database: erpTarget.db_name,
        user: erpTarget.db_user,
        password: erpTarget.db_password,
        connectionTimeoutMillis: 10000,
    });

    try {
        // 6. Push to ERP target
        await erpTargetDb.tx(async t => {
            for (const item of items) {
                const weight = weightMap[item.ig_id] || 0;
                let finalPrice;
                if (weight > 0) {
                    finalPrice = roundSpecial(parseFloat(item.i_price) * weight);
                } else {
                    finalPrice = parseFloat(item.i_price);
                }
                await t.none(
                    `INSERT INTO item_price (ig_id, pr_id, i_price, updated_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (ig_id, pr_id) DO UPDATE SET i_price=EXCLUDED.i_price, updated_at=NOW()`,
                    [item.ig_id, item.pr_id, finalPrice]
                );
            }
        });

        // 7. PLM transaction: publish + create new OPEN
        const newOpen = await dbPLM().tx(async t => {
            await t.none(
                `UPDATE price_list SET status='PUBLISHED', posted_by=$1, posted_at=NOW(),
                 posted_to_erp_id=$2, locked_by=NULL, locked_at=NULL, locked_heartbeat=NULL
                 WHERE id=$3`,
                [userId, erpTargetId, plId]
            );

            const nextRevNo = await module.exports.getNextRevisionNo(pl.cat_id);
            const newPl = await t.one(
                `INSERT INTO price_list (cat_id, cat_name, revision_no, status, created_by, based_on_id)
                 VALUES ($1,$2,$3,'OPEN',$4,$5) RETURNING *`,
                [pl.cat_id, pl.cat_name, nextRevNo, userId, plId]
            );

            // Copy items to new OPEN
            for (const item of items) {
                await t.none(
                    `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [newPl.id, item.ig_id, item.pr_id, item.i_price, userId]
                );
            }
            return newPl;
        });

        return { success: true, posted_pl_id: plId, new_open_id: newOpen.id };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

module.exports._roundSpecial = roundSpecial;
