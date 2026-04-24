const pgp = require("pg-promise")();
const { ColumnSet } = pgp.helpers;

module.exports.getPriceTypes = function () {
    return db.any("SELECT pr_id, pr_code, pr_name FROM price ORDER BY pr_id ASC");
};

module.exports.getPricesInfo = function (ig_ids) {
    const query = `
        SELECT
            ig_id,
            MAX(CASE WHEN pr_id = 2 THEN i_price END) AS price_cash,
            MAX(CASE WHEN pr_id = 4 THEN i_price END) AS price_credit,
            MAX(COALESCE(updated_at, created_at))      AS last_update
        FROM item_price
        WHERE ig_id IN ($1:csv)
        GROUP BY ig_id
        ORDER BY ig_id
    `;
    return db.any(query, [ig_ids]);
};

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

    return db.tx("update-and-log-prices", async t => {
        await t.none(pgp.helpers.insert(priceUpdates, logCols));

        const upsert = pgp.helpers.insert(priceUpdates, priceCols) +
            " ON CONFLICT (ig_id, pr_id) DO UPDATE SET " +
            "i_price = EXCLUDED.i_price, " +
            "updated_by = EXCLUDED.updated_by, " +
            "updated_at = EXCLUDED.updated_at";

        const count = await t.result(upsert, [], r => r.rowCount);
        return { success: true, changed_count: count };
    });
};
