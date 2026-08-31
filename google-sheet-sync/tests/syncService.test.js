const assert = require('assert');
const { loadSyncConfig } = require('../config/syncConfig');
const { GoogleSheetSyncService, findFirstDataRowIndex } = require('../src/syncService');

const config = loadSyncConfig({
    MYSQL_HOST: 'localhost',
    MYSQL_USER: 'root',
    MYSQL_DB: 'google_sheet_sync',
    GOOGLE_WORKER_DATE_FROM: '2026-01-01'
});

const service = new GoogleSheetSyncService({
    pool: { query: async () => [] },
    config
});

const tab = service.getTab('VIVAN 2024');
assert.strictEqual(tab.tableName, 'google_sheet_vivan_2024_records');

assert.strictEqual(findFirstDataRowIndex([
    ['date'],
    ['sr no'],
    ['broker name'],
    ['31-12-2025'],
    ['01-01-2026']
], '2026-01-01'), 4);

const prepared = service.prepareRows([
    ['date'],
    ['sr no'],
    ['broker name'],
    ['01-01-2026', '', 'FIRST']
]);
assert.strictEqual(prepared.skippedTopRows, 3);
assert.strictEqual(prepared.firstDataRowNumber, 4);
assert.deepStrictEqual(prepared.rows, [['01-01-2026', '', 'FIRST']]);

const filtered = service.filterRecordsByDate([
    { date: '2025-12-31', ppt_name: 'OLD' },
    { date: '2026-01-01', ppt_name: 'START' },
    { date: '2026-08-29', ppt_name: 'NEW' },
    { date: '', ppt_name: 'NO DATE' }
], '2026-01-01');

assert.strictEqual(filtered.filteredBeforeDate, 2);
assert.deepStrictEqual(filtered.records.map(record => record.ppt_name), ['START', 'NEW']);
assert.throws(() => service.getTab('UNKNOWN TAB'), /Unsupported sheet tab/);

console.log('syncService.test.js passed');