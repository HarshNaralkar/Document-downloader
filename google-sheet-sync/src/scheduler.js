const { GoogleSheetSyncService } = require('./syncService');
const { formatErrorMessage } = require('./errorUtils');

function startGoogleSheetSyncScheduler({ pool, config, onResult, onError }) {
    const intervalMs = Number(config.sync.intervalMs || 300000);
    const runOnStart = config.sync.runOnStart !== false;
    const service = new GoogleSheetSyncService({ pool, config });
    let running = false;
    let stopped = false;

    async function runScheduledSync(reason = 'scheduled') {
        if (running || stopped) {
            return { skipped: true, reason: running ? 'already_running' : 'stopped' };
        }

        running = true;
        try {
            const result = await service.syncFromGoogleSheet(reason);
            if (onResult) onResult(result);
            return result;
        } catch (error) {
            if (onError) onError(error);
            return { success: false, error: formatErrorMessage(error) };
        } finally {
            running = false;
        }
    }

    const timer = setInterval(() => {
        runScheduledSync('scheduled');
    }, intervalMs);

    if (runOnStart) {
        setTimeout(() => {
            runScheduledSync('startup');
        }, 1000);
    }

    return {
        runNow: runScheduledSync,
        stop: () => {
            stopped = true;
            clearInterval(timer);
        }
    };
}

module.exports = { startGoogleSheetSyncScheduler };