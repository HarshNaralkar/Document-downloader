const express = require('express');
const path = require('path');

function createSearchRouter({ pool, config } = {}) {
    if (!pool) throw new Error('pool is required');
    if (!config) throw new Error('config is required');

    const router = express.Router();
    const tabs = config.googleSheet.tabs;

    // Serve static frontend files
    router.use(express.static(path.join(__dirname, '..', 'public')));

    // GET /search — serve the HTML page
    router.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'search.html'));
    });

    // GET /api/tabs — list all available tabs for the dropdown
    router.get('/api/tabs', (req, res) => {
        res.json({
            success: true,
            data: tabs.map(tab => ({ name: tab.name, tableName: tab.tableName }))
        });
    });

    // GET /api/sync-status — show when data was last synced
    router.get('/api/sync-status', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT id, status, started_at, ended_at, trigger_type,
                        JSON_EXTRACT(stats, '$.totals.inserted') AS inserted,
                        JSON_EXTRACT(stats, '$.totals.updated') AS updated,
                        JSON_EXTRACT(stats, '$.totals.unchanged') AS unchanged,
                        JSON_EXTRACT(stats, '$.totals.parsedRecords') AS parsed
                 FROM google_sheet_sync_runs
                 ORDER BY id DESC LIMIT 1`
            );
            if (rows.length === 0) {
                return res.json({ success: true, data: null, message: 'No sync runs yet' });
            }
            const run = rows[0];
            res.json({
                success: true,
                data: {
                    runId: run.id,
                    status: run.status,
                    startedAt: run.started_at,
                    finishedAt: run.ended_at,
                    trigger: run.trigger_type,
                    inserted: run.inserted,
                    updated: run.updated,
                    unchanged: run.unchanged,
                    parsed: run.parsed
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // GET /api/sponsors-by-date?date=2026-08-29&tab=ROYAL SKY INT
    // Returns individual records with sr_no, sponsor_name, cr_number, sorted by sr_no
    router.get('/api/sponsors-by-date', async (req, res) => {
        try {
            const dateStr = req.query.date;
            if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required' });
            }

            const tabFilter = (req.query.tab || '').trim();
            const targetTabs = tabFilter
                ? tabs.filter(t => t.name.toUpperCase() === tabFilter.toUpperCase())
                : tabs;

            if (targetTabs.length === 0) {
                return res.json({ success: true, data: [], count: 0 });
            }

            const unionParts = targetTabs.map(tab =>
                `SELECT sr_no, sponsor_name, cr_number, ppt_name, ppt_number, country, '${tab.name}' AS tab_name FROM \`${tab.tableName}\` WHERE \`date\` = ? AND is_active = TRUE AND sponsor_name IS NOT NULL AND sponsor_name != ''`
            );

            const sql = unionParts.join(' UNION ALL ') + ' ORDER BY CAST(sr_no AS UNSIGNED) ASC, sponsor_name ASC';
            const params = targetTabs.map(() => dateStr);

            const [rows] = await pool.query(sql, params);

            res.json({ success: true, data: rows, count: rows.length });
        } catch (error) {
            console.error('[Search API] sponsors-by-date error:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Helper for Levenshtein Distance
    function levenshteinDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    // Similarity score between 0.0 and 1.0
    function getSimilarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
    }

    // Token-based matching for word-level similarities (catches extra characters/typos like "DESIGNS")
    function checkTokenSimilarity(query, target) {
        const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        const tWords = target.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        if (qWords.length === 0) return 0;
        let matched = 0;
        for (const qw of qWords) {
            if (tWords.some(tw => tw === qw || getSimilarity(tw, qw) > 0.8)) {
                matched++;
            }
        }
        return matched / qWords.length;
    }

    // GET /api/by-sponsor?name=SPONSOR_NAME&tab=ROYAL SKY INT
    // Performs character-by-character substring search and fuzzy variations
    router.get('/api/by-sponsor', async (req, res) => {
        try {
            const query = (req.query.name || '').trim();
            if (!query) {
                return res.status(400).json({ success: false, message: 'sponsor name is required' });
            }

            const tabFilter = (req.query.tab || '').trim();
            const targetTabs = tabFilter
                ? tabs.filter(t => t.name.toUpperCase() === tabFilter.toUpperCase())
                : tabs;

            if (targetTabs.length === 0) {
                return res.json({ success: true, data: { perfectMatches: [], closeMatches: [] }, count: { perfect: 0, close: 0 } });
            }

            // Fetch active records for matching
            const unionParts = targetTabs.map(tab =>
                `SELECT \`date\`, sr_no, sponsor_name, fe_number, dm_number, country, cr_number, ppt_name, ppt_number, en_number, category, salary, visa_number, job_role, '${tab.name}' AS tab_name FROM \`${tab.tableName}\` WHERE is_active = TRUE`
            );

            const sql = unionParts.join(' UNION ALL ') + ' ORDER BY `date` DESC, CAST(sr_no AS UNSIGNED) ASC';
            const [rows] = await pool.query(sql);

            const perfectMatches = [];
            const closeMatches = [];
            const queryLower = query.toLowerCase();

            for (const row of rows) {
                const name = (row.sponsor_name || '').trim();
                const nameLower = name.toLowerCase();

                if (!nameLower) continue;

                // 1. Perfect Match: Substring check
                if (nameLower.includes(queryLower)) {
                    perfectMatches.push(row);
                } 
                // 2. Close Match: Token similarity check
                else if (checkTokenSimilarity(query, name) >= 0.66) {
                    closeMatches.push(row);
                }
            }

            res.json({
                success: true,
                data: {
                    perfectMatches,
                    closeMatches
                },
                count: {
                    perfect: perfectMatches.length,
                    close: closeMatches.length
                }
            });
        } catch (error) {
            console.error('[Search API] by-sponsor error:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createSearchRouter };
