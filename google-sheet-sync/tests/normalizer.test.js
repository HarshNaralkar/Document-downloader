const assert = require('assert');
const {
    createSourceKey,
    normalizeSheetRows,
    splitBySeparator,
    isValidPptNumber
} = require('../src/threeRowNormalizer');
const { normalizeDate } = require('../src/dateUtils');

const rows = [
    ['27.06.2026', 'RAJENDRA KUMAR', 'AH040768-EN15977435', '12.06.1984', '', '9658458998', 'JB24851886', 'VISA123', 'FATHER NAME', 'LEGAL OK'],
    ['2', 'VILL THITHAWATA', '24.10.2025', 'JAIPUR', 'KUWAIT', 'DRIVER-120', 'SPONSOR NAME', '15.02.2026', '', 'ID NAME'],
    ['BROKER NAME', 'JOB ROLE', '10.03.2036', 'FE6763133', 'DM3091074', 'PO Box', 'CR1572834', '20.02.2028', 'MOTHER NAME', 'ID284173240']
];

const result = normalizeSheetRows(rows);

assert.strictEqual(result.records.length, 1);
assert.strictEqual(result.warnings.length, 0);
assert.strictEqual(result.records[0].date, '2026-06-27');
assert.strictEqual(result.records[0].sr_no, '2');
assert.strictEqual(result.records[0].broker_name, 'BROKER NAME');
assert.strictEqual(result.records[0].ppt_name, 'RAJENDRA KUMAR');
assert.strictEqual(result.records[0].ppt_address, 'VILL THITHAWATA');
assert.strictEqual(result.records[0].ppt_number, 'AH040768');
assert.strictEqual(result.records[0].en_number, 'EN15977435');
assert.strictEqual(result.records[0].dob, '1984-06-12');
assert.strictEqual(result.records[0].country, 'KUWAIT');
assert.strictEqual(result.records[0].category, 'DRIVER');
assert.strictEqual(result.records[0].salary, '120');
assert.strictEqual(result.records[0].sponsor_phone_number, '9658458998');
assert.strictEqual(result.records[0].sponsor_name, 'SPONSOR NAME');
assert.strictEqual(result.records[0].sponsor_address, 'PO Box');
assert.strictEqual(result.records[0].jb_id, 'JB24851886');
assert.strictEqual(result.records[0].visa_number, 'VISA123');
assert.strictEqual(result.records[0].visa_issue_date, '2026-02-15');
assert.strictEqual(result.records[0].visa_expiry_date, '2028-02-20');
assert.strictEqual(result.records[0].father_name, 'FATHER NAME');
assert.strictEqual(result.records[0].mother_name, 'MOTHER NAME');
assert.strictEqual(result.records[0].legal_status, 'LEGAL OK');
assert.strictEqual(result.records[0].id_name, 'ID NAME');
assert.strictEqual(result.records[0].id_number, 'ID284173240');
assert.strictEqual(result.records[0].source_key, 'row:1');
assert.ok(result.records[0].row_hash);
assert.deepStrictEqual(result.records[0].raw_data.row1, rows[0]);
assert.deepStrictEqual(splitBySeparator('A-B-C', '-'), ['A', 'B-C']);
assert.strictEqual(isValidPptNumber('02'), false);
assert.strictEqual(isValidPptNumber('PASSPORT'), false);
assert.strictEqual(isValidPptNumber('AH040768'), true);
assert.strictEqual(normalizeDate('16.07.2026'), '2026-07-16');
assert.strictEqual(normalizeDate('2026.07.16'), '2026-07-16');

const carriedDateRows = [
    ['16.07.2026', 'RAHAMAN AAKAN', 'AA111111-EN111111', '01.01.1990', '', '', '', '', '', ''],
    ['1', 'JOYCHANDIPUR SOUTH', '', '', 'INDIA', 'CLEANER-1200', 'SPONSOR ONE', '', '', ''],
    ['GOBINDA', 'AIR CONDITION ASSISTANT', '', '', '', '', '', '', '', ''],
    ['', 'BALWINDER SINGH', 'BB222222-EN222222', '02.02.1991', '', '', '', '', '', ''],
    ['2', 'VPO RATAINDA', '', '', 'INDIA', 'LIGHT VEHICLE DRIVER-1500', 'SPONSOR TWO', '', '', ''],
    ['MAMTA RIGHTS', 'LIGHT VEHICLE DRIVER', '', '', '', '', '', '', '', ''],
    ['', 'AMIT GHOSH', 'CC333333-EN333333', '03.03.1992', '', '', '', '', '', ''],
    ['3', 'VILL CHANDPUR', '', '', 'INDIA', 'GOLDSMITH-1600', 'SPONSOR THREE', '', '', ''],
    ['GOBINDA', 'GOLDSMITH', '', '', '', '', '', '', '', ''],
    ['17.07.2026', 'KRISHNA DE', 'DD444444-EN444444', '04.04.1993', '', '', '', '', '', ''],
    ['1', 'HNO 13', '', '', 'INDIA', 'CLEANER-1200', 'SPONSOR FOUR', '', '', ''],
    ['SK TRAVEL KAREEM', 'PUBLIC FACILITIES CLEANER', '', '', '', '', '', '', '', '']
];
const carriedDateResult = normalizeSheetRows(carriedDateRows);
assert.strictEqual(carriedDateResult.records.length, 4);
assert.deepStrictEqual(carriedDateResult.records.map(record => record.date), [
    '2026-07-16',
    '2026-07-16',
    '2026-07-16',
    '2026-07-17'
]);
assert.deepStrictEqual(carriedDateResult.records.map(record => record.sr_no), ['1', '2', '3', '1']);
assert.deepStrictEqual(carriedDateResult.records.map(record => record.ppt_name), [
    'RAHAMAN AAKAN',
    'BALWINDER SINGH',
    'AMIT GHOSH',
    'KRISHNA DE'
]);

const rowIdentity = normalizeSheetRows([
    ['02.01.2026', '', '02', '', '', '', '', '', '', ''],
    ['3', '', '', '', '', '', '', '', '', ''],
    ['BROKER', '', '', '', '', '', '', '', '', '']
]);
assert.strictEqual(rowIdentity.records.length, 1);
assert.strictEqual(rowIdentity.records[0].source_key, 'row:1');
assert.strictEqual(rowIdentity.records[0].date, '2026-01-02');
assert.strictEqual(rowIdentity.warnings.length, 0);
assert.strictEqual(createSourceKey({ ppt_number: '02' }), null);
assert.strictEqual(createSourceKey({ ppt_number: 'AH040768' }, { sourceRowStart: 5 }), 'row:5');

console.log('normalizer.test.js passed');