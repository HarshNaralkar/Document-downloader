const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { loadSyncConfig } = require('../config/syncConfig');
const { formatError } = require('./errorUtils');
const { fetchRawSheetRows } = require('./googleSheetClient');

async function main() {
    const config = loadSyncConfig();
    const result = [];

    for (const tab of config.googleSheet.tabs) {
        const rows = await fetchRawSheetRows({
            ...config.googleSheet,
            sheetName: tab.name,
            gid: ''
        });
        result.push({
            tabName: tab.name,
            tableName: tab.tableName,
            rowsRead: rows.length,
            firstRowPreview: rows[0] || []
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

module.exports = { main };