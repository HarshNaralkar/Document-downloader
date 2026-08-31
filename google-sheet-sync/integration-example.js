/*
Example only. Do not run this file directly.

Add this to app.js later, after the standalone CLI sync has been tested:

const { createReadyPoolFromEnv } = require('./google-sheet-sync/db/createPool');
const { loadSyncConfig } = require('./google-sheet-sync/config/syncConfig');
const { createGoogleSheetSyncRouter } = require('./google-sheet-sync/src/routes');
const { startGoogleSheetSyncScheduler } = require('./google-sheet-sync/src/scheduler');

const googleSheetSyncConfig = loadSyncConfig();
const googleSheetSyncPool = await createReadyPoolFromEnv();

app.use('/api/google-sheet-sync', createGoogleSheetSyncRouter({
    pool: googleSheetSyncPool,
    config: googleSheetSyncConfig,
    loginRequired
}));

startGoogleSheetSyncScheduler({
    pool: googleSheetSyncPool,
    config: googleSheetSyncConfig,
    onResult: result => console.log('[Google Sheet Sync]', result),
    onError: error => console.error('[Google Sheet Sync]', error)
});
*/
