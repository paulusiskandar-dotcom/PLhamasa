const response   = require('../utils/response');
const registry   = require('../services/pdf-templates/registry');
const moment     = require('moment-timezone');
const $blacklist = require('../models/blacklist');

const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

// pr_id → price-type code (actual ERP mapping)
const PR_CODE = { 1: 'cash_pabrik', 2: 'cash_gudang', 3: 'kredit_pabrik', 4: 'kredit_gudang' };

// ── GET /pdf-template/list[?cat_id=X] ────────────────────────────────────────
module.exports._list = async function (req, res) {
    try {
        const catId = req.query.cat_id || null;
        const list = catId ? await registry.listByCategory(catId) : await registry.list();
        return response.success(res, list);
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── GET /pdf-template/:key/items[?cat_id=X] ──────────────────────────────────
module.exports._getTemplateItems = async function (req, res) {
    try {
        const tpl = registry.get(req.params.key);
        if (!tpl) return response.error(res, 'template_not_found', null, 404);

        // cat_id can come from query param or be resolved from template cat_name
        let catId = req.query.cat_id || null;
        if (!catId) catId = await registry.getCatId(req.params.key);
        if (!catId) return response.error(res, 'cat_id_required', null, 400);

        const items = await dbERP().any(
            `SELECT ig_id, i_name, i_weight, un_name
             FROM item
             WHERE cat_id = $1 AND deleted_at IS NULL AND is_item = true
             ORDER BY i_name ASC`,
            [catId]
        );

        const igIds = items.map(function (i) { return i.ig_id; });
        const values = igIds.length ? await dbPLM().any(
            `SELECT ig_id, field_key, value
             FROM pdf_template_field_value
             WHERE template_key = $1 AND ig_id = ANY($2::int[])`,
            [req.params.key, igIds]
        ) : [];

        const valueMap = {};
        values.forEach(function (v) {
            if (!valueMap[v.ig_id]) valueMap[v.ig_id] = {};
            valueMap[v.ig_id][v.field_key] = v.value;
        });

        // Use enriched meta (with resolved cat_id)
        const enrichedTpl = (await registry.list()).find(function (t) { return t.key === req.params.key; });

        return response.success(res, {
            template: enrichedTpl || tpl.meta,
            items: items.map(function (it) {
                return {
                    ig_id:         it.ig_id,
                    name:          it.i_name,
                    weight:        it.i_weight,
                    un_name:       it.un_name,
                    custom_values: valueMap[it.ig_id] || {},
                };
            }),
        });
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /pdf-template/:key/value ─────────────────────────────────────────────
module.exports._setValue = async function (req, res) {
    try {
        const { ig_id, field_key, value } = req.body;
        const userId = res.locals.user.id;

        await dbPLM().none(
            `INSERT INTO pdf_template_field_value
                (template_key, ig_id, field_key, value, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (template_key, ig_id, field_key)
             DO UPDATE SET value = EXCLUDED.value,
                           updated_by = EXCLUDED.updated_by,
                           updated_at = NOW()`,
            [req.params.key, ig_id, field_key, value || null, userId]
        );

        return response.success(res, { ok: true });
    } catch (err) {
        return response.error(res, null, err);
    }
};

// ── POST /pdf-template/:key/render ───────────────────────────────────────────
module.exports._render = async function (req, res) {
    try {
        const tpl = registry.get(req.params.key);
        if (!tpl) return response.error(res, 'template_not_found', null, 404);

        const plId = parseInt(req.body.price_list_id, 10);
        if (isNaN(plId)) return response.error(res, 'price_list_id_required', null, 400);

        const pl = await dbPLM().oneOrNone(
            'SELECT id, cat_id, cat_name, status FROM price_list WHERE id = $1', [plId]
        );
        if (!pl) return response.error(res, 'pl_not_found', null, 404);

        const plmPrices = await dbPLM().any(
            'SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1', [plId]
        );

        let igIds = [...new Set(plmPrices.map(function (p) { return p.ig_id; }))];

        // Exclude blacklisted items (only for OPEN records)
        if (pl.status !== 'PUBLISHED') {
            const blacklistedIds = await $blacklist.getBlacklistedIds();
            if (blacklistedIds.length) {
                igIds = igIds.filter(function (id) { return !blacklistedIds.includes(id); });
            }
        }
        const erpItems = igIds.length ? await dbERP().any(
            `SELECT ig_id, i_name, i_weight, un_name
             FROM item WHERE ig_id = ANY($1::int[])
             AND deleted_at IS NULL AND is_item = true`,
            [igIds]
        ) : [];

        const priceIndex = {};
        plmPrices.forEach(function (p) {
            if (!priceIndex[p.ig_id]) priceIndex[p.ig_id] = {};
            const code = PR_CODE[p.pr_id];
            if (code) priceIndex[p.ig_id][code] = { current: parseFloat(p.i_price) };
        });

        const items = erpItems.map(function (it) {
            return {
                ig_id:  it.ig_id,
                name:   it.i_name,
                weight: parseFloat(it.i_weight) || 0,
                un_name: it.un_name,
                prices: priceIndex[it.ig_id] || {},
            };
        });

        const customRows = igIds.length ? await dbPLM().any(
            `SELECT ig_id, field_key, value
             FROM pdf_template_field_value
             WHERE template_key = $1 AND ig_id = ANY($2::int[])`,
            [req.params.key, igIds]
        ) : [];

        const customValues = {};
        customRows.forEach(function (r) {
            if (!customValues[r.ig_id]) customValues[r.ig_id] = {};
            customValues[r.ig_id][r.field_key] = r.value;
        });

        const buffer = await tpl.render({ items, customValues });

        const slug = tpl.meta.name.replace(/[^A-Za-z0-9]+/g, '_');
        const filename = slug + '_' + moment().tz('Asia/Jakarta').format('YYYYMMDD_HHmmss') + '.pdf';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        res.send(buffer);
    } catch (err) {
        return response.error(res, null, err);
    }
};
