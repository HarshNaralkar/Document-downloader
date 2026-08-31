const { fetchRawSheetRows } = require('./googleSheetClient');
const { normalizeDate } = require('./dateUtils');
const { formatErrorMessage } = require('./errorUtils');
const { normalizeSheetRows } = require('./threeRowNormalizer');
const {
    beginSyncRun,
    finishSyncRun,
    initSchema,
    upsertRecords
} = require('./recordRepository');

function normalizeTabName(value) {
    return String(value || '').trim().toLowerCase();
}

function createEmptyTotals() {
    return {
        readRows: 0,
        parsedRecords: 0,
        filteredBeforeDate: 0,
        skippedTopRows: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        deactivated: 0,
        warnings: 0
    };
}

function addTotals(totals, stats) {
    for (const key of ['readRows', 'parsedRecords', 'filteredBeforeDate', 'skippedTopRows', 'inserted', 'updated', 'unchanged', 'deactivated']) {
        totals[key] += Number(stats[key] || 0);
    }
    totals.warnings += Array.isArray(stats.warnings) ? stats.warnings.length : 0;
}


async function runInTransaction(pool, work) {
    if (typeof pool.getConnection !== 'function') {
        return work(pool);
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
function findFirstDataRowIndex(rows, dateFrom) {
    for (let index = 0; index < rows.length; index += 1) {
        const rowDate = normalizeDate(Array.isArray(rows[index]) ? rows[index][0] : '');
        if (rowDate && (!dateFrom || rowDate >= dateFrom)) {
            return index;
        }
    }
    return rows.length;
}

class GoogleSheetSyncService {
    constructor({ pool, config }) {
        if (!pool) throw new Error('pool is required');
        if (!config) throw new Error('config is required');

        this.pool = pool;
        this.config = config;
        this.ready = false;
    }

    async ensureReady() {
        if (this.ready) return;
        await initSchema(this.pool, this.config.googleSheet.tabs);
        this.ready = true;
    }

    getTab(tabName) {
        const normalized = normalizeTabName(tabName);
        const tab = this.config.googleSheet.tabs.find(item => normalizeTabName(item.name) === normalized);
        if (!tab) {
            const allowed = this.config.googleSheet.tabs.map(item => item.name).join(', ');
            throw new Error(`Unsupported sheet tab: ${tabName}. Allowed tabs: ${allowed}`);
        }
        return tab;
    }

    prepareRows(rows) {
        const allRows = Array.isArray(rows) ? rows : [];
        let startIndex = Number(this.config.googleSheet.skipTopRows || 0);

        if (!startIndex && this.config.googleSheet.autoDetectFirstDataRow) {
            startIndex = findFirstDataRowIndex(allRows, this.config.googleSheet.dateFrom);
        }

        return {
            rows: allRows.slice(startIndex),
            firstDataRowNumber: startIndex + 1,
            skippedTopRows: startIndex
        };
    }

    filterRecordsByDate(records, dateFrom) {
        if (!dateFrom) {
            return { records, filteredBeforeDate: 0 };
        }

        const kept = records.filter(record => record.date && record.date >= dateFrom);
        return {
            records: kept,
            filteredBeforeDate: records.length - kept.length
        };
    }

    async syncAllFromGoogleSheet(triggerType = 'manual') {
        await this.ensureReady();
        const runId = await beginSyncRun(this.pool, triggerType);

        try {
            const tabResults = [];
            const totals = createEmptyTotals();

            for (const tab of this.config.googleSheet.tabs) {
                const rawRows = await fetchRawSheetRows({
                    ...this.config.googleSheet,
                    sheetName: tab.name,
                    gid: ''
                });
                const prepared = this.prepareRows(rawRows);
                const result = await this.syncRowsForTab(tab, prepared.rows, prepared);
                tabResults.push(result);
                addTotals(totals, result);
            }

            const stats = { runId, totals, tabs: tabResults };
            await finishSyncRun(this.pool, runId, 'success', stats, null);
            return stats;
        } catch (error) {
            await finishSyncRun(this.pool, runId, 'failed', null, formatErrorMessage(error));
            throw error;
        }
    }

    async syncSheetsFromPayload(sheets, triggerType = 'webhook') {
        await this.ensureReady();
        const runId = await beginSyncRun(this.pool, triggerType);

        try {
            const tabResults = [];
            const totals = createEmptyTotals();

            for (const sheet of sheets) {
                const tab = this.getTab(sheet.name || sheet.sheetName || sheet.tabName);
                const rawRows = sheet.rows || sheet.values;
                if (!Array.isArray(rawRows)) {
                    throw new Error(`Rows array is required for tab ${tab.name}`);
                }

                const prepared = this.prepareRows(rawRows);
                const result = await this.syncRowsForTab(tab, prepared.rows, prepared);
                tabResults.push(result);
                addTotals(totals, result);
            }

            const stats = { runId, totals, tabs: tabResults };
            await finishSyncRun(this.pool, runId, 'success', stats, null);
            return stats;
        } catch (error) {
            await finishSyncRun(this.pool, runId, 'failed', null, formatErrorMessage(error));
            throw error;
        }
    }

    async syncFromGoogleSheet(triggerType = 'manual') {
        return this.syncAllFromGoogleSheet(triggerType);
    }

    async syncFromRows(rows, tabName, triggerType = 'webhook') {
        return this.syncSheetsFromPayload([{ name: tabName, rows }], triggerType);
    }

    async syncRowsForTab(tab, rows, prepared = {}) {
        const normalized = normalizeSheetRows(rows, {
            firstDataRowNumber: prepared.firstDataRowNumber || 1
        });
        const filtered = this.filterRecordsByDate(normalized.records, this.config.googleSheet.dateFrom);
        const dbStats = await runInTransaction(this.pool, connection => upsertRecords(connection, tab.tableName, filtered.records, {
            deactivateMissing: this.config.sync.deactivateMissing
        }));

        return {
            tabName: tab.name,
            tableName: tab.tableName,
            readRows: normalized.readRows,
            parsedRecords: filtered.records.length,
            filteredBeforeDate: filtered.filteredBeforeDate,
            skippedTopRows: prepared.skippedTopRows || 0,
            firstDataRowNumber: prepared.firstDataRowNumber || 1,
            warnings: normalized.warnings,
            ...dbStats
        };
    }
}

module.exports = {
    GoogleSheetSyncService,
    findFirstDataRowIndex,
    normalizeTabName
};