const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { loadSyncConfig } = require('../config/syncConfig');
const { createReadyPoolFromEnv } = require('../db/createPool');
const { q } = require('./recordRepository');

async function main() {
    const config = loadSyncConfig();
    const pool = await createReadyPoolFromEnv();

    try {
        for (const tab of config.googleSheet.tabs) {
            await pool.query(`TRUNCATE TABLE ${q(tab.tableName)}`);
            console.log(`Cleared ${tab.tableName}`);
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { main };