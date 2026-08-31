const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { loadSyncConfig } = require('../config/syncConfig');
const { formatError } = require('./errorUtils');
const { fetchRawSheetRows } = require('./googleSheetClient');
const { findFirstDataRowIndex } = require('./syncService');
const { normalizeSheetRows } = require('./threeRowNormalizer');

function findDuplicateKeys(records) {
    const counts = new Map();
    for (const record of records) {
        counts.set(record.source_key, (counts.get(record.source_key) || 0) + 1);
    }

    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([sourceKey, count]) => ({ sourceKey, count }))
        .slice(0, 25);
}

function createRecordPreview(record) {
    return {
        sourceRowStart: record.source_row_start,
        sourceRowEnd: record.source_row_end,
        sourceKey: record.source_key,
        date: record.date,
        srNo: record.sr_no,
        brokerName: record.broker_name,
        pptName: record.ppt_name,
        pptNumber: record.ppt_number,
        enNumber: record.en_number,
        dob: record.dob,
        pptAddress: record.ppt_address,
        pptIssueDate: record.ppt_issue_date,
        pptIssuePlace: record.ppt_issue_place,
        pptExpiryDate: record.ppt_expiry_date,
        country: record.country,
        category: record.category,
        salary: record.salary,
        sponsorPhoneNumber: record.sponsor_phone_number,
        sponsorName: record.sponsor_name,
        sponsorAddress: record.sponsor_address,
        jbId: record.jb_id,
        jobRole: record.job_role,
        visaNumber: record.visa_number,
        visaIssueDate: record.visa_issue_date,
        visaExpiryDate: record.visa_expiry_date,
        fatherName: record.father_name,
        motherName: record.mother_name,
        legalStatus: record.legal_status,
        idName: record.id_name,
        idNumber: record.id_number,
        feNumber: record.fe_number,
        dmNumber: record.dm_number,
        crNumber: record.cr_number
    };
}

function prepareRows(rows, config) {
    let startIndex = Number(config.googleSheet.skipTopRows || 0);
    if (!startIndex && config.googleSheet.autoDetectFirstDataRow) {
        startIndex = findFirstDataRowIndex(rows, config.googleSheet.dateFrom);
    }

    return {
        rows: rows.slice(startIndex),
        firstDataRowNumber: startIndex + 1,
        skippedTopRows: startIndex
    };
}

async function main() {
    const config = loadSyncConfig();
    const result = [];

    for (const tab of config.googleSheet.tabs) {
        const rawRows = await fetchRawSheetRows({
            ...config.googleSheet,
            sheetName: tab.name,
            gid: ''
        });
        const prepared = prepareRows(rawRows, config);
        const normalized = normalizeSheetRows(prepared.rows, {
            firstDataRowNumber: prepared.firstDataRowNumber
        });
        const kept = normalized.records.filter(record => record.date && record.date >= config.googleSheet.dateFrom);

        result.push({
            tabName: tab.name,
            tableName: tab.tableName,
            rawRows: rawRows.length,
            skippedTopRows: prepared.skippedTopRows,
            firstDataRowNumber: prepared.firstDataRowNumber,
            normalizedRecords: normalized.records.length,
            recordsOnOrAfterDate: kept.length,
            warnings: normalized.warnings.length,
            warningSamples: normalized.warnings.slice(0, 10),
            duplicateSourceKeys: findDuplicateKeys(kept),
            recordSamples: kept.slice(0, 3).map(createRecordPreview)
        });
    }

    console.log(JSON.stringify({ success: true, result }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(JSON.stringify({ success: false, error: formatError(error) }, null, 2));
        process.exitCode = 1;
    });
}

module.exports = { createRecordPreview, findDuplicateKeys, main };