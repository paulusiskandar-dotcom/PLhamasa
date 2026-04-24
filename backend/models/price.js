const { pgp } = require("../configs/database");
const { ColumnSet } = pgp.helpers;

function round100(raw) {
    const r = raw % 100;
    return r <= 10 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

/*
 * Get PLM prices for ig_ids.
 * Returns: [{ ig_id, price_cash, price_credit, last_update }]
 */
module.exports.getPlmPrices = async function (ig_ids) {
    const ids = ig_ids.map(Number);
    const rows = await dbPLM.any(`
        SELECT ig_id, pr_id, i_price,
               COALESCE(updated_at, created_at) AS last_update
        FROM item_price
        WHERE ig_id = ANY($1::int[])
    `, [ids]);

    const map = {};
    rows.forEach(r => {
        if (!map[r.ig_id]) map[r.ig_id] = { ig_id: r.ig_id, last_update: r.last_update };
        if (Number(r.pr_id) === 2) {
            map[r.ig_id].price_cash = parseFloat(r.i_price);
            if (!map[r.ig_id].last_update || r.last_update > map[r.ig_id].last_update)
                map[r.ig_id].last_update = r.last_update;
        }
        if (Number(r.pr_id) === 4) {
            map[r.ig_id].price_credit = parseFloat(r.i_price);
            if (!map[r.ig_id].last_update || r.last_update > map[r.ig_id].last_update)
                map[r.ig_id].last_update = r.last_update;
        }
    });
    return map;
};

/*
 * Upsert a single price (auto-save, no price_log).
 */
module.exports.upsertPlmPrice = function (ig_id, pr_id, price, user_id) {
    return dbPLM.none(`
        INSERT INTO item_price (ig_id, pr_id, i_price, created_by, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (ig_id, pr_id) DO UPDATE SET
            i_price    = EXCLUDED.i_price,
            updated_by = $4,
            updated_at = NOW()
    `, [ig_id, pr_id, price, user_id]);
};

/*
 * Batch save with price_log.
 * rows: [{ ig_id, pr_id, old_price, new_price }]
 */
module.exports.saveBatch = async function (rows, user_id) {
    return dbPLM.tx("save-batch", async t => {
        const logCols = new ColumnSet([
            "ig_id", "pr_id",
            { name: "plog_from", prop: "old_price" },
            { name: "plog_to",   prop: "new_price" },
            { name: "u_id",      prop: "u_id"      },
        ], { table: "price_log" });

        const withUser = rows.map(r => ({ ...r, u_id: user_id }));
        await t.none(pgp.helpers.insert(withUser, logCols));

        for (const r of rows) {
            await t.none(`
                INSERT INTO item_price (ig_id, pr_id, i_price, created_by, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (ig_id, pr_id) DO UPDATE SET
                    i_price    = EXCLUDED.i_price,
                    updated_by = $4,
                    updated_at = NOW()
            `, [r.ig_id, r.pr_id, r.new_price, user_id]);
        }

        return { success: true, changed_count: rows.length };
    });
};

/*
 * Get last export info for a category.
 */
module.exports.getLastExportInfo = function (cat_id) {
    return dbPLM.oneOrNone(`
        SELECT id, exported_at, exporter_name, item_count, file_name
        FROM export_log
        WHERE cat_id = $1 AND export_type = 'erp'
        ORDER BY exported_at DESC
        LIMIT 1
    `, [cat_id]);
};
