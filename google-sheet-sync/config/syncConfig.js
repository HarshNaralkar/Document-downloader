function parseGoogleSheetUrl(sheetUrl) {
    if (!sheetUrl) return {};

    const match = String(sheetUrl).match(/\/spreadsheets\/d\/([^/]+)/);
    const sheetId = match ? match[1] : '';

    let gid = '';
    try {
        const url = new URL(sheetUrl);
        gid = url.searchParams.get('gid') || '';
        if (!gid && url.hash) {
            const hashMatch = url.hash.match(/gid=([^&]+)/);
            gid = hashMatch ? hashMatch[1] : '';
        }
    } catch (error) {
        const gidMatch = String(sheetUrl).match(/[?#&]gid=([^&]+)/);
        gid = gidMatch ? gidMatch[1] : '';
    }

    return { sheetId, gid };
}

function normalizeTableName(value) {
    return `google_sheet_${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_records`;
}

function defaultTabs() {
    return [
        { name: 'AR INT', tableName: 'google_sheet_ar_int_records' },
        { name: 'ROYAL SKY INT', tableName: 'google_sheet_royal_sky_int_records' },
        { name: 'VIVAN 2024', tableName: 'google_sheet_vivan_2024_records' },
        { name: 'SNS GLOBAL SERVICE', tableName: 'google_sheet_sns_global_service_records' },
        { name: 'GREENVALLY', tableName: 'google_sheet_greenvally_records' }
    ];
}

function parseTabs(value) {
    if (!value) return defaultTabs();

    return String(value)
        .split(',')
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => ({ name, tableName: normalizeTableName(name) }));
}

function loadSyncConfig(env = process.env) {
    const parsedSheetUrl = parseGoogleSheetUrl(env.GOOGLE_WORKER_SHEET_URL || '');

    return {
        mysql: {
            host: env.MYSQL_HOST || 'localhost',
            port: Number(env.MYSQL_PORT || 3306),
            user: env.MYSQL_USER || 'root',
            password: env.MYSQL_PASSWORD || '',
            database: env.MYSQL_DB || 'google_sheet_sync',
            connectionLimit: Number(env.MYSQL_CONNECTION_LIMIT || 10)
        },
        googleSheet: {
            sheetUrl: env.GOOGLE_WORKER_SHEET_URL || '',
            sheetId: env.GOOGLE_WORKER_SHEET_ID || parsedSheetUrl.sheetId || '',
            sheetName: env.GOOGLE_WORKER_SHEET_NAME || '',
            gid: env.GOOGLE_WORKER_SHEET_GID || parsedSheetUrl.gid || '',
            csvUrl: env.GOOGLE_WORKER_SHEET_CSV_URL || '',
            serviceAccountKeyFile: env.GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE || env.GOOGLE_APPLICATION_CREDENTIALS || '',
            skipTopRows: Number(env.GOOGLE_WORKER_SKIP_TOP_ROWS || 0),
            autoDetectFirstDataRow: env.GOOGLE_WORKER_AUTO_DETECT_FIRST_DATA_ROW !== 'false',
            dateFrom: env.GOOGLE_WORKER_DATE_FROM || '2026-01-01',
            tabs: parseTabs(env.GOOGLE_WORKER_SHEET_TABS)
        },
        sync: {
            webhookSecret: env.GOOGLE_WORKER_SYNC_SECRET || '',
            intervalMs: Number(env.GOOGLE_WORKER_SYNC_INTERVAL_MS || 180000),
            deactivateMissing: env.GOOGLE_WORKER_DEACTIVATE_MISSING !== 'false',
            autoSync: env.GOOGLE_WORKER_AUTO_SYNC !== 'false',
            runOnStart: env.GOOGLE_WORKER_RUN_ON_START !== 'false'
        }
    };
}

module.exports = {
    defaultTabs,
    loadSyncConfig,
    normalizeTableName,
    parseGoogleSheetUrl,
    parseTabs
};