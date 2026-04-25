/*
 * priceList.js — Price List V2 controller
 * Routes: /price-list/*
 */

const response        = require('../utils/response');
const $model          = require('../models/priceList');
const $itemModel      = require('../models/item');
const $erpTargetModel = require('../models/erpTarget');

// Round ERP baseline per-kg price (same as existing roundERP in price.js)
function roundERP(raw) {
    const r = Math.round(raw) % 100;
    return r <= 49
        ? Math.floor(raw / 100) * 100
        : Math.ceil(raw / 100) * 100;
}

// ── GET /price-list[?cat_id=] ─────────────────────────────────────────────────

module.exports._list = async function (req, res) {
    try {
        const catId = req.query.cat_id || null;
        const userId = res.locals.user.id;
        const list = await $model.listAll(catId, userId);
        return response.success(res, list);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /price-list/:id ───────────────────────────────────────────────────────

module.exports._getById = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;
        const pl = await $model.getById(id, userId);
        if (!pl) return response.error(res, 'not_found', null, 404);
        return response.success(res, pl);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/start ────────────────────────────────────────────────────
// Body: { cat_id, based_on_id? }
// If based_on_id provided: copy from that price list.
// Otherwise: build baseline from ERP current prices.

module.exports._start = async function (req, res) {
    try {
        const { cat_id, based_on_id } = req.body;
        if (!cat_id) return response.error(res, 'cat_id required', null, 400);

        const userId = res.locals.user.id;

        // Check no existing OPEN for this category
        const existing = await $model.getOpenForCategory(cat_id);
        if (existing) {
            return response.error(res, 'open_already_exists', { id: existing.id }, 409);
        }

        let result;

        if (based_on_id) {
            // Create from existing price list
            const basedOnId = parseInt(based_on_id, 10);
            if (isNaN(basedOnId)) return response.error(res, 'invalid_based_on_id', null, 400);
            result = await $model.createOpenFromBasedOn(basedOnId, userId);
        } else {
            // Build from ERP baseline
            // 1. Get items for this category from ERP
            const erpItems = await $itemModel.getItemByQuery({ cat_id });
            if (!erpItems.length) {
                return response.error(res, 'no_erp_items_for_category', null, 422);
            }

            const catName = erpItems[0].cat_name || cat_id;
            const ig_ids = erpItems.map(r => r.ig_id);

            // Build weight map
            const weightMap = {};
            erpItems.forEach(r => { weightMap[r.ig_id] = parseFloat(r.i_weight) || 0; });

            // 2. Get ERP prices (unit prices) for these items
            const erpPrices = await $itemModel.getItemPriceERP(ig_ids);

            // Build price map: { ig_id: { pr_id: unit_price } }
            const erpPriceMap = {};
            erpPrices.forEach(r => {
                if (!erpPriceMap[r.ig_id]) erpPriceMap[r.ig_id] = {};
                erpPriceMap[r.ig_id][r.pr_id] = parseFloat(r.i_price);
            });

            // 3. Build baseline items: convert unit_price → per_kg
            const baselineItems = [];
            for (const item of erpItems) {
                const weight = weightMap[item.ig_id];
                if (weight <= 0) continue;

                const itemPrices = erpPriceMap[item.ig_id] || {};
                for (const [prIdStr, unitPrice] of Object.entries(itemPrices)) {
                    const prId = parseInt(prIdStr, 10);
                    if (unitPrice > 0) {
                        const perKg = roundERP(unitPrice / weight);
                        baselineItems.push({ ig_id: item.ig_id, pr_id: prId, i_price: perKg });
                    }
                }
            }

            result = await $model.createOpenFromBaseline(cat_id, catName, userId, baselineItems);
        }

        return response.success(res, result, 'Price list started');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/:id/lock ─────────────────────────────────────────────────

module.exports._lock = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;
        const result = await $model.acquireLock(id, userId);
        if (!result.success) {
            const code = result.error === 'not_found' ? 404 : 409;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/:id/heartbeat ────────────────────────────────────────────

module.exports._heartbeat = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;
        const result = await $model.heartbeat(id, userId);
        if (!result.success) {
            const code = result.error === 'not_found' ? 404 : 409;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/:id/release-lock ─────────────────────────────────────────

module.exports._releaseLock = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;
        const result = await $model.releaseLock(id, userId);
        if (!result.success) {
            const code = result.error === 'not_found' ? 404 : 403;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/:id/take-over ───────────────────────────────────────────
// Force-acquire lock regardless of who holds it (admin/superadmin).

module.exports._takeover = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;
        const role = res.locals.user.role;

        if (role !== 'admin' && role !== 'superadmin') {
            return response.error(res, 'Forbidden — admin or superadmin only', null, 403);
        }

        // Force-clear lock first, then acquire
        const pl = await global.dbPLM.oneOrNone('SELECT id FROM price_list WHERE id=$1', [id]);
        if (!pl) return response.error(res, 'not_found', null, 404);

        await global.dbPLM.none(
            'UPDATE price_list SET locked_by=NULL, locked_at=NULL, locked_heartbeat=NULL WHERE id=$1',
            [id]
        );

        const result = await $model.acquireLock(id, userId);
        if (!result.success) {
            return response.error(res, result.error, null, 409);
        }
        return response.success(res, result, 'Lock taken over');
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── PUT /price-list/:id/item ──────────────────────────────────────────────────
// Body: { ig_id, pr_id, new_price }

module.exports._updateItem = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { ig_id, pr_id, new_price } = req.body;
        if (ig_id == null || pr_id == null || new_price == null) {
            return response.error(res, 'ig_id, pr_id, new_price required', null, 400);
        }
        const userId = res.locals.user.id;
        const result = await $model.updateItemPrice(id, parseInt(ig_id), parseInt(pr_id), parseFloat(new_price), userId);
        if (!result.success) {
            const code = result.error === 'not_found' ? 404 : result.error === 'lock_required' ? 403 : 409;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── PUT /price-list/:id/items/bulk ────────────────────────────────────────────
// Body: { items: [{ ig_id, pr_id, new_price }] }

module.exports._bulkUpdate = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const { items } = req.body;
        if (!items || !Array.isArray(items) || !items.length) {
            return response.error(res, 'items array required', null, 400);
        }
        const userId = res.locals.user.id;
        const result = await $model.bulkUpdateItemPrices(id, items, userId);
        if (!result.success) {
            const code = result.error === 'not_found' ? 404 : result.error === 'lock_required' ? 403 : 409;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /price-list/:id/log ───────────────────────────────────────────────────

module.exports._getLog = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const limit  = Math.min(parseInt(req.query.limit,  10) || 100, 500);
        const offset = parseInt(req.query.offset, 10) || 0;
        const log = await $model.getLog(id, limit, offset);
        return response.success(res, log);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /price-list/:id/post-to-erp ─────────────────────────────────────────
// Body: { erp_target_id? } — if omitted, uses active target

module.exports._postToErp = async function (req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return response.error(res, 'invalid_id', null, 400);
        const userId = res.locals.user.id;

        let erpTargetId = req.body.erp_target_id;
        if (!erpTargetId) {
            const active = await $erpTargetModel.getActive();
            if (!active) return response.error(res, 'no_active_erp_target', null, 422);
            erpTargetId = active.id;
        }

        const result = await $model.postToErp(id, userId, parseInt(erpTargetId, 10));
        if (!result.success) {
            const code = result.error === 'not_found' ? 404
                : result.error === 'lock_required' ? 403
                : result.error === 'not_open' ? 409
                : 422;
            return response.error(res, result.error, null, code);
        }
        return response.success(res, result, 'Posted to ERP');
    } catch (err) {
        return response.error(res, null, err);
    }
};
