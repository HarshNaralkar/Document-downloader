const axios = require('axios');
const { parse } = require('csv-parse/sync');
const { getAccessToken } = require('./serviceAccountAuth');

function buildCsvUrl(sheetConfig) {
    if (sheetConfig.csvUrl) return sheetConfig.csvUrl;
    if (!sheetConfig.sheetId) {
        throw new Error('GOOGLE_WORKER_SHEET_URL, GOOGLE_WORKER_SHEET_ID, or GOOGLE_WORKER_SHEET_CSV_URL is required');
    }

    const base = `https://docs.google.com/spreadsheets/d/${sheetConfig.sheetId}/gviz/tq?tqx=out:csv`;
    if (sheetConfig.sheetName) {
        return `${base}&sheet=${encodeURIComponent(sheetConfig.sheetName)}`;
    }
    if (sheetConfig.gid) {
        return `${base}&gid=${encodeURIComponent(sheetConfig.gid)}`;
    }
    return base;
}

function buildSheetsApiUrl(sheetConfig) {
    if (!sheetConfig.sheetId) {
        throw new Error('GOOGLE_WORKER_SHEET_URL or GOOGLE_WORKER_SHEET_ID is required');
    }
    if (!sheetConfig.sheetName) {
        throw new Error('sheetName is required for Google Sheets API reads');
    }

    const range = `'${String(sheetConfig.sheetName).replace(/'/g, "''")}'!A:K`;
    return `https://sheets.googleapis.com/v4/spreadsheets/${sheetConfig.sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
}

function parseRawCsv(csvText) {
    return parse(csvText, {
        columns: false,
        skip_empty_lines: false,
        relax_column_count: true,
        trim: false
    });
}

function normalizeApiRows(rows) {
    return (rows || []).map(row => {
        const normalized = Array.isArray(row) ? [...row] : [];
        while (normalized.length < 11) normalized.push('');
        return normalized;
    });
}

function removeSkippedRows(rows, skipTopRows) {
    const count = Number(skipTopRows || 0);
    if (!count) return rows;
    return rows.slice(count);
}

async function fetchRowsFromSheetsApi(sheetConfig) {
    const accessToken = await getAccessToken(sheetConfig.serviceAccountKeyFile);
    const response = await axios.get(buildSheetsApiUrl(sheetConfig), {
        timeout: 30000,
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    return normalizeApiRows(response.data.values || []);
}

async function fetchRowsFromPublicCsv(sheetConfig) {
    const csvUrl = buildCsvUrl(sheetConfig);
    const response = await axios.get(csvUrl, {
        timeout: 30000,
        responseType: 'text',
        headers: {
            'User-Agent': 'document-generator-google-sheet-sync/1.0'
        }
    });

    return parseRawCsv(response.data);
}

async function fetchRawSheetRows(sheetConfig) {
    if (sheetConfig.serviceAccountKeyFile) {
        return fetchRowsFromSheetsApi(sheetConfig);
    }

    return fetchRowsFromPublicCsv(sheetConfig);
}

module.exports = {
    buildCsvUrl,
    buildSheetsApiUrl,
    fetchRawSheetRows,
    fetchRowsFromPublicCsv,
    fetchRowsFromSheetsApi,
    normalizeApiRows,
    parseRawCsv,
    removeSkippedRows
};