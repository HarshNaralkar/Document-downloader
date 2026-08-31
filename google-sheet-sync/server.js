const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const { createReadyPoolFromEnv } = require('./db/createPool');
const { loadSyncConfig } = require('./config/syncConfig');
const { createGoogleSheetSyncRouter } = require('./src/routes');
const { createSearchRouter } = require('./src/searchRoutes');
const { startGoogleSheetSyncScheduler } = require('./src/scheduler');

async function startServer() {
    const app = express();
    const config = loadSyncConfig();
    const pool = await createReadyPoolFromEnv();
    const port = Number(process.env.GOOGLE_WORKER_SYNC_PORT || 5200);
    let scheduler = null;

    app.use(express.json({ limit: process.env.GOOGLE_WORKER_JSON_LIMIT || '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: process.env.GOOGLE_WORKER_JSON_LIMIT || '50mb' }));

    app.get('/health', (req, res) => {
        res.json({
            success: true,
            service: 'google-sheet-sync',
            autoSync: config.sync.autoSync,
            intervalMs: config.sync.intervalMs,
            dateFrom: config.googleSheet.dateFrom,
            tabs: config.googleSheet.tabs.map(tab => ({ name: tab.name, tableName: tab.tableName }))
        });
    });

    app.use('/api/google-sheet-sync', createGoogleSheetSyncRouter({ pool, config }));
    app.use('/search', createSearchRouter({ pool, config }));

    // Ensure sponsor_name index exists for fast sponsor search
    (async () => {
        for (const tab of config.googleSheet.tabs) {
            try {
                await pool.query(`ALTER TABLE \`${tab.tableName}\` ADD INDEX idx_sponsor_name (sponsor_name)`);
            } catch (e) {
                // Index already exists (ER_DUP_KEYNAME) — ignore
            }
        }
    })().catch(() => {});

    const server = app.listen(port, () => {
        console.log(`Google Sheet Sync server running on http://127.0.0.1:${port}`);
        console.log('Direct sync endpoint: /api/google-sheet-sync/sync');
        console.log('Status endpoint: /api/google-sheet-sync/status');
        console.log(`Sponsor Search page: http://127.0.0.1:${port}/search`);

        if (config.sync.autoSync) {
            scheduler = startGoogleSheetSyncScheduler({
                pool,
                config,
                onResult: result => console.log('[Google Sheet Sync]', JSON.stringify(result.totals || result)),
                onError: error => console.error('[Google Sheet Sync Error]', error.message || error)
            });
            console.log(`Auto sync enabled every ${config.sync.intervalMs} ms`);
        } else {
            console.log('Auto sync disabled by GOOGLE_WORKER_AUTO_SYNC=false');
        }
    });

    server.on('error', async error => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. The sync server is probably already running.`);
            console.error(`Open http://127.0.0.1:${port}/health to check it, or change GOOGLE_WORKER_SYNC_PORT in google-sheet-sync/.env.`);
        } else {
            console.error(error);
        }

        if (scheduler) scheduler.stop();
        await pool.end().catch(() => {});
        process.exitCode = 1;
    });

    async function shutdown() {
        if (scheduler) scheduler.stop();
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return { app, server, pool, config, scheduler };
}

if (require.main === module) {
    startServer().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { startServer };