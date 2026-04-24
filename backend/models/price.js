const { pgp } = require("../configs/database");
const { ColumnSet } = pgp.helpers;

function round100(raw) {
    const r = raw % 100;
    return r <= 10 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

/*
 * Get per-kg prices for a list of ig_ids.
 * Source: dbPLM first; fallback to dbERP (final_price / weight) for missing.
 */
module.exports.getPricesInfo = async function (ig_ids) {
    const ids = ig_ids.map(Number);

    const plmRows = await dbPLM.any(`
        SELECT ig_id, pr_id, i_price, status,
               COALESCE(updated_at, created_at) AS last_update
        FROM item_price
        WHERE ig_id = ANY($1::int[])
    `, [ids]);

    const plmMap = {};
    plmRows.forEach(r => {
        if (!plmMap[r.ig_id]) plmMap[r.ig_id] = {};
        plmMap[r.ig_id][r.pr_id] = r;
    });

    // IDs that are missing pr_id=2 OR pr_id=4 in PLM
    const needsErp = ids.filter(id => !plmMap[id] || !plmMap[id][2] || !plmMap[id][4]);

    const erpMap = {};
    if (needsErp.length > 0) {
        const erpRows = await dbERP.any(`
            SELECT ip.ig_id, ip.pr_id, ip.i_price, i.i_weight
            FROM item_price ip
            JOIN item i ON i.ig_id = ip.ig_id
            WHERE ip.ig_id = ANY($1::int[])
              AND ip.pr_id IN (2, 4)
              AND i.deleted_at IS NULL
        `, [needsErp]);

        erpRows.forEach(r => {
            if (!erpMap[r.ig_id]) erpMap[r.ig_id] = {};
            const w = parseFloat(r.i_weight) || 0;
            const p = parseFloat(r.i_price)  || 0;
            erpMap[r.ig_id][r.pr_id] = { i_price: w > 0 ? round100(p / w) : p, status: "erp" };
        });
    }

    return ids.map(ig_id => {
        const plm = plmMap[ig_id] || {};
        const erp = erpMap[ig_id] || {};
        const cashRow   = plm[2] || erp[2] || null;
        const creditRow = plm[4] || erp[4] || null;
        if (!cashRow && !creditRow) return null;

        const plmVals = Object.values(plm);
        const lastUpdate = plmVals.length > 0
            ? plmVals.reduce((m, r) => (r.last_update > m ? r.last_update : m), plmVals[0].last_update)
            : null;

        return {
            ig_id,
            price_cash:    cashRow   ? parseFloat(cashRow.i_price)   : null,
            price_credit:  creditRow ? parseFloat(creditRow.i_price) : null,
            status_cash:   cashRow   ? cashRow.status   : null,
            status_credit: creditRow ? creditRow.status : null,
            last_update:   lastUpdate,
        };
    }).filter(Boolean);
};

/*
 * Upsert a single draft entry.
 */
module.exports.saveDraft = function (ig_id, pr_id, price, user_id) {
    return dbPLM.none(`
        INSERT INTO item_price
            (ig_id, pr_id, i_price, status, draft_by, draft_at, created_by, created_at)
        VALUES ($1, $2, $3, 'draft', $4, NOW(), $4, NOW())
        ON CONFLICT (ig_id, pr_id) DO UPDATE SET
            i_price    = EXCLUDED.i_price,
            status     = 'draft',
            draft_by   = EXCLUDED.draft_by,
            draft_at   = EXCLUDED.draft_at,
            updated_by = EXCLUDED.draft_by,
            updated_at = EXCLUDED.draft_at
    `, [ig_id, pr_id, price, user_id]);
};

/*
 * Commit all drafts → final + insert price_log.
 */
module.exports.commitDrafts = async function (user_id) {
    return dbPLM.tx("commit-drafts", async t => {
        const drafts = await t.any(`
            SELECT ip.ig_id, ip.pr_id, ip.i_price AS new_price,
                   COALESCE(
                       (SELECT plog_to FROM price_log
                        WHERE ig_id = ip.ig_id AND pr_id = ip.pr_id
                        ORDER BY plog_date DESC LIMIT 1),
                       0
                   ) AS old_price
            FROM item_price ip
            WHERE ip.status = 'draft'
        `);

        if (drafts.length === 0) return { success: true, changed_count: 0 };

        const logCols = new ColumnSet([
            "ig_id", "pr_id",
            { name: "plog_from", prop: "old_price" },
            { name: "plog_to",   prop: "new_price" },
            { name: "u_id",      prop: "u_id"      },
        ], { table: "price_log" });

        await t.none(pgp.helpers.insert(drafts.map(d => ({ ...d, u_id: user_id })), logCols));

        await t.none(`
            UPDATE item_price SET
                status     = 'final',
                draft_by   = NULL,
                draft_at   = NULL,
                updated_by = $1,
                updated_at = NOW()
            WHERE status = 'draft'
        `, [user_id]);

        return { success: true, changed_count: drafts.length };
    });
};

/*
 * Discard current user's drafts: restore last committed price or delete row.
 */
module.exports.discardDrafts = async function (user_id) {
    return dbPLM.tx("discard-drafts", async t => {
        const drafts = await t.any(
            "SELECT ig_id, pr_id FROM item_price WHERE status = 'draft' AND draft_by = $1",
            [user_id]
        );
        for (const d of drafts) {
            const last = await t.oneOrNone(`
                SELECT plog_to FROM price_log
                WHERE ig_id = $1 AND pr_id = $2
                ORDER BY plog_date DESC LIMIT 1
            `, [d.ig_id, d.pr_id]);

            if (last) {
                await t.none(`
                    UPDATE item_price SET
                        i_price  = $3, status = 'final', draft_by = NULL, draft_at = NULL
                    WHERE ig_id = $1 AND pr_id = $2
                `, [d.ig_id, d.pr_id, last.plog_to]);
            } else {
                await t.none("DELETE FROM item_price WHERE ig_id = $1 AND pr_id = $2", [d.ig_id, d.pr_id]);
            }
        }
        return { success: true };
    });
};

/*
 * Return draft rows updated after `since` (for 15-second polling).
 */
module.exports.getDraftChangesSince = function (since) {
    return dbPLM.any(`
        SELECT ig_id, pr_id, draft_by, draft_at
        FROM item_price
        WHERE status = 'draft'
          AND draft_at > $1::timestamptz
    `, [since]);
};

/* ── Legacy: backward-compat for old /price/save endpoint ────── */
module.exports.updateAndLogPrices = async function (priceUpdates) {
    const logCols = new ColumnSet([
        { name: "ig_id",     prop: "ig_id"      },
        { name: "pr_id",     prop: "pr_id"      },
        { name: "plog_from", prop: "old_price"  },
        { name: "plog_to",   prop: "new_price"  },
        { name: "u_id",      prop: "created_by" },
        { name: "plog_date", prop: "created_at" },
    ], { table: "price_log" });

    const priceCols = new ColumnSet([
        { name: "ig_id",      prop: "ig_id"      },
        { name: "pr_id",      prop: "pr_id"      },
        { name: "i_price",    prop: "new_price"  },
        { name: "created_by", prop: "created_by" },
        { name: "created_at", prop: "created_at" },
        { name: "updated_by", prop: "created_by" },
        { name: "updated_at", prop: "created_at" },
    ], { table: "item_price" });

    return dbPLM.tx("update-and-log-prices", async t => {
        await t.none(pgp.helpers.insert(priceUpdates, logCols));
        const upsert = pgp.helpers.insert(priceUpdates, priceCols) +
            " ON CONFLICT (ig_id, pr_id) DO UPDATE SET " +
            "i_price = EXCLUDED.i_price, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at";
        const count = await t.result(upsert, [], r => r.rowCount);
        return { success: true, changed_count: count };
    });
};
