/*
 * erpTarget.js — PLhamasa erp_target model
 * All queries use global.dbPLM.
 */

const db = () => global.dbPLM;

module.exports.listAll = function () {
    return db().any('SELECT id, name, host, port, db_name, db_user, is_active, note, created_at FROM erp_target ORDER BY name ASC');
};

module.exports.getActive = function () {
    return db().oneOrNone("SELECT * FROM erp_target WHERE is_active = TRUE");
};

module.exports.getById = function (id) {
    return db().oneOrNone('SELECT id, name, host, port, db_name, db_user, is_active, note FROM erp_target WHERE id=$1', [id]);
};

module.exports.create = function (data, userId) {
    return db().one(
        `INSERT INTO erp_target (name, host, port, db_name, db_user, db_password, is_active, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, host, port, db_name, db_user, is_active, note`,
        [data.name, data.host, data.port || 5432, data.db_name, data.db_user, data.db_password, data.is_active || false, data.note || null, userId]
    );
};

module.exports.update = function (id, data, userId) {
    return db().one(
        `UPDATE erp_target SET name=$1, host=$2, port=$3, db_name=$4, db_user=$5,
         db_password=COALESCE($6, db_password), note=$7, updated_by=$8, updated_at=NOW()
         WHERE id=$9 RETURNING id, name, host, port, db_name, db_user, is_active, note`,
        [data.name, data.host, data.port || 5432, data.db_name, data.db_user, data.db_password || null, data.note || null, userId, id]
    );
};

module.exports.delete = function (id) {
    return db().none('DELETE FROM erp_target WHERE id=$1', [id]);
};

module.exports.setActive = function (id) {
    return db().tx(async t => {
        await t.none('UPDATE erp_target SET is_active=FALSE, updated_at=NOW()');
        await t.none('UPDATE erp_target SET is_active=TRUE, updated_at=NOW() WHERE id=$1', [id]);
    });
};

module.exports.testConnection = async function (host, port, dbName, dbUser, dbPassword) {
    const { pgp } = require('../configs/database');
    const testDb = pgp({
        host,
        port: port || 5432,
        database: dbName,
        user: dbUser,
        password: dbPassword,
        connectionTimeoutMillis: 5000,
    });
    try {
        const r = await testDb.one('SELECT version()');
        return { success: true, version: r.version };
    } catch (e) {
        return { success: false, error: e.message };
    }
};
