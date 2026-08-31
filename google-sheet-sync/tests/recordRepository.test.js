const assert = require('assert');
const {
    WORKER_COLUMNS,
    createWorkerTableSql,
    initSchema,
    searchRecords,
    upsertRecords
} = require('../src/recordRepository');

async function main() {
    const sql = createWorkerTableSql('google_sheet_ar_int_records');
    assert.ok(sql.includes('jb_id VARCHAR(255) NULL'));
    assert.ok(sql.includes('KEY idx_jb_id (jb_id)'));
    assert.strictEqual(sql.includes('job_id'), false);
    assert.ok(WORKER_COLUMNS.includes('jb_id'));
    assert.strictEqual(WORKER_COLUMNS.includes('job_id'), false);

    const schemaCalls = [];
    const schemaPool = {
        async query(querySql) {
            schemaCalls.push(querySql);
            return [{}];
        }
    };
    await initSchema(schemaPool, [{ tableName: 'google_sheet_ar_int_records' }]);
    assert.ok(schemaCalls.some(call => call.includes('ADD COLUMN `jb_id`')));
    assert.ok(schemaCalls.some(call => call.includes('ADD INDEX `idx_jb_id`')));

    const calls = [];
    const pool = {
        async query(querySql, values) {
            calls.push({ sql: querySql, values });
            if (querySql.includes('SELECT source_key')) return [[]];
            return [{}];
        }
    };

    const recordA = {
        source_key: 'ppt:ah040768',
        ppt_name: 'FIRST',
        ppt_number: 'AH040768',
        jb_id: 'JB100',
        raw_data: { row1: [], row2: [], row3: [] },
        row_hash: 'hash-a'
    };
    const recordB = {
        ...recordA,
        ppt_name: 'SECOND',
        row_hash: 'hash-b'
    };

    const stats = await upsertRecords(pool, 'google_sheet_ar_int_records', [recordA, recordB]);
    assert.strictEqual(stats.inserted, 1);
    assert.strictEqual(stats.updated, 1);
    assert.strictEqual(calls.filter(call => call.sql.includes('INSERT INTO')).length, 1);
    assert.strictEqual(calls.filter(call => call.sql.includes('UPDATE `google_sheet_ar_int_records` SET')).length, 1);
    assert.ok(calls.some(call => call.sql.includes('`jb_id`')));
    assert.strictEqual(calls.some(call => call.sql.includes('`job_id`')), false);

    console.log('recordRepository.test.js passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});