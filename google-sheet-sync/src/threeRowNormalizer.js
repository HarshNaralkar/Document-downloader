const crypto = require('crypto');
const { sheetMapping } = require('../config/sheetMapping');
const { normalizeDate } = require('./dateUtils');

function cleanCell(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function hasAnyValue(row) {
    return Array.isArray(row) && row.some(cell => cleanCell(cell) !== '');
}

function pick(group, rowIndex, colIndex) {
    const row = group[rowIndex] || [];
    return cleanCell(row[colIndex]);
}

function normalizeKeyPart(value) {
    return cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hasLetterAndDigit(value) {
    const text = cleanCell(value);
    return /[a-z]/i.test(text) && /\d/.test(text);
}

function isHeaderLike(value) {
    return /^(passport|ppt|pp|dob|country|category|name|address|date|sr\s*no|blank)$/i.test(cleanCell(value));
}

function isValidPptNumber(value) {
    const text = cleanCell(value).replace(/\s+/g, '');
    if (!text || isHeaderLike(text)) return false;
    if (text.length < 5) return false;
    if (/^\d{1,4}$/.test(text)) return false;
    return hasLetterAndDigit(text) || /^\d{6,}$/.test(text);
}

function isValidEnNumber(value) {
    const text = cleanCell(value).replace(/\s+/g, '');
    if (!text || isHeaderLike(text)) return false;
    if (text.length < 5) return false;
    if (/^\d{1,4}$/.test(text)) return false;
    return hasLetterAndDigit(text) || /^\d{6,}$/.test(text);
}

function isValidName(value) {
    const text = cleanCell(value);
    if (!text || isHeaderLike(text)) return false;
    if (text.length < 3) return false;
    return /[a-z]/i.test(text);
}

function createSourceKey(record, context = {}) {
    // Always use row position as the source key.
    // This ensures that when any field in a record is updated in the sheet,
    // the same database row gets updated instead of creating a duplicate.
    if (context.sourceRowStart) {
        return 'row:' + context.sourceRowStart;
    }

    return null;
}

function createRowHash(record, rawData) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({ record, rawData }))
        .digest('hex');
}

function splitBySeparator(value, separator) {
    const text = cleanCell(value);
    if (!text) return ['', ''];

    const index = text.indexOf(separator);
    if (index === -1) return [text, ''];

    return [
        cleanCell(text.slice(0, index)),
        cleanCell(text.slice(index + separator.length))
    ];
}

function applySplitFields(record, splitFields = []) {
    for (const splitField of splitFields) {
        const parts = splitBySeparator(record[splitField.sourceColumn], splitField.separator || '-');

        splitField.targetColumns.forEach((column, index) => {
            record[column] = parts[index] || '';
        });

        if (!splitField.keepSource) {
            delete record[splitField.sourceColumn];
        }
    }
}

function isGroupCompletelyEmpty(group) {
    return group.every(row => !hasAnyValue(row));
}

function normalizeSheetRows(rows, options = {}) {
    const mapping = options.mapping || sheetMapping;
    const firstDataRowNumber = Number(options.firstDataRowNumber || mapping.firstDataRowNumber || 1);
    const rowsPerRecord = Number(mapping.rowsPerRecord || 3);
    const warnings = [];

    const allRows = (rows || [])
        .map(row => Array.isArray(row) ? row : []);

    const records = [];
    let currentRecordDate = null;
    let readRows = 0;

    for (let index = 0; index < allRows.length; index += rowsPerRecord) {
        const group = allRows.slice(index, index + rowsPerRecord);
        const sourceRowStart = firstDataRowNumber + index;
        const sourceRowEnd = sourceRowStart + group.length - 1;

        if (group.length < rowsPerRecord) {
            // Don't warn about incomplete groups if they are completely empty (trailing blank rows)
            if (!isGroupCompletelyEmpty(group)) {
                warnings.push({
                    type: 'incomplete_group',
                    sourceRowStart,
                    sourceRowEnd,
                    message: `Expected ${rowsPerRecord} rows, found ${group.length}`
                });
            }
            continue;
        }

        // Silently skip completely empty 3-row blocks (spacer rows, deleted records, etc.)
        if (isGroupCompletelyEmpty(group)) {
            continue;
        }

        readRows += rowsPerRecord;

        const record = {};
        for (const field of mapping.fields) {
            const rawValue = pick(group, field.row, field.col);
            record[field.column] = field.type === 'date' ? normalizeDate(rawValue) : rawValue;
        }

        if (record.date) {
            currentRecordDate = record.date;
        } else if (currentRecordDate) {
            record.date = currentRecordDate;
        }

        applySplitFields(record, mapping.splitFields || []);

        const rawData = {
            row1: group[0],
            row2: group[1],
            row3: group[2]
        };

        const sourceKey = createSourceKey(record, { sourceRowStart });
        if (!sourceKey) {
            warnings.push({
                type: 'missing_identity',
                sourceRowStart,
                sourceRowEnd,
                pptName: record.ppt_name || '',
                pptNumber: record.ppt_number || '',
                enNumber: record.en_number || '',
                message: 'Skipped record because no usable row identity was available'
            });
            continue;
        }

        record.source_row_start = sourceRowStart;
        record.source_row_end = sourceRowEnd;
        record.raw_data = rawData;
        record.source_key = sourceKey;
        record.row_hash = createRowHash(record, rawData);

        records.push(record);
    }

    return {
        records,
        warnings,
        readRows
    };
}

module.exports = {
    cleanCell,
    createSourceKey,
    isValidEnNumber,
    isValidPptNumber,
    normalizeSheetRows,
    splitBySeparator
};