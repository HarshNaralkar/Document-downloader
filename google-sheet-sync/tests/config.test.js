const assert = require('assert');
const {
    defaultTabs,
    loadSyncConfig,
    normalizeTableName,
    parseGoogleSheetUrl,
    parseTabs
} = require('../config/syncConfig');
const { buildCsvUrl, buildSheetsApiUrl, normalizeApiRows, removeSkippedRows } = require('../src/googleSheetClient');

const url = 'https://docs.google.com/spreadsheets/d/1ABCdefGHI123/edit?gid=987654321#gid=987654321';
const parsed = parseGoogleSheetUrl(url);

assert.strictEqual(parsed.sheetId, '1ABCdefGHI123');
assert.strictEqual(parsed.gid, '987654321');
assert.strictEqual(normalizeTableName('SNS GLOBAL SERVICE'), 'google_sheet_sns_global_service_records');
assert.deepStrictEqual(defaultTabs().map(tab => tab.name), [
    'AR INT',
    'ROYAL SKY INT',
    'VIVAN 2024',
    'SNS GLOBAL SERVICE'
]);
assert.deepStrictEqual(parseTabs('A Tab,B Tab'), [
    { name: 'A Tab', tableName: 'google_sheet_a_tab_records' },
    { name: 'B Tab', tableName: 'google_sheet_b_tab_records' }
]);

const config = loadSyncConfig({
    GOOGLE_WORKER_SHEET_URL: url,
    GOOGLE_WORKER_SKIP_TOP_ROWS: '2',
    GOOGLE_WORKER_DATE_FROM: '2026-01-01',
    GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE: 'google-sheet-sync/key/example.json',
    MYSQL_HOST: 'localhost',
    MYSQL_PORT: '3307',
    MYSQL_USER: 'root',
    MYSQL_DB: 'google_sheet_sync',
    GOOGLE_WORKER_AUTO_SYNC: 'true',
    GOOGLE_WORKER_RUN_ON_START: 'false'
});

assert.strictEqual(config.mysql.port, 3307);
assert.strictEqual(config.googleSheet.sheetId, '1ABCdefGHI123');
assert.strictEqual(config.googleSheet.gid, '987654321');
assert.strictEqual(config.googleSheet.skipTopRows, 2);
assert.strictEqual(config.googleSheet.dateFrom, '2026-01-01');
assert.strictEqual(config.googleSheet.serviceAccountKeyFile, 'google-sheet-sync/key/example.json');
assert.strictEqual(config.sync.autoSync, true);
assert.strictEqual(config.sync.runOnStart, false);
assert.strictEqual(config.googleSheet.tabs.length, 4);
assert.strictEqual(
    buildCsvUrl(config.googleSheet),
    'https://docs.google.com/spreadsheets/d/1ABCdefGHI123/gviz/tq?tqx=out:csv&gid=987654321'
);
assert.strictEqual(
    buildCsvUrl({ ...config.googleSheet, sheetName: 'AR INT', gid: '' }),
    'https://docs.google.com/spreadsheets/d/1ABCdefGHI123/gviz/tq?tqx=out:csv&sheet=AR%20INT'
);
assert.strictEqual(
    buildSheetsApiUrl({ ...config.googleSheet, sheetName: 'AR INT' }),
    "https://sheets.googleapis.com/v4/spreadsheets/1ABCdefGHI123/values/'AR%20INT'!A%3AK?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING"
);
assert.deepStrictEqual(normalizeApiRows([['a'], ['b', 'c']]).map(row => row.length), [11, 11]);
assert.deepStrictEqual(removeSkippedRows([[1], [2], [3]], 2), [[3]]);

console.log('config.test.js passed');