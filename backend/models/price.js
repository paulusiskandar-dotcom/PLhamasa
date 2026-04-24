/*
 * Price Model — query ke DB PLhamasa (READ + WRITE)
 *
 * Schema DB PLhamasa:
 *   item_price  : ig_id, pr_id, i_price (HARGA PER KG),
 *                 created_at, created_by, updated_at, updated_by
 *   price_log   : plog_id, ig_id, pr_id, plog_from, plog_to, u_id, plog_date
 *
 * CATATAN PENTING:
 * - DB ERP item_price menyimpan harga FINAL (per unit = harga_per_kg × berat)
 * - DB PLhamasa item_price menyimpan harga PER KG
 * - Saat export ERP: harga_per_kg × berat → round → tulis ke template ERP
 */

const { pgp } = require("../configs/database");
const { ColumnSet } = pgp.helpers;

/*
 * Get harga per kg untuk list ig_ids (dari DB PLhamasa)
 */
module.exports.getPricesInfo = function (ig_ids) {
    const ids = Array.isArray(ig_ids) ? ig_ids : [ig_ids];

    const query = `
        SELECT
            ig_id,
            MAX(CASE WHEN pr_id = 2 THEN i_price END) AS price_cash,
            MAX(CASE WHEN pr_id = 4 THEN i_price END) AS price_credit,
            MAX(COALESCE(updated_at, created_at))      AS last_update
        FROM item_price
        WHERE ig_id = ANY($1::int[])
        GROUP BY ig_id
        ORDER BY ig_id
    `;
    return dbPLM.any(query, [ids]);
};

/*
 * Upsert harga per kg + tulis log perubahan
 * priceUpdates: [{ ig_id, pr_id, old_price, new_price, created_by, created_at }]
 */
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
            "i_price    = EXCLUDED.i_price, " +
            "updated_by = EXCLUDED.updated_by, " +
            "updated_at = EXCLUDED.updated_at";

        const count = await t.result(upsert, [], r => r.rowCount);
        return { success: true, changed_count: count };
    });
};
