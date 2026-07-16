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

        const itemBrand   = tpl.meta && tpl.meta.item_brand ? tpl.meta.item_brand : null;
        const namePattern = tpl.meta && tpl.meta.item_name_like ? tpl.meta.item_name_like : null;
        let catCondition = "cat_id = $1";
        let catParam = catId;
        if (catId === 'HRC_HR') {
            catCondition = "cat_id = ANY($1::text[])";
            catParam = ['HRC', 'HR', 'HRNS'];
        } else if (catId === 'CRC_CR') {
            catCondition = "cat_id = ANY($1::text[])";
            catParam = ['CRC', 'CR', 'CRNS'];
        }

        const items = await dbERP().any(
            `SELECT ig_id, i_name, i_weight, un_name
             FROM item
             WHERE ${catCondition} AND deleted_at IS NULL AND is_item = true
               AND (i_group IS NULL OR i_group != 'N' OR cat_id IN ('HRC', 'CRC', 'HRNS', 'CRNS', 'HR', 'CR') OR $3::text IS NOT NULL)
               AND ($2::text IS NULL OR i_brand = $2)
               AND ($3::text IS NULL OR i_name ILIKE $3)
             ORDER BY i_name ASC`,
            [catParam, itemBrand, namePattern]
        );

        let filteredItems = items;
        if (tpl.filterItems && typeof tpl.filterItems === 'function') {
            filteredItems = items.filter(tpl.filterItems);
        }

        const igIds = filteredItems.map(function (i) { return i.ig_id; });
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
            items: filteredItems.map(function (it) {
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

        const blacklistedIds = await $blacklist.getBlacklistedIds();

        let allPlmPrices = [...plmPrices];
        if (pl.status !== 'PUBLISHED' && blacklistedIds.length) {
            allPlmPrices = allPlmPrices.filter(p => !blacklistedIds.includes(p.ig_id));
        }

        if (tpl.meta.linked_categories && Array.isArray(tpl.meta.linked_categories)) {
            for (const linkCat of tpl.meta.linked_categories) {
                let linkPl = await dbPLM().oneOrNone(
                    `SELECT id, status FROM price_list WHERE cat_name = $1 AND status = 'OPEN' ORDER BY id DESC LIMIT 1`, [linkCat]
                );
                if (!linkPl) {
                    linkPl = await dbPLM().oneOrNone(
                        `SELECT id, status FROM price_list WHERE cat_name = $1 AND status = 'PUBLISHED' ORDER BY posted_at DESC NULLS LAST LIMIT 1`, [linkCat]
                    );
                }
                if (linkPl) {
                    let linkPrices = await dbPLM().any(
                        'SELECT ig_id, pr_id, i_price FROM price_list_item WHERE price_list_id = $1', [linkPl.id]
                    );
                    if (linkPl.status !== 'PUBLISHED' && blacklistedIds.length) {
                        linkPrices = linkPrices.filter(p => !blacklistedIds.includes(p.ig_id));
                    }
                    allPlmPrices = allPlmPrices.concat(linkPrices);
                }
            }
        }

        const namePattern = tpl.meta && tpl.meta.item_name_like ? tpl.meta.item_name_like : null;
        let igIds = [...new Set(allPlmPrices.map(function (p) { return p.ig_id; }))];
        const erpItems = igIds.length ? await dbERP().any(
            `SELECT ig_id, i_name, i_weight, un_name, i_brand
             FROM item WHERE ig_id = ANY($1::int[])
             AND deleted_at IS NULL AND is_item = true
             AND (i_group IS NULL OR i_group != 'N' OR cat_id IN ('HRC', 'CRC', 'HRNS', 'CRNS', 'HR', 'CR') OR $2::text IS NOT NULL)
             AND ($2::text IS NULL OR i_name ILIKE $2)`,
            [igIds, namePattern]
        ) : [];

        const priceIndex = {};
        allPlmPrices.forEach(function (p) {
            if (!priceIndex[p.ig_id]) priceIndex[p.ig_id] = {};
            const code = PR_CODE[p.pr_id];
            if (code) priceIndex[p.ig_id][code] = { current: parseFloat(p.i_price) };
        });

        const items = erpItems.map(function (it) {
            return {
                ig_id:   it.ig_id,
                name:    it.i_name,
                weight:  parseFloat(it.i_weight) || 0,
                un_name: it.un_name,
                i_brand: it.i_brand,
                prices:  priceIndex[it.ig_id] || {},
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

        let finalItems = items;
        if (tpl.filterItems && typeof tpl.filterItems === 'function') {
            finalItems = items.filter(tpl.filterItems);
        }

        const buffer = await tpl.render({ items: finalItems, customValues });

        const slug = tpl.meta.name.replace(/[^A-Za-z0-9]+/g, '_');
        const filename = slug + '_' + moment().tz('Asia/Jakarta').format('YYYYMMDD_HHmmss') + '.pdf';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
        res.send(buffer);
    } catch (err) {
        return response.error(res, null, err);
    }
};
