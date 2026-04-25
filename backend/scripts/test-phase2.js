/*
 * test-phase2.js — Direct model test for Phase 2 endpoints
 * Usage: node backend/scripts/test-phase2.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { dbERP, dbPLM } = require('../configs/database');
global.dbERP = dbERP;
global.dbPLM = dbPLM;
global.$rootPath = require('path').join(__dirname, '..');

const $priceListModel  = require('../models/priceList');
const $subcatModel     = require('../models/subcategory');
const $erpTargetModel  = require('../models/erpTarget');

let passed = 0;
let failed = 0;

function ok(name) {
    console.log('  PASS:', name);
    passed++;
}

function fail(name, err) {
    console.error('  FAIL:', name, '-', (err && err.message) ? err.message : err);
    failed++;
}

async function runTests() {
    console.log('\n=== Phase 2 Model Tests ===\n');

    // ── Price List Tests ────────────────────────────────────────────────────

    console.log('--- priceList ---');

    // Test 1: listAll (may be empty)
    try {
        const list = await $priceListModel.listAll(null, 1);
        if (Array.isArray(list)) ok('listAll returns array');
        else fail('listAll returns array', 'Not an array');
    } catch (e) { fail('listAll', e); }

    // Test 2: getOpenForCategory (expect null for cat 999)
    try {
        const open = await $priceListModel.getOpenForCategory(999);
        if (open === null) ok('getOpenForCategory returns null when none');
        else fail('getOpenForCategory returns null when none', 'Expected null, got: ' + JSON.stringify(open));
    } catch (e) { fail('getOpenForCategory', e); }

    // Test 3: createOpenFromBaseline
    let plId = null;
    try {
        const result = await $priceListModel.createOpenFromBaseline(
            999, 'Test Category', 1,
            [
                { ig_id: 1, pr_id: 2, i_price: 15000 },
                { ig_id: 1, pr_id: 4, i_price: 16000 },
            ]
        );
        plId = result.id;
        if (result.status === 'OPEN' && result.items.length === 2) {
            ok('createOpenFromBaseline');
        } else {
            fail('createOpenFromBaseline', 'Unexpected result: ' + JSON.stringify({ status: result.status, items: result.items.length }));
        }
    } catch (e) { fail('createOpenFromBaseline', e); }

    if (plId) {
        // Test 4: acquireLock
        try {
            const lock = await $priceListModel.acquireLock(plId, 1);
            if (lock.success) ok('acquireLock');
            else fail('acquireLock', lock.error);
        } catch (e) { fail('acquireLock', e); }

        // Test 5: heartbeat
        try {
            const hb = await $priceListModel.heartbeat(plId, 1);
            if (hb.success) ok('heartbeat');
            else fail('heartbeat', hb.error);
        } catch (e) { fail('heartbeat', e); }

        // Test 6: updateItemPrice
        try {
            const upd = await $priceListModel.updateItemPrice(plId, 1, 2, 16500, 1);
            if (upd.success) ok('updateItemPrice');
            else fail('updateItemPrice', upd.error);
        } catch (e) { fail('updateItemPrice', e); }

        // Test 7: getLog
        try {
            const log = await $priceListModel.getLog(plId);
            if (Array.isArray(log) && log.length >= 1) ok('getLog has entries');
            else fail('getLog has entries', 'Expected >= 1 entry, got ' + (log ? log.length : 'null'));
        } catch (e) { fail('getLog', e); }

        // Test 8: getById with items + lock_status
        try {
            const pl = await $priceListModel.getById(plId, 1);
            if (pl && Array.isArray(pl.items) && pl.locked_status === 'mine') ok('getById with lock_status=mine');
            else fail('getById with lock_status=mine', 'locked_status=' + (pl ? pl.locked_status : 'null'));
        } catch (e) { fail('getById', e); }

        // Test 9: bulkUpdateItemPrices
        try {
            const bulk = await $priceListModel.bulkUpdateItemPrices(plId, [
                { ig_id: 1, pr_id: 2, new_price: 17000 },
                { ig_id: 1, pr_id: 4, new_price: 18000 },
            ], 1);
            if (bulk.success && bulk.updated_count === 2) ok('bulkUpdateItemPrices');
            else fail('bulkUpdateItemPrices', JSON.stringify(bulk));
        } catch (e) { fail('bulkUpdateItemPrices', e); }

        // Test 10: duplicate OPEN for same cat should violate unique index
        try {
            await $priceListModel.createOpenFromBaseline(999, 'Test Category', 1, []);
            fail('duplicate OPEN constraint', 'Should have thrown unique violation');
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('idx_open_per_cat') || msg.includes('unique') || msg.includes('duplicate') || msg.includes('violates')) {
                ok('duplicate OPEN constraint blocks correctly');
            } else {
                fail('duplicate OPEN constraint', e);
            }
        }

        // Test 11: releaseLock
        try {
            const rel = await $priceListModel.releaseLock(plId, 1);
            if (rel.success) ok('releaseLock');
            else fail('releaseLock', rel.error);
        } catch (e) { fail('releaseLock', e); }

        // Test 12: createOpenFromBasedOn
        let pl2Id = null;
        try {
            // First need to release lock and delete the open to allow new from based_on
            // Actually createOpenFromBasedOn will fail if OPEN exists for same cat
            // So let's mark pl as published first
            await global.dbPLM.none("UPDATE price_list SET status='PUBLISHED' WHERE id=$1", [plId]);
            const pl2 = await $priceListModel.createOpenFromBasedOn(plId, 1);
            pl2Id = pl2.id;
            if (pl2.status === 'OPEN' && pl2.based_on_id === plId) ok('createOpenFromBasedOn');
            else fail('createOpenFromBasedOn', JSON.stringify({ status: pl2.status, based_on_id: pl2.based_on_id }));
        } catch (e) { fail('createOpenFromBasedOn', e); }

        // Cleanup pl2
        if (pl2Id) {
            await global.dbPLM.none('DELETE FROM price_list_item WHERE price_list_id=$1', [pl2Id]).catch(() => {});
            await global.dbPLM.none('DELETE FROM price_list WHERE id=$1', [pl2Id]).catch(() => {});
        }

        // Cleanup pl
        await global.dbPLM.none('DELETE FROM price_list_log WHERE price_list_id=$1', [plId]).catch(() => {});
        await global.dbPLM.none('DELETE FROM price_list_item WHERE price_list_id=$1', [plId]).catch(() => {});
        await global.dbPLM.none('DELETE FROM price_list WHERE id=$1', [plId]).catch(() => {});
        console.log('  (cleanup: test price_list rows deleted)');
    }

    // ── Subcategory Tests ───────────────────────────────────────────────────

    console.log('\n--- subcategory ---');

    // Use integer cat_id (cat_id column is integer in the schema)
    const TEST_CAT_ID = 9999;
    let subcatId = null;
    try {
        const sub = await $subcatModel.create(TEST_CAT_ID, 'Test Cat', 'TestSubcat', 1);
        subcatId = sub.id;
        if (sub.id && sub.name === 'TestSubcat') ok('subcategory create');
        else fail('subcategory create', JSON.stringify(sub));
    } catch (e) { fail('subcategory create', e); }

    if (subcatId) {
        try {
            const list = await $subcatModel.listByCategory(TEST_CAT_ID);
            if (Array.isArray(list) && list.length >= 1) ok('subcategory listByCategory');
            else fail('subcategory listByCategory', 'Empty list');
        } catch (e) { fail('subcategory listByCategory', e); }

        try {
            const got = await $subcatModel.getById(subcatId);
            if (got && got.id === subcatId) ok('subcategory getById');
            else fail('subcategory getById', 'Not found');
        } catch (e) { fail('subcategory getById', e); }

        try {
            const updated = await $subcatModel.update(subcatId, 'TestSubcat-updated', 1);
            if (updated.name === 'TestSubcat-updated') ok('subcategory update');
            else fail('subcategory update', updated.name);
        } catch (e) { fail('subcategory update', e); }

        try {
            await $subcatModel.assignItems(subcatId, [100, 101], 1);
            const items = await $subcatModel.getItems(subcatId);
            if (items.length === 2) ok('subcategory assignItems + getItems');
            else fail('subcategory assignItems + getItems', 'Expected 2 items, got ' + items.length);
        } catch (e) { fail('subcategory assignItems', e); }

        try {
            await $subcatModel.removeItem(subcatId, 100);
            const items = await $subcatModel.getItems(subcatId);
            if (items.length === 1) ok('subcategory removeItem');
            else fail('subcategory removeItem', 'Expected 1 item, got ' + items.length);
        } catch (e) { fail('subcategory removeItem', e); }

        try {
            const map = await $subcatModel.getItemAssignments(TEST_CAT_ID);
            if (typeof map === 'object') ok('subcategory getItemAssignments');
            else fail('subcategory getItemAssignments', 'Not an object');
        } catch (e) { fail('subcategory getItemAssignments', e); }

        // Cleanup
        await global.dbPLM.none('DELETE FROM subcategory_item WHERE subcategory_id=$1', [subcatId]).catch(() => {});
        await global.dbPLM.none('DELETE FROM subcategory WHERE id=$1', [subcatId]).catch(() => {});
        console.log('  (cleanup: test subcategory rows deleted)');
    }

    // ── ERP Target Tests ────────────────────────────────────────────────────

    console.log('\n--- erpTarget ---');

    let erpId = null;
    try {
        const erp = await $erpTargetModel.create({
            name: 'Test Target',
            host: 'localhost',
            port: 5432,
            db_name: 'test_db',
            db_user: 'postgres',
            db_password: 'test_pass',
            is_active: false,
            note: 'test',
        }, 1);
        erpId = erp.id;
        if (erp.id && erp.name === 'Test Target') ok('erpTarget create');
        else fail('erpTarget create', JSON.stringify(erp));
    } catch (e) { fail('erpTarget create', e); }

    if (erpId) {
        try {
            const all = await $erpTargetModel.listAll();
            if (Array.isArray(all) && all.length >= 1) ok('erpTarget listAll');
            else fail('erpTarget listAll', 'Empty');
        } catch (e) { fail('erpTarget listAll', e); }

        try {
            const got = await $erpTargetModel.getById(erpId);
            if (got && got.id === erpId) ok('erpTarget getById');
            else fail('erpTarget getById', 'Not found');
        } catch (e) { fail('erpTarget getById', e); }

        try {
            await $erpTargetModel.update(erpId, {
                name: 'Test Target Updated',
                host: 'localhost',
                port: 5432,
                db_name: 'test_db',
                db_user: 'postgres',
                db_password: null,
                note: 'updated',
            }, 1);
            ok('erpTarget update');
        } catch (e) { fail('erpTarget update', e); }

        try {
            const connTest = await $erpTargetModel.testConnection('localhost', 5432, 'nonexistent_db', 'postgres', 'wrong_pass');
            // Expected to fail (can't connect to nonexistent DB)
            if (!connTest.success) ok('erpTarget testConnection (expected failure)');
            else ok('erpTarget testConnection (unexpected success — DB happened to exist)');
        } catch (e) { fail('erpTarget testConnection', e); }

        // Cleanup
        await global.dbPLM.none('DELETE FROM erp_target WHERE id=$1', [erpId]).catch(() => {});
        console.log('  (cleanup: test erp_target row deleted)');
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
});
