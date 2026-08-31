const assert = require('assert');
const { sheetMapping } = require('../config/sheetMapping');

const expectedCells = [
    ['date', 0, 0],
    ['sr_no', 1, 0],
    ['broker_name', 2, 0],
    ['ppt_name', 0, 1],
    ['ppt_address', 1, 1],
    ['job_role', 2, 1],
    ['ppt_number_en_number', 0, 2],
    ['ppt_issue_date', 1, 2],
    ['ppt_expiry_date', 2, 2],
    ['dob', 0, 3],
    ['ppt_issue_place', 1, 3],
    ['fe_number', 2, 3],
    ['country', 1, 4],
    ['dm_number', 2, 4],
    ['sponsor_phone_number', 0, 5],
    ['category_salary', 1, 5],
    ['sponsor_address', 2, 5],
    ['jb_id', 0, 6],
    ['sponsor_name', 1, 6],
    ['cr_number', 2, 6],
    ['visa_number', 0, 7],
    ['visa_issue_date', 1, 7],
    ['visa_expiry_date', 2, 7],
    ['father_name', 0, 8],
    ['mother_name', 2, 8],
    ['legal_status', 0, 9],
    ['id_name', 1, 9],
    ['id_number', 2, 9]
];

function findField(column) {
    return sheetMapping.fields.find(field => field.column === column);
}

assert.strictEqual(sheetMapping.rowsPerRecord, 3);

for (const [column, row, col] of expectedCells) {
    const field = findField(column);
    assert.ok(field, `missing mapping for ${column}`);
    assert.strictEqual(field.row, row, `${column} row`);
    assert.strictEqual(field.col, col, `${column} col`);
}

const usedCells = new Set(sheetMapping.fields.map(field => `${field.row}:${field.col}`));
assert.strictEqual(usedCells.has('0:4'), false, 'E1 must stay blank');
assert.strictEqual(usedCells.has('1:8'), false, 'I2 must stay blank');

assert.deepStrictEqual(sheetMapping.splitFields, [
    {
        sourceColumn: 'ppt_number_en_number',
        separator: '-',
        targetColumns: ['ppt_number', 'en_number']
    },
    {
        sourceColumn: 'category_salary',
        separator: '-',
        targetColumns: ['category', 'salary']
    }
]);

console.log('alignment.test.js passed');