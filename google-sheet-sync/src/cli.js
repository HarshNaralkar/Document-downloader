const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { loadSyncConfig } = require('../config/syncConfig');
const { createReadyPoolFromEnv } = require('../db/createPool');
const { formatError } = require('./errorUtils');
const { GoogleSheetSyncService } = require('./syncService');

async function main() {
    const config = loadSyncConfig();
    const pool = await createReadyPoolFromEnv();
    const service = new GoogleSheetSyncService({ pool, config });

    try {
        const result = await service.syncFromGoogleSheet('cli');
        console.log(JSON.stringify({ success: true, result }, null, 2));
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(JSON.stringify({ success: false, error: formatError(error) }, null, 2));
        process.exitCode = 1;
    });
}

module.exports = { main };