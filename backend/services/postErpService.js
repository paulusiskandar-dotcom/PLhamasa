/*
 * postErpService.js — Post-to-ERP diff, execution, and cross-check logic
 */

const dbPLM = () => global.dbPLM;
const dbERP = () => global.dbERP;

const PR_LABELS = {
    1: 'cash_pabrik',
    2: 'cash_gudang',
    3: 'kredit_pabrik',
    4: 'kredit_gudang',
};

function roundSpecial(raw) {
    const sisa = Math.round(raw) % 100;
    return sisa <= 49
        ? Math.floor(raw / 100) * 100
        : Math.ceil(raw / 100) * 100;
}

// Resolve the ERP connection to READ from, matching the DB that publish WRITES
// to. Returns { erp, owned }: when a Settings erp_target is resolved, `erp` is a
// freshly-opened connection to it and `owned` is true (caller MUST end it); when
// none exists, falls back to the .env singleton global.dbERP (owned:false — must
// NOT be ended, it's shared). erpTargetId omitted → use the active target.
async function _resolveErpRead(erpTargetId) {
    const { pgp } = require('../configs/database');
    const row = erpTargetId
        ? await dbPLM().oneOrNone('SELECT * FROM erp_target WHERE id=$1', [erpTargetId])
        : await dbPLM().oneOrNone('SELECT * FROM erp_target WHERE is_active = TRUE');
    if (!row) return { erp: dbERP(), owned: false };
    const { decrypt, isEncrypted } = require('../utils/crypto');
    const password = (row.db_password && isEncrypted(row.db_password)) ? decrypt(row.db_password) : row.db_password;
    const erp = pgp({
        host: row.host, port: row.port, database: row.db_name,
        user: row.db_user, password,
        connectionTimeoutMillis: 10000,
    });
    return { erp, owned: true };
}

// End a connection's pool. ONLY for connections we own (built via pgp here) —
// never the shared global.dbERP/dbPLM singletons. Uses the per-connection pool,
// NOT pgp.end() (which would tear down the shared singletons too).
async function _endConn(conn) {
    try {
        if (conn && conn.$pool && !conn.$pool.ended) await conn.$pool.end();
    } catch (e) { /* ignore pool teardown errors */ }
}

async function _loadContext(plId, erpConn) {
    const erp = erpConn || dbERP();
    const pl = await dbPLM().oneOrNone('SELECT * FROM price_list WHERE id=$1', [plId]);
    if (!pl) return { error: 'not_found' };

    const $blacklist = require('../models/blacklist');
    const blacklistedIds = await $blacklist.getBlacklistedIds();

    const allItems = await dbPLM().any(
        'SELECT pli.ig_id, pli.pr_id, pli.i_price FROM price_list_item pli WHERE pli.price_list_id=$1',
        [plId]
    );
    const items = blacklistedIds.length
        ? allItems.filter(i => !blacklistedIds.includes(i.ig_id))
        : allItems;

    const ig_ids = [...new Set(items.map(i => i.ig_id))];
    const erpItems = ig_ids.length
        ? await erp.any(
            `SELECT ig_id, i_name AS ig_name, i_weight
             FROM item
             WHERE ig_id = ANY($1::int[])
               AND deleted_at IS NULL`,
            [ig_ids]
          )
        : [];

    const nameMap   = {};
    const weightMap = {};
    erpItems.forEach(r => {
        nameMap[r.ig_id]   = r.ig_name;
        weightMap[r.ig_id] = parseFloat(r.i_weight) || 0;
    });

    return { pl, items, ig_ids, nameMap, weightMap, blacklistedIds };
}

// ── calculateDiff ─────────────────────────────────────────────────────────────
// Returns array of { ig_id, ig_name, pr_id, pr_label, weight,
//   plm_per_kg, plm_per_unit, erp_current, diff_status }
// diff_status: 'new' | 'changed' | 'unchanged'
module.exports.calculateDiff = async function (plId, erpTargetId) {
    const { erp, owned } = await _resolveErpRead(erpTargetId);
    try {
        const ctx = await _loadContext(plId, erp);
        if (ctx.error) return { error: ctx.error };

        const { pl, items, ig_ids, nameMap, weightMap } = ctx;

        // Load current ERP prices (from the resolved target — same DB publish writes to)
        const erpPrices = ig_ids.length
            ? await erp.any(
                'SELECT ig_id, pr_id, i_price FROM item_price WHERE ig_id = ANY($1::int[])',
                [ig_ids]
              )
            : [];
        const erpPriceMap = {};
        erpPrices.forEach(r => {
            erpPriceMap[`${r.ig_id}:${r.pr_id}`] = parseFloat(r.i_price) || 0;
        });

        const rows = items.map(item => {
            const weight    = weightMap[item.ig_id] || 0;
            const plmPerKg  = parseFloat(item.i_price) || 0;
            const plmPerUnit = weight > 0 ? roundSpecial(plmPerKg * weight) : plmPerKg;
            const erpCurrent = erpPriceMap[`${item.ig_id}:${item.pr_id}`];

            let diff_status;
            if (erpCurrent === undefined) diff_status = 'new';
            else if (erpCurrent !== plmPerUnit) diff_status = 'changed';
            else diff_status = 'unchanged';

            return {
                ig_id:       item.ig_id,
                ig_name:     nameMap[item.ig_id] || '',
                pr_id:       item.pr_id,
                pr_label:    PR_LABELS[item.pr_id] || String(item.pr_id),
                weight,
                plm_per_kg:  plmPerKg,
                plm_per_unit: plmPerUnit,
                erp_current: erpCurrent !== undefined ? erpCurrent : null,
                diff_status,
            };
        });

        const summary = {
            total:     rows.length,
            new:       rows.filter(r => r.diff_status === 'new').length,
            changed:   rows.filter(r => r.diff_status === 'changed').length,
            unchanged: rows.filter(r => r.diff_status === 'unchanged').length,
        };

        return { pl, rows, summary };
    } finally {
        if (owned) await _endConn(erp);
    }
};

// ── executePost ───────────────────────────────────────────────────────────────
module.exports.executePost = async function (plId, erpTargetId, userId) {
    const { pgp } = require('../configs/database');
    const dimsService = require('./itemDimensionsService');

    // Resolve + open the ERP target connection FIRST, so the context read, the
    // before-snapshot read, and the price WRITE all use the SAME database within
    // this single publish (previously the reads hit .env global.dbERP → false
    // mismatches whenever the Settings target differed from .env).
    const erpTarget = await dbPLM().oneOrNone('SELECT * FROM erp_target WHERE id=$1', [erpTargetId]);
    if (!erpTarget) return { success: false, error: 'erp_target_not_found' };
    const { decrypt, isEncrypted } = require('../utils/crypto');
    if (erpTarget.db_password && isEncrypted(erpTarget.db_password)) {
        erpTarget.db_password = decrypt(erpTarget.db_password);
    }
    const erpTargetDb = pgp({
        host:     erpTarget.host,
        port:     erpTarget.port,
        database: erpTarget.db_name,
        user:     erpTarget.db_user,
        password: erpTarget.db_password,
        connectionTimeoutMillis: 10000,
    });

    try {
        const ctx = await _loadContext(plId, erpTargetDb);
        if (ctx.error) return { success: false, error: ctx.error };

        const { pl, items, weightMap, nameMap } = ctx;
        if (pl.status !== 'OPEN')      return { success: false, error: 'not_open' };
        if (pl.locked_by !== userId)   return { success: false, error: 'lock_required' };
        if (!items.length)             return { success: false, error: 'no_items' };

        // Validate wajib-tebal requirement
        const tebalValidation = await dimsService.validateTebalRequirement(plId);
        if (!tebalValidation.ok) {
            return {
                success: false,
                error: 'tebal_required',
                message: `Tidak bisa post: ${tebalValidation.unassigned_count} item belum di-assign tebal. Assign dulu di edit page sebelum post.`
            };
        }

        // Snapshot for audit
        const snapshot = items.map(item => ({
            ig_id:   item.ig_id,
            pr_id:   item.pr_id,
            i_price: parseFloat(item.i_price),
        }));

        // Set POSTING status
        await dbPLM().none(
            "UPDATE price_list SET status='POSTING' WHERE id=$1",
            [plId]
        );

        // Create export audit record
        const exportRec = await dbPLM().one(
            `INSERT INTO price_list_export (price_list_id, export_type, user_id, post_status, snapshot)
             VALUES ($1, 'erp', $2, 'in_progress', $3) RETURNING id`,
            [plId, userId, JSON.stringify(snapshot)]
        );
        const exportId = exportRec.id;
        const startedAt = Date.now();

        try {
            // Capture ERP prices BEFORE post (harga_lama for report) — from the
            // SAME target connection the write uses below.
            const ig_ids_for_snap = [...new Set(items.map(i => i.ig_id))];
            const erpBefore = ig_ids_for_snap.length
                ? await erpTargetDb.any(
                    'SELECT ig_id, pr_id, i_price FROM item_price WHERE ig_id = ANY($1::int[])',
                    [ig_ids_for_snap]
                  )
                : [];
            const erpBeforeMap = {};
            erpBefore.forEach(function (r) {
                erpBeforeMap[r.ig_id + ':' + r.pr_id] = parseFloat(r.i_price) || 0;
            });

            await erpTargetDb.tx(async t => {
                for (const item of items) {
                    const weight = weightMap[item.ig_id] || 0;
                    const finalPrice = weight > 0
                        ? roundSpecial(parseFloat(item.i_price) * weight)
                        : parseFloat(item.i_price);
                    await t.none(
                        `INSERT INTO item_price (ig_id, pr_id, i_price, updated_at)
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (ig_id, pr_id) DO UPDATE SET i_price=EXCLUDED.i_price, updated_at=NOW()`,
                        [item.ig_id, item.pr_id, finalPrice]
                    );
                }
            });

            const $model = require('../models/priceList');
            const newOpen = await dbPLM().tx(async t => {
                await t.none(
                    `UPDATE price_list SET status='PUBLISHED', posted_by=$1, posted_at=NOW(),
                     posted_to_erp_id=$2, locked_by=NULL, locked_at=NULL, locked_heartbeat=NULL
                     WHERE id=$3`,
                    [userId, erpTargetId, plId]
                );

                const nextRevNo = await $model.getNextRevisionNo(pl.cat_id);
                const newPl = await t.one(
                    `INSERT INTO price_list (cat_id, cat_name, revision_no, status, created_by, based_on_id)
                     VALUES ($1,$2,$3,'OPEN',$4,$5) RETURNING *`,
                    [pl.cat_id, pl.cat_name, nextRevNo, userId, plId]
                );

                for (const item of items) {
                    await t.none(
                        `INSERT INTO price_list_item (price_list_id, ig_id, pr_id, i_price, updated_by)
                         VALUES ($1,$2,$3,$4,$5)`,
                        [newPl.id, item.ig_id, item.pr_id, item.i_price, userId]
                    );
                }
                return newPl;
            });

            const duration = Date.now() - startedAt;
            await dbPLM().none(
                `UPDATE price_list_export SET post_status='success', duration_ms=$1 WHERE id=$2`,
                [duration, exportId]
            );

            // ── Generate PDF Laporan Post ─────────────────────────────────
            try {
                const postReportPdf = require('./postReportPdf');
                const postedPl = await dbPLM().oneOrNone(
                    `SELECT pl.*, u.username AS posted_by_name, et.name AS target_erp_name
                     FROM price_list pl
                     LEFT JOIN users u      ON u.id  = pl.posted_by
                     LEFT JOIN erp_target et ON et.id = pl.posted_to_erp_id
                     WHERE pl.id = $1`,
                    [plId]
                );

                const pdfItems = items.map(function (item) {
                    const weight    = weightMap[item.ig_id] || 0;
                    const hargaBaru = weight > 0
                        ? roundSpecial(parseFloat(item.i_price) * weight)
                        : parseFloat(item.i_price);
                    return {
                        ig_id:      item.ig_id,
                        ig_name:    nameMap[item.ig_id] || ('Item ' + item.ig_id),
                        pr_id:      item.pr_id,
                        harga_lama: erpBeforeMap[item.ig_id + ':' + item.pr_id] || 0,
                        harga_baru: hargaBaru,
                    };
                });

                const relPath = await postReportPdf.generate({
                    priceList: postedPl,
                    items:     pdfItems,
                    summary:   { total: items.length, duration_ms: duration, mismatch_count: 0 },
                });

                await dbPLM().none(
                    `UPDATE price_list SET post_report_path = $2 WHERE id = $1`,
                    [plId, relPath]
                );
            } catch (pdfErr) {
                console.error('[postErp] Gagal generate PDF report:', pdfErr.message);
            }

            return {
                success:      true,
                posted_pl_id: plId,
                new_open_id:  newOpen.id,
                duration_ms:  duration,
                items_posted: items.length,
            };
        } catch (err) {
            const duration = Date.now() - startedAt;

            // Revert POSTING → OPEN
            await dbPLM().none(
                "UPDATE price_list SET status='OPEN' WHERE id=$1 AND status='POSTING'",
                [plId]
            );
            await dbPLM().none(
                `UPDATE price_list_export SET post_status='failed', duration_ms=$1, error_msg=$2 WHERE id=$3`,
                [duration, err.message, exportId]
            );

            return { success: false, error: err.message, duration_ms: duration };
        }
    } finally {
        // Release the target connection pool. The previous code never ended it
        // (pre-existing leak); now closed on every exit path. Per-connection end
        // only — never pgp.end(), which would tear down the shared singletons.
        await _endConn(erpTargetDb);
    }
};

// ── crossCheck ────────────────────────────────────────────────────────────────
// Compare PLM computed per-unit prices vs live ERP prices
module.exports.crossCheck = async function (plId, erpTargetId) {
    const { erp, owned } = await _resolveErpRead(erpTargetId);
    try {
        const ctx = await _loadContext(plId, erp);
        if (ctx.error) return { error: ctx.error };

        const { pl, items, ig_ids, nameMap, weightMap } = ctx;

        const erpPrices = ig_ids.length
            ? await erp.any(
                'SELECT ig_id, pr_id, i_price FROM item_price WHERE ig_id = ANY($1::int[])',
                [ig_ids]
              )
            : [];
        const erpPriceMap = {};
        erpPrices.forEach(r => {
            erpPriceMap[`${r.ig_id}:${r.pr_id}`] = parseFloat(r.i_price) || 0;
        });

        let matched = 0, mismatched = 0;
        const mismatches = [];

        for (const item of items) {
            const weight     = weightMap[item.ig_id] || 0;
            const plmPerKg   = parseFloat(item.i_price) || 0;
            const plmPerUnit = weight > 0 ? roundSpecial(plmPerKg * weight) : plmPerKg;
            const erpPrice   = erpPriceMap[`${item.ig_id}:${item.pr_id}`];

            if (erpPrice === plmPerUnit) {
                matched++;
            } else {
                mismatched++;
                mismatches.push({
                    ig_id:       item.ig_id,
                    ig_name:     nameMap[item.ig_id] || '',
                    pr_id:       item.pr_id,
                    pr_label:    PR_LABELS[item.pr_id] || String(item.pr_id),
                    plm_per_unit: plmPerUnit,
                    erp_price:   erpPrice !== undefined ? erpPrice : null,
                });
            }
        }

        return {
            pl,
            matched,
            mismatched,
            total: items.length,
            mismatches,
            ok: mismatched === 0,
        };
    } finally {
        if (owned) await _endConn(erp);
    }
};
