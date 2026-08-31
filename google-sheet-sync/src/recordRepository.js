const WORKER_COLUMNS = [
    'source_key',
    'date',
    'sr_no',
    'broker_name',
    'ppt_name',
    'ppt_address',
    'ppt_number',
    'en_number',
    'ppt_issue_date',
    'ppt_issue_place',
    'ppt_expiry_date',
    'dob',
    'country',
    'fe_number',
    'dm_number',
    'sponsor_phone_number',
    'category',
    'salary',
    'sponsor_address',
    'sponsor_name',
    'cr_number',
    'jb_id',
    'visa_issue_date',
    'visa_expiry_date',
    'visa_number',
    'father_name',
    'mother_name',
    'legal_status',
    'id_name',
    'id_number',
    'job_role',
    'source_row_start',
    'source_row_end',
    'raw_data',
    'row_hash'
];

function q(identifier) {
    if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
        throw new Error(`Unsafe SQL identifier: ${identifier}`);
    }
    return `\`${identifier}\``;
}

function createWorkerTableSql(tableName) {
    const table = q(tableName);
    return `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_key VARCHAR(255) NOT NULL,
        \`date\` DATE NULL,
        sr_no VARCHAR(255) NULL,
        broker_name VARCHAR(255) NULL,
        ppt_name VARCHAR(255) NULL,
        ppt_address TEXT NULL,
        ppt_number VARCHAR(255) NULL,
        en_number VARCHAR(255) NULL,
        ppt_issue_date DATE NULL,
        ppt_issue_place VARCHAR(255) NULL,
        ppt_expiry_date DATE NULL,
        dob DATE NULL,
        country VARCHAR(255) NULL,
        fe_number VARCHAR(255) NULL,
        dm_number VARCHAR(255) NULL,
        sponsor_phone_number VARCHAR(255) NULL,
        category VARCHAR(255) NULL,
        salary VARCHAR(255) NULL,
        sponsor_address TEXT NULL,
        sponsor_name VARCHAR(255) NULL,
        cr_number VARCHAR(255) NULL,
        jb_id VARCHAR(255) NULL,
        visa_issue_date DATE NULL,
        visa_expiry_date DATE NULL,
        visa_number VARCHAR(255) NULL,
        father_name VARCHAR(255) NULL,
        mother_name VARCHAR(255) NULL,
        legal_status VARCHAR(255) NULL,
        id_name VARCHAR(255) NULL,
        id_number VARCHAR(255) NULL,
        job_role VARCHAR(255) NULL,
        source_row_start INT NULL,
        source_row_end INT NULL,
        raw_data JSON NOT NULL,
        row_hash CHAR(64) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_source_key (source_key),
        KEY idx_ppt_number (ppt_number),
        KEY idx_en_number (en_number),
        KEY idx_ppt_name (ppt_name),
        KEY idx_country (country),
        KEY idx_jb_id (jb_id),
        KEY idx_visa_number (visa_number),
        KEY idx_active (is_active),
        KEY idx_date (\`date\`)
    )`;
}

async function ignoreExpectedSchemaError(error, expectedCodes, expectedErrnos) {
    if (expectedCodes.includes(error?.code) || expectedErrnos.includes(error?.errno)) {
        return;
    }
    throw error;
}

async function ensureColumn(pool, tableName, columnName, definition) {
    try {
        await pool.query(`ALTER TABLE ${q(tableName)} ADD COLUMN ${q(columnName)} ${definition}`);
    } catch (error) {
        await ignoreExpectedSchemaError(error, ['ER_DUP_FIELDNAME'], [1060]);
    }
}

async function ensureIndex(pool, tableName, indexName, columnsSql) {
    try {
        await pool.query(`ALTER TABLE ${q(tableName)} ADD INDEX ${q(indexName)} ${columnsSql}`);
    } catch (error) {
        await ignoreExpectedSchemaError(error, ['ER_DUP_KEYNAME'], [1061]);
    }
}

async function copyOldJobIdColumnIfPresent(pool, tableName) {
    try {
        await pool.query(`UPDATE ${q(tableName)} SET jb_id = job_id WHERE jb_id IS NULL AND job_id IS NOT NULL`);
    } catch (error) {
        await ignoreExpectedSchemaError(error, ['ER_BAD_FIELD_ERROR'], [1054]);
    }
}

async function modifyColumn(pool, tableName, columnName, definition) {
    try {
        await pool.query(`ALTER TABLE ${q(tableName)} MODIFY COLUMN ${q(columnName)} ${definition}`);
    } catch (error) {
        // Ignore expected errors
    }
}

async function migrateWorkerTable(pool, tableName) {
    await ensureColumn(pool, tableName, 'jb_id', 'VARCHAR(255) NULL');
    await ensureIndex(pool, tableName, 'idx_jb_id', '(jb_id)');
    await copyOldJobIdColumnIfPresent(pool, tableName);

    // Widening columns to prevent ER_DATA_TOO_LONG failures
    await modifyColumn(pool, tableName, 'sponsor_phone_number', 'VARCHAR(255) NULL');
    await modifyColumn(pool, tableName, 'sr_no', 'VARCHAR(255) NULL');
    await modifyColumn(pool, tableName, 'country', 'VARCHAR(255) NULL');
    await modifyColumn(pool, tableName, 'salary', 'VARCHAR(255) NULL');
    await modifyColumn(pool, tableName, 'ppt_number', 'VARCHAR(255) NULL');
    await modifyColumn(pool, tableName, 'en_number', 'VARCHAR(255) NULL');
}
async function initSchema(pool, tabs = []) {
    await pool.query(`CREATE TABLE IF NOT EXISTS google_sheet_sync_runs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        trigger_type VARCHAR(80) NOT NULL DEFAULT 'manual',
        status VARCHAR(40) NOT NULL DEFAULT 'running',
        stats JSON NULL,
        error_message TEXT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        PRIMARY KEY (id),
        KEY idx_google_sheet_sync_runs_status (status),
        KEY idx_google_sheet_sync_runs_started_at (started_at)
    )`);

    for (const tab of tabs) {
        await pool.query(createWorkerTableSql(tab.tableName));
        await migrateWorkerTable(pool, tab.tableName);
    }
}

async function beginSyncRun(pool, triggerType) {
    const [result] = await pool.query(
        'INSERT INTO google_sheet_sync_runs (trigger_type, status) VALUES (?, ?)',
        [triggerType || 'manual', 'running']
    );
    return result.insertId;
}

async function finishSyncRun(pool, runId, status, stats, errorMessage) {
    await pool.query(
        `UPDATE google_sheet_sync_runs
         SET status = ?, stats = ?, error_message = ?, ended_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, stats ? JSON.stringify(stats) : null, errorMessage || null, runId]
    );
}

function recordValue(record, column) {
    if (column === 'raw_data') return JSON.stringify(record.raw_data);
    return record[column] === undefined ? null : record[column];
}

async function insertRecord(pool, tableName, record) {
    const columns = [...WORKER_COLUMNS, 'is_active', 'last_seen_at'];
    const placeholders = columns.map(() => '?').join(', ');
    const values = WORKER_COLUMNS.map(column => recordValue(record, column));
    values.push(true, new Date());

    await pool.query(
        `INSERT INTO ${q(tableName)} (${columns.map(q).join(', ')})
         VALUES (${placeholders})`,
        values
    );
}

async function updateRecord(pool, tableName, record, changed) {
    const updateColumns = changed
        ? WORKER_COLUMNS.filter(column => column !== 'source_key')
        : ['source_row_start', 'source_row_end', 'raw_data', 'is_active', 'last_seen_at'];

    const assignments = updateColumns.map(column => `${q(column)} = ?`).join(', ');
    const values = updateColumns.map(column => {
        if (column === 'is_active') return true;
        if (column === 'last_seen_at') return new Date();
        return recordValue(record, column);
    });
    values.push(record.source_key);

    await pool.query(
        `UPDATE ${q(tableName)} SET ${assignments} WHERE source_key = ?`,
        values
    );
}

async function upsertRecords(pool, tableName, records, options = {}) {
    const stats = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        deactivated: 0
    };

    const [existingRows] = await pool.query(
        `SELECT source_key, row_hash, is_active FROM ${q(tableName)}`
    );
    const existing = new Map(existingRows.map(row => [row.source_key, row]));
    const incomingKeys = new Set();

    for (const record of records) {
        incomingKeys.add(record.source_key);
        const existingRecord = existing.get(record.source_key);

        if (!existingRecord) {
            await insertRecord(pool, tableName, record);
            existing.set(record.source_key, {
                source_key: record.source_key,
                row_hash: record.row_hash,
                is_active: true
            });
            stats.inserted += 1;
            continue;
        }

        const changed = existingRecord.row_hash !== record.row_hash || !existingRecord.is_active;
        await updateRecord(pool, tableName, record, changed);
        existing.set(record.source_key, {
            source_key: record.source_key,
            row_hash: record.row_hash,
            is_active: true
        });

        if (changed) {
            stats.updated += 1;
        } else {
            stats.unchanged += 1;
        }
    }

    if (options.deactivateMissing !== false) {
        const missingKeys = existingRows
            .filter(row => !incomingKeys.has(row.source_key))
            .map(row => row.source_key);

        if (missingKeys.length > 0) {
            await pool.query(
                `DELETE FROM ${q(tableName)} WHERE source_key IN (?)`,
                [missingKeys]
            );
            stats.deactivated = missingKeys.length;
        }
    }

    return stats;
}

async function getTableCounts(pool, tableName) {
    const [[recordCounts]] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            COALESCE(SUM(is_active = TRUE), 0) AS active,
            COALESCE(SUM(is_active = FALSE), 0) AS inactive
         FROM ${q(tableName)}`
    );
    return {
        total: Number(recordCounts?.total || 0),
        active: Number(recordCounts?.active || 0),
        inactive: Number(recordCounts?.inactive || 0)
    };
}

async function getSyncStatus(pool, tabs = []) {
    const [[latestRun]] = await pool.query(
        `SELECT id, trigger_type, status, stats, error_message, started_at, ended_at
         FROM google_sheet_sync_runs
         ORDER BY id DESC
         LIMIT 1`
    );

    const tables = [];
    for (const tab of tabs) {
        tables.push({
            tabName: tab.name,
            tableName: tab.tableName,
            records: await getTableCounts(pool, tab.tableName)
        });
    }

    return {
        latestRun: latestRun || null,
        tables
    };
}

async function searchRecords(pool, tableName, filters = {}) {
    const where = [];
    const values = [];

    if (filters.activeOnly !== false) {
        where.push('is_active = TRUE');
    }

    if (filters.q) {
        where.push('(ppt_name LIKE ? OR ppt_number LIKE ? OR en_number LIKE ? OR sponsor_name LIKE ? OR jb_id LIKE ? OR visa_number LIKE ?)');
        const qValue = `%${filters.q}%`;
        values.push(qValue, qValue, qValue, qValue, qValue, qValue);
    }

    for (const column of ['country', 'sponsor_name', 'category', 'job_role', 'legal_status']) {
        if (filters[column]) {
            where.push(`${q(column)} = ?`);
            values.push(filters[column]);
        }
    }

    const limit = Math.min(Number(filters.limit || 50), 200);
    values.push(limit);

    const [rows] = await pool.query(
        `SELECT *
         FROM ${q(tableName)}
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ${q('date')} ASC, source_row_start ASC, id ASC
         LIMIT ?`,
        values
    );

    return rows;
}

async function getRecordById(pool, tableName, id) {
    const [rows] = await pool.query(
        `SELECT * FROM ${q(tableName)} WHERE id = ? LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

module.exports = {
    WORKER_COLUMNS,
    beginSyncRun,
    createWorkerTableSql,
    finishSyncRun,
    getRecordById,
    getSyncStatus,
    getTableCounts,
    initSchema,
    q,
    searchRecords,
    upsertRecords
};