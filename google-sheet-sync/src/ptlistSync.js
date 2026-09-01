/**
 * PT List Sync Engine
 * Downloads xlsx from Google Drive, parses it, encrypts sensitive fields,
 * and upserts into ptlist_records MySQL table.
 */
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');

// ─── AES-256-GCM Encryption ─────────────────────────────────────────────────

function getEncryptionKey() {
    const hex = process.env.PTLIST_ENCRYPTION_KEY || '';
    if (!hex || hex.length < 64) {
        throw new Error('PTLIST_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    return Buffer.from(hex, 'hex');
}

function encryptField(plaintext, keyBuf) {
    if (!plaintext || !String(plaintext).trim()) return '';
    const text = String(plaintext).trim();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptField(ciphertext, keyBuf) {
    if (!ciphertext || !String(ciphertext).includes(':')) return '';
    try {
        const parts = String(ciphertext).split(':');
        if (parts.length !== 3) return '';
        const [ivHex, tagHex, encHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[PTList Decrypt] Failed to decrypt field:', e.message);
        return '[decrypt error]';
    }
}

// ─── Drive API Download ──────────────────────────────────────────────────────

function getDriveAccessToken(keyFile) {
    let credentials;
    const directJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.PTLIST_SERVICE_ACCOUNT_JSON;
    if (directJson) {
        try {
            credentials = JSON.parse(directJson);
        } catch (err) {
            console.error('[PTList Auth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
        }
    }

    if (!credentials) {
        const fs = require('fs');
        const resolvedPath = path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
        credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    }

    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const unsigned = `${b64(header)}.${b64(claim)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const sig = signer.sign(credentials.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const assertion = `${unsigned}.${sig}`;

    return axios.post(credentials.token_uri || 'https://oauth2.googleapis.com/token',
        new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    ).then(res => res.data.access_token);
}

async function downloadXlsxFromDrive(sheetId, keyFile) {
    const token = await getDriveAccessToken(keyFile);
    const response = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${sheetId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', timeout: 60000 }
    );
    return Buffer.from(response.data);
}

// ─── xlsx Parsing ────────────────────────────────────────────────────────────

function parseXlsxToRecords(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0]; // "FE ID PASSWORD"
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) return [];

    const records = [];
    // Skip header row (index 0), parse data rows
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        // Skip completely empty rows
        if (!r || r.every(cell => !String(cell).trim())) continue;

        const codeVal = String(r[0] || '').trim();
        const companyName = String(r[3] || '').trim();
        const feId = String(r[9] || '').trim();
        // Skip rows with no company name AND no FE ID AND no Code (likely garbage)
        if (!companyName && !feId && !codeVal) continue;

        records.push({
            code: codeVal,
            dolphin: codeVal,
            sr_no: String(r[1] || '').trim(),
            sub_date: String(r[2] || '').trim(),
            company_name: companyName,
            country: String(r[4] || '').trim(),
            pt_number: String(r[5] || '').trim(),
            status: String(r[6] || '').trim(),
            email_id_plain: String(r[7] || '').trim(),
            email_pwd_plain: String(r[8] || '').trim(),
            fe_id: feId,
            pwd_plain: String(r[10] || '').trim(),
            new_pwd_plain: String(r[11] || '').trim(),
            status2: String(r[12] || '').trim(),
            source_row: i + 1
        });
    }

    return records;
}

// ─── MySQL Table & Upsert ────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ptlist_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_row INT NOT NULL,
    code VARCHAR(255) NULL,
    dolphin VARCHAR(255) NULL,
    sr_no VARCHAR(80) NULL,
    sub_date VARCHAR(80) NULL,
    company_name VARCHAR(255) NULL,
    country VARCHAR(255) NULL,
    pt_number VARCHAR(255) NULL,
    status VARCHAR(255) NULL,
    email_id_enc TEXT NULL,
    email_pwd_enc TEXT NULL,
    fe_id VARCHAR(255) NULL,
    pwd_enc TEXT NULL,
    new_pwd_enc TEXT NULL,
    status2 VARCHAR(255) NULL,
    row_hash CHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_source_row (source_row),
    KEY idx_company_name (company_name),
    KEY idx_fe_id (fe_id),
    KEY idx_code (code),
    KEY idx_active (is_active)
)`;

function computeRowHash(record) {
    const raw = [record.code || record.dolphin, record.sr_no, record.sub_date, record.company_name,
        record.country, record.pt_number, record.status, record.email_id_plain, record.email_pwd_plain,
        record.fe_id, record.pwd_plain, record.new_pwd_plain, record.status2].join('|');
    return crypto.createHash('sha256').update(raw).digest('hex');
}

async function initPtlistSchema(pool) {
    await pool.query(CREATE_TABLE_SQL);

    // Safely add missing columns for existing tables
    try {
        await pool.query("ALTER TABLE ptlist_records ADD COLUMN code VARCHAR(255) NULL AFTER source_row");
    } catch (e) { /* column already exists */ }

    try {
        await pool.query("ALTER TABLE ptlist_records ADD COLUMN email_pwd_enc TEXT NULL AFTER email_id_enc");
    } catch (e) { /* column already exists */ }
}

async function upsertPtlistRecords(pool, records, encKey) {
    const stats = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0 };

    const [existingRows] = await pool.query('SELECT source_row, row_hash, is_active FROM ptlist_records');
    const existing = new Map(existingRows.map(r => [r.source_row, r]));
    const incomingRows = new Set();

    for (const record of records) {
        const hash = computeRowHash(record);
        incomingRows.add(record.source_row);
        const ex = existing.get(record.source_row);

        const emailEnc = encryptField(record.email_id_plain, encKey);
        const emailPwdEnc = encryptField(record.email_pwd_plain, encKey);
        const pwdEnc = encryptField(record.pwd_plain, encKey);
        const newPwdEnc = encryptField(record.new_pwd_plain, encKey);

        if (!ex) {
            await pool.query(
                `INSERT INTO ptlist_records (source_row, code, dolphin, sr_no, sub_date, company_name, country, pt_number, status, email_id_enc, email_pwd_enc, fe_id, pwd_enc, new_pwd_enc, status2, row_hash, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [record.source_row, record.code, record.dolphin, record.sr_no, record.sub_date, record.company_name,
                 record.country, record.pt_number, record.status, emailEnc, emailPwdEnc, record.fe_id,
                 pwdEnc, newPwdEnc, record.status2, hash]
            );
            stats.inserted++;
        } else if (ex.row_hash !== hash || !ex.is_active) {
            await pool.query(
                `UPDATE ptlist_records SET code=?, dolphin=?, sr_no=?, sub_date=?, company_name=?, country=?, pt_number=?, status=?, email_id_enc=?, email_pwd_enc=?, fe_id=?, pwd_enc=?, new_pwd_enc=?, status2=?, row_hash=?, is_active=TRUE
                 WHERE source_row=?`,
                [record.code, record.dolphin, record.sr_no, record.sub_date, record.company_name,
                 record.country, record.pt_number, record.status, emailEnc, emailPwdEnc, record.fe_id,
                 pwdEnc, newPwdEnc, record.status2, hash, record.source_row]
            );
            stats.updated++;
        } else {
            stats.unchanged++;
        }
    }

    // Deactivate missing rows
    const missingRows = existingRows.filter(r => !incomingRows.has(r.source_row) && r.is_active);
    if (missingRows.length > 0) {
        const ids = missingRows.map(r => r.source_row);
        await pool.query('UPDATE ptlist_records SET is_active = FALSE WHERE source_row IN (?)', [ids]);
        stats.deactivated = missingRows.length;
    }

    return stats;
}

// ─── Full Sync Orchestrator ──────────────────────────────────────────────────

async function syncPtList(pool, config) {
    const keyFile = config.serviceAccountKeyFile || process.env.GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE;
    const sheetId = config.ptlistSheetId || process.env.PTLIST_SHEET_ID;
    const encKey = getEncryptionKey();

    if (!sheetId) throw new Error('PTLIST_SHEET_ID is required');
    if (!keyFile && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !process.env.PTLIST_SERVICE_ACCOUNT_JSON) {
        throw new Error('GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON is required');
    }

    await initPtlistSchema(pool);

    const xlsxBuffer = await downloadXlsxFromDrive(sheetId, keyFile);
    const records = parseXlsxToRecords(xlsxBuffer);
    const stats = await upsertPtlistRecords(pool, records, encKey);

    return { parsedRecords: records.length, ...stats };
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

function startPtlistSyncScheduler({ pool, config, onResult, onError }) {
    const intervalMs = Number(process.env.PTLIST_SYNC_INTERVAL_MS || 180000);
    let running = false;

    async function runSync() {
        if (running) return;
        running = true;
        try {
            const result = await syncPtList(pool, config);
            if (onResult) onResult(result);
        } catch (err) {
            if (onError) onError(err);
        } finally {
            running = false;
        }
    }

    // Run immediately on start
    runSync();
    const timer = setInterval(runSync, intervalMs);

    return {
        stop: () => clearInterval(timer),
        runNow: runSync
    };
}

module.exports = {
    encryptField,
    decryptField,
    getEncryptionKey,
    downloadXlsxFromDrive,
    parseXlsxToRecords,
    initPtlistSchema,
    upsertPtlistRecords,
    syncPtList,
    startPtlistSyncScheduler,
    CREATE_TABLE_SQL
};
