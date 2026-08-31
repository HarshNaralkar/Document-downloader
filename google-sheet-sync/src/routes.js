const express = require('express');
const { formatError } = require('./errorUtils');
const { GoogleSheetSyncService, normalizeTabName } = require('./syncService');
const {
    getRecordById,
    getSyncStatus,
    initSchema,
    searchRecords
} = require('./recordRepository');

function requireSyncSecret(config, req, res, next) {
    const expected = config.sync.webhookSecret;
    if (!expected) return next();

    const provided = req.get('X-Sheet-Sync-Secret') || req.body.secret || req.query.secret;
    if (provided !== expected) {
        return res.status(401).json({ success: false, message: 'Invalid sync secret' });
    }

    next();
}

function getAllowedTab(config, tabName) {
    const normalized = normalizeTabName(tabName);
    if (!normalized) return null;
    return config.googleSheet.tabs.find(tab => normalizeTabName(tab.name) === normalized) || null;
}

async function searchAcrossTabs(pool, config, filters) {
    const tabName = filters.tab || filters.sheetName || filters.tabName;
    const targetTabs = tabName
        ? [getAllowedTab(config, tabName)].filter(Boolean)
        : config.googleSheet.tabs;

    if (tabName && targetTabs.length === 0) {
        const allowed = config.googleSheet.tabs.map(tab => tab.name).join(', ');
        throw new Error(`Unsupported sheet tab: ${tabName}. Allowed tabs: ${allowed}`);
    }

    const results = [];
    for (const tab of targetTabs) {
        const rows = await searchRecords(pool, tab.tableName, filters);
        rows.forEach(row => {
            row._tabName = tab.name;
            row._tableName = tab.tableName;
        });
        results.push(...rows);
    }

    // Sort combined results by date ascending, then by source row order
    results.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.source_row_start || 0) - (b.source_row_start || 0);
    });

    return results;
}

function createGoogleSheetSyncRouter({ pool, config, loginRequired } = {}) {
    if (!pool) throw new Error('pool is required');
    if (!config) throw new Error('config is required');

    const router = express.Router();
    const service = new GoogleSheetSyncService({ pool, config });
    const protect = loginRequired || ((req, res, next) => next());

    router.get('/status', protect, async (req, res) => {
        try {
            await initSchema(pool, config.googleSheet.tabs);
            res.json({ success: true, data: await getSyncStatus(pool, config.googleSheet.tabs) });
        } catch (error) {
            res.status(500).json({ success: false, error: formatError(error) });
        }
    });

    router.post('/sync', protect, (req, res, next) => requireSyncSecret(config, req, res, next), async (req, res) => {
        try {
            const result = await service.syncAllFromGoogleSheet('api');
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: formatError(error) });
        }
    });

    router.post('/sync/from-payload', (req, res, next) => requireSyncSecret(config, req, res, next), async (req, res) => {
        try {
            let result;
            if (Array.isArray(req.body.sheets)) {
                result = await service.syncSheetsFromPayload(req.body.sheets, 'apps-script');
            } else {
                const rows = req.body.rows || req.body.values;
                const tabName = req.body.sheetName || req.body.tabName || req.body.name;
                if (!Array.isArray(rows)) {
                    return res.status(400).json({ success: false, message: 'rows array is required' });
                }
                if (!tabName) {
                    return res.status(400).json({ success: false, message: 'sheetName is required when sending one tab' });
                }
                result = await service.syncFromRows(rows, tabName, 'apps-script');
            }

            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: formatError(error) });
        }
    });

    router.get('/records', protect, async (req, res) => {
        try {
            await initSchema(pool, config.googleSheet.tabs);
            const records = await searchAcrossTabs(pool, config, {
                tab: req.query.tab,
                q: req.query.q,
                country: req.query.country,
                sponsor_name: req.query.sponsor_name,
                category: req.query.category,
                job_role: req.query.job_role,
                legal_status: req.query.legal_status,
                activeOnly: req.query.activeOnly !== 'false',
                limit: req.query.limit
            });
            res.json({ success: true, data: records });
        } catch (error) {
            res.status(500).json({ success: false, error: formatError(error) });
        }
    });

    router.get('/records/:id', protect, async (req, res) => {
        try {
            await initSchema(pool, config.googleSheet.tabs);
            const tab = getAllowedTab(config, req.query.tab);
            if (!tab) {
                return res.status(400).json({ success: false, message: 'Valid tab query is required' });
            }

            const record = await getRecordById(pool, tab.tableName, req.params.id);
            if (!record) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }
            record._tabName = tab.name;
            record._tableName = tab.tableName;
            res.json({ success: true, data: record });
        } catch (error) {
            res.status(500).json({ success: false, error: formatError(error) });
        }
    });

    return router;
}

module.exports = {
    createGoogleSheetSyncRouter,
    getAllowedTab
};