const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { loadSyncConfig } = require('../config/syncConfig');
const { createReadyPoolFromEnv } = require('../db/createPool');
const { formatError } = require('./errorUtils');
const { getTableCounts, initSchema } = require('./recordRepository');

async function main() {
    const config = loadSyncConfig();
    const pool = await createReadyPoolFromEnv();

    try {
        await initSchema(pool, config.googleSheet.tabs);

        const tables = [];
        for (const tab of config.googleSheet.tabs) {
            tables.push({
                tabName: tab.name,
                tableName: tab.tableName,
                records: await getTableCounts(pool, tab.tableName)
            });
        }

        console.log(JSON.stringify({
            success: true,
            mysql: {
                host: config.mysql.host,
                port: config.mysql.port,
                database: config.mysql.database
            },
            tables
        }, null, 2));
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