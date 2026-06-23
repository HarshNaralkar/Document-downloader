const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const nunjucks = require('nunjucks');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { exec } = require('child_process');

dotenv.config();

const app = express();

const BATCH_STATUS = {};
const OUTPUT_FOLDER = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

// ── PDF Conversion Queue ──────────────────────────────────────────────────────
// Configurable concurrency to support multiple concurrent conversions (Option B).
// Ensures only MAX_CONCURRENT_CONVERSIONS run at a time across ALL users.
const conversionQueue = [];
let activeConversionsCount = 0;
const MAX_CONCURRENT_CONVERSIONS = parseInt(process.env.MAX_CONCURRENT_CONVERSIONS) || 3;

function enqueueConversionJob(jobFn) {
    return new Promise((resolve, reject) => {
        conversionQueue.push({ fn: jobFn, resolve, reject });
        runNextConversionJobs();
    });
}

function runNextConversionJobs() {
    while (activeConversionsCount < MAX_CONCURRENT_CONVERSIONS && conversionQueue.length > 0) {
        activeConversionsCount++;
        const { fn, resolve, reject } = conversionQueue.shift();
        
        (async () => {
            try {
                resolve(await fn());
            } catch (err) {
                reject(err);
            } finally {
                activeConversionsCount--;
                setImmediate(runNextConversionJobs);
            }
        })();
    }
}
// ─────────────────────────────────────────────────────────────────────────────

// Parse form and json bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
const MySQLStore = require('express-mysql-session')(session);

const sessionStore = new MySQLStore({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DB || 'login',
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions'
    }
});

app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SECRET_KEY || 'your_secret_key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

app.use(flash());

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// Nunjucks templating engine setup
const nunjucksEnv = nunjucks.configure('templates', {
    autoescape: true,
    express: app,
    watch: false
});

// Register url_for global to match Flask url_for behavior
nunjucksEnv.addGlobal('url_for', function(name, kwargs) {
    if (name === 'static') {
        return `/static/${kwargs.filename}`;
    }
    if (name === 'forgot_password') {
        return '/forgot-password';
    }
    if (name === 'login_page') {
        return '/';
    }
    return `/${name}`;
});

// Middleware to expose flash messages and login state to templates
app.use((req, res, next) => {
    res.locals.get_flashed_messages = function(options) {
        const flashObj = req.flash();
        const result = [];
        for (const [category, messages] of Object.entries(flashObj)) {
            for (const message of messages) {
                if (options && options.with_categories) {
                    result.push([category, message]);
                } else {
                    result.push(message);
                }
            }
        }
        return result;
    };
    res.locals.current_user = req.session.user || null;
    next();
});

// Setup SMTP Transporter for Mail
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
    }
});

// MySQL Connection Pool (will be created in initDb)
let pool;

// Initialize database schema
async function initDb() {
    const dbName = process.env.MYSQL_DB || 'login';
    try {
        // First connect without specifying the database
        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || ''
        });

        // Create the database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.end();
        console.log(`Ensured database '${dbName}' exists`);

        // Now initialize the connection pool
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: dbName,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        const poolConnection = await pool.getConnection();
        await poolConnection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL
            )
        `);
        await poolConnection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                otp_code VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                purpose VARCHAR(50) NOT NULL
            )
        `);
        await poolConnection.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                user_id INT PRIMARY KEY,
                token VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        poolConnection.release();
        console.log('MySQL Database initialized successfully');
    } catch (err) {
        console.error('MySQL Database initialization failed:', err);
    }
}

// Helper to generate a 6-digit OTP code
function generateOtp(length = 6) {
    let digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// Authentication Middleware
function loginRequired(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/');
}

// Global configurations matching Python code
const COMPANY_TEMPLATES = {
    "ROYAL_SKY_INTERNATIONAL": 'templates/ROYAL',
    "VIVAN": 'templates/VIVAN',
    "AR": 'templates/AR',
    "SNS_GLOBLE": 'templates/SNSGLOBLE'
};

const SHEET_NAME = {
    "ROYAL_SKY_INTERNATIONAL": 'RS',
    "VIVAN": 'VI',
    "AR": 'AR',
    "SNS_GLOBLE": 'SNS'
};

const COMPANY_GOOGLE_SHEETS = {
    "ROYAL_SKY_INTERNATIONAL": {
        "url": "https://docs.google.com/spreadsheets/d/1vgXggucKcJ09xXJj-mjraFnk_PH3iCEKm1iv6Teq7UI/edit?gid=787616279",
        "sheet_id": "1vgXggucKcJ09xXJj-mjraFnk_PH3iCEKm1iv6Teq7UI"
    },
    "VIVAN": {
        "url": "https://docs.google.com/spreadsheets/d/1FcU1XCAGohd_bdqO3GJIgsKoucZhJieRNM_1Jmmbf94/edit?gid=0#gid=0",
        "sheet_id": "1FcU1XCAGohd_bdqO3GJIgsKoucZhJieRNM_1Jmmbf94"
    },
    "AR": {
        "url": "https://docs.google.com/spreadsheets/d/1hYiWttZnmkma8ejd9DKEJosa_-H2jow8vsbGfNUAj3Q/edit?gid=0#gid=0",
        "sheet_id": "1hYiWttZnmkma8ejd9DKEJosa_-H2jow8vsbGfNUAj3Q"
    },
    "SNS_GLOBLE": {
        "url": "https://docs.google.com/spreadsheets/d/1vgXggucKcJ09xXJj-mjraFnk_PH3iCEKm1iv6Teq7UI/edit?gid=787616279",
        "sheet_id": "1vgXggucKcJ09xXJj-mjraFnk_PH3iCEKm1iv6Teq7UI"
    }
};

const REQUIRED_FIELDS = {
    'request_letter': ['SPNAME', 'SPADD', 'CRNONDIDNO', 'PHONENO', 'VISAISSUEDATE'],
    'agreement':      ['SPNAME', 'SPADD', 'VISAISSUEDATE', 'PASSPORTNAME', 'PASSPORTNO' , 'JOBROLE', 'SALARY'],
    'afi_noc':        ['PASSPORTNAME', 'PASSPORTNO', 'SPNAME' , 'VISANO', 'VISAEXPIRY' , 'FEID' , 'Country Name'],
    'Annexure':       ['SPNAME' , 'Country Name','LEGAL_STATUS','AUTHORISED_SIGNATORY','ID_NO'],
    'POA_DM':         ['SPNAME', 'SPADD', 'VISAISSUEDATE', 'JOBROLE', 'SALARY']
};

const DOC_DISPLAY_NAMES = {
    'request_letter': 'Request Letter',
    'agreement': 'Agreement',
    'afi_noc': 'Affidavit',
    'Annexure': 'Annexure',
    'POA_DM': 'POA_DM'
};

const DOC_MAP = {
    'agreement': { template: 'agreement.docx', name: 'Agreement' },
    'request_letter': { template: 'request_letter.docx', name: 'Request Letter' },
    'afi_noc': { template: 'afi_noc.docx', name: 'Affidavit' },
    'Annexure': { template: 'Annexure.docx', name: 'Annexure' },
    'POA_DM': { template: 'POA_DM.docx', name: 'POA_DM' }
};

// Caching layer for Google Sheet fetches
const sheetCache = {};
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Cleanup zombie converter processes safely (Windows: WINWORD.EXE, Linux: soffice.bin)
function cleanupZombieWordProcesses() {
    if (process.platform === 'win32') {
        console.log('[System Cleanup] Scanning for headless WINWORD.EXE zombie processes...');
        exec('powershell -Command "Get-Process winword -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 } | Stop-Process -Force"', (err) => {
            if (!err) console.log('[System Cleanup] Headless Word processes cleaned up.');
        });
    } else {
        // Linux: kill any stuck headless soffice.bin instances
        exec('pkill -f "soffice.bin" 2>/dev/null; true', () => {
            console.log('[System Cleanup] Stale soffice.bin processes swept.');
        });
    }
}

// Clean up generated output folders older than 24 hours to prevent disk space exhaustion
function cleanupOldOutputFolders() {
    try {
        console.log('[System Cleanup] Scanning for output folders older than 24 hours...');
        if (!fs.existsSync(OUTPUT_FOLDER)) return;
        
        const now = Date.now();
        const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
        
        const sessions = fs.readdirSync(OUTPUT_FOLDER);
        let deletedCount = 0;
        
        sessions.forEach(sessionDir => {
            const fullPath = path.join(OUTPUT_FOLDER, sessionDir);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                const age = now - stats.mtimeMs;
                if (age > expirationTime) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    deletedCount++;
                }
            }
        });
        
        if (deletedCount > 0) {
            console.log(`[System Cleanup] Cleaned up ${deletedCount} expired output sessions.`);
        }
    } catch (err) {
        console.error('[System Cleanup] Error cleaning up old output folders:', err.message);
    }
}

// Automatically delete all session folders in the output folder at midnight (reduce storage full risk)
function cleanupAllOutputFolders() {
    try {
        console.log('[Midnight Cleanup] Sweeping and clearing output folder...');
        if (!fs.existsSync(OUTPUT_FOLDER)) return;

        const now = Date.now();
        const safetyBufferMs = 30 * 60 * 1000; // 30 minutes safety buffer so we don't disrupt active generation
        const sessions = fs.readdirSync(OUTPUT_FOLDER);
        let deletedCount = 0;

        sessions.forEach(sessionDir => {
            const fullPath = path.join(OUTPUT_FOLDER, sessionDir);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                const age = now - stats.mtimeMs;
                if (age > safetyBufferMs) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    deletedCount++;
                }
            }
        });

        console.log(`[Midnight Cleanup] Completed. Cleared ${deletedCount} session folders.`);
    } catch (err) {
        console.error('[Midnight Cleanup] Error during output folder sweep:', err.message);
    }
}

// Schedule the midnight cleanup function to run at 12:00 AM every night
function scheduleMidnightCleanup() {
    const now = new Date();
    const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // Tomorrow
        0, 0, 0, 0        // 12:00:00 AM
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    
    setTimeout(() => {
        cleanupAllOutputFolders();
        // Setup recurring cleanup every 24 hours starting from midnight
        setInterval(cleanupAllOutputFolders, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    
    console.log(`[System Cleanup] Midnight cleanup scheduled. Next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes.`);
}

async function getGoogleSheetData(company) {
    const companySheet = COMPANY_GOOGLE_SHEETS[company];
    const sheet = SHEET_NAME[company];
    if (!companySheet || !sheet) {
        throw new Error("Company sheet configuration not found");
    }

    const cacheKey = `${companySheet.sheet_id}_${sheet}`;
    const now = Date.now();

    if (sheetCache[cacheKey] && (now - sheetCache[cacheKey].timestamp < CACHE_TTL_MS)) {
        console.log(`[Cache Hit] Using cached data for ${company} (${sheet})`);
        return sheetCache[cacheKey].data;
    }

    console.log(`[Cache Miss] Fetching Google Sheet for ${company} (${sheet})...`);
    const csvUrl = `https://docs.google.com/spreadsheets/d/${companySheet.sheet_id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    
    let response;
    let retries = 3;
    const delays = [0, 3000, 6000]; // Progressive back-off: 0s, 3s, 6s
    while (retries > 0) {
        const attempt = 3 - retries;
        if (delays[attempt] > 0) {
            await new Promise(res => setTimeout(res, delays[attempt]));
        }
        try {
            response = await axios.get(csvUrl, {
                timeout: 60000,
                headers: {
                    // Send a real browser User-Agent to avoid Google blocking server-side requests
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            });
            break; // Success! Break out of the loop
        } catch (err) {
            retries -= 1;
            console.warn(`[Google Sheets Fetch] Error occurred: ${err.message}. Retries remaining: ${retries}`);
            if (retries === 0) {
                throw err; // Re-throw if all retries failed
            }
        }
    }
    const csvText = response.data;
    
    // Parse CSV safely
    const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
    
    // Clean column headers of extra spaces
    const normalized = records.map(row => {
        const rowCopy = {};
        for (const [key, value] of Object.entries(row)) {
            rowCopy[key.trim()] = value;
        }
        return rowCopy;
    });

    sheetCache[cacheKey] = {
        data: normalized,
        timestamp: now
    };

    return normalized;
}

// Helpers for date formats
function formatToYmd(dateStr) {
    if (!dateStr) return null;
    dateStr = String(dateStr).trim();
    // format DD-MM-YYYY
    let match = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    // format YYYY-MM-DD
    match = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
}

function formatToDmy(ymdStr) {
    if (!ymdStr) return '';
    ymdStr = String(ymdStr).trim();
    const match = ymdStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return ymdStr;
}

function cleanCrnondidno(val) {
    if (val === null || val === undefined) return '';
    val = String(val).trim();
    // Remove Excel timestamps like '1970-01-09 10:16:02'
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
        return '';
    }
    return val;
}

// PDF convert handler running Microsoft Word COM (on Windows) or LibreOffice (fallback/other platforms)
async function convertDocxToPdf(docxPath, outputDir) {
    const targetPdf = path.join(outputDir, path.basename(docxPath, '.docx') + '.pdf');

    if (process.platform === 'win32') {
        console.log(`[PDF Conversion] Attempting Microsoft Word COM conversion for: ${path.basename(docxPath)}`);
        try {
            await convertDocxToPdfWithWord(docxPath, targetPdf);
            console.log(`[PDF Conversion] Word COM conversion successful: ${path.basename(targetPdf)}`);
            return;
        } catch (wordErr) {
            console.warn(`[PDF Conversion] Word COM conversion failed, falling back to LibreOffice:`, wordErr.message);
        }
    }

    // LibreOffice fallback
    let libreofficePath = process.env.LIBREOFFICE_PATH;
    if (!libreofficePath) {
        const winPath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
        libreofficePath = fs.existsSync(winPath) ? winPath : 'libreoffice';
    }

    const tempDir = path.join(outputDir, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const loProfile = process.platform === 'win32' ? null : `/tmp/lo_profile_seq_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
        let cmd;
        if (process.platform === 'win32') {
            cmd = `cmd /c ""${libreofficePath}" --headless --norestore --convert-to pdf:writer_pdf_Export --outdir "${tempDir}" "${docxPath}""`;
        } else {
            cmd = `"${libreofficePath}" --headless --norestore "--env:UserInstallation=file://${loProfile}" --convert-to pdf:writer_pdf_Export --outdir "${tempDir}" "${docxPath}"`;
        }

        exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
            if (loProfile) {
                try { fs.rmSync(loProfile, { recursive: true, force: true }); } catch (_) {}
            }
            if (err) {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
                console.error('[PDF conversion CLI error]:', err.message);
                return reject(err);
            }

            try {
                const generated = fs.readdirSync(tempDir).filter(f => f.endsWith('.pdf'));
                if (generated.length === 0) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    return reject(new Error('LibreOffice ran but produced no PDF file'));
                }
                const srcPdf = path.join(tempDir, generated[0]);
                fs.renameSync(srcPdf, targetPdf);
                fs.rmSync(tempDir, { recursive: true, force: true });
                resolve();
            } catch (moveErr) {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
                reject(moveErr);
            }
        });
    });
}

function convertDocxToPdfWithWord(docxPath, targetPdfPath) {
    return new Promise((resolve, reject) => {
        const tempPsFile = path.join(path.dirname(docxPath), `_tmp_conv_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
        
        const psScript = `
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open("${docxPath.replace(/\\/g, '\\\\')}")
    $doc.SaveAs("${targetPdfPath.replace(/\\/g, '\\\\')}", 17)
    $doc.Close()
    Write-Output "SUCCESS"
} catch {
    Write-Output "ERROR: $_"
} finally {
    if ($word -ne $null) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
`;
        fs.writeFileSync(tempPsFile, psScript, 'utf8');

        exec(`powershell -ExecutionPolicy Bypass -File "${tempPsFile}"`, { timeout: 60000 }, (err, stdout, stderr) => {
            try { fs.unlinkSync(tempPsFile); } catch (_) {}
            
            if (err) {
                return reject(err);
            }
            if (stdout && stdout.includes("ERROR:")) {
                return reject(new Error(stdout.trim()));
            }
            if (fs.existsSync(targetPdfPath)) {
                resolve();
            } else {
                reject(new Error("Word COM executed but target PDF file was not created"));
            }
        });
    });
}

function convertDocxToPdfBatch(conversions) {
    if (conversions.length === 0) return Promise.resolve();

    if (process.platform === 'win32') {
        // ── Windows: Single MS Word COM session converts all files ──────────────
        cleanupZombieWordProcesses();

        return new Promise((resolve, reject) => {
            const tempPsFile = path.join(path.dirname(conversions[0].docxPath), `_tmp_batch_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
            
            let conversionSteps = '';
            conversions.forEach(c => {
                const escapedDocx = c.docxPath.replace(/\\/g, '\\\\').replace(/"/g, '`"');
                const escapedPdf = c.targetPdf.replace(/\\/g, '\\\\').replace(/"/g, '`"');
                conversionSteps += `
    try {
        $doc = $word.Documents.Open("${escapedDocx}")
        $doc.SaveAs("${escapedPdf}", 17)
        $doc.Close()
    } catch {
        Write-Output "FAIL: ${escapedDocx} - $_"
    }
`;
            });

            const psScript = `
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    ${conversionSteps}
    Write-Output "SUCCESS"
} catch {
    Write-Output "ERROR: $_"
} finally {
    if ($word -ne $null) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
`;
            fs.writeFileSync(tempPsFile, psScript, 'utf8');

            console.log(`[PDF Conversion] Starting batch conversion of ${conversions.length} files using Microsoft Word COM...`);
            const startTime = Date.now();
            
            exec(`powershell -ExecutionPolicy Bypass -File "${tempPsFile}"`, { timeout: 180000 }, (err, stdout, stderr) => {
                try { fs.unlinkSync(tempPsFile); } catch (_) {}
                if (err) return reject(err);
                if (stdout && stdout.includes('ERROR:')) return reject(new Error(stdout.trim()));
                console.log(`[PDF Conversion] Batch Word COM completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
                resolve();
            });
        });
    }

    // ── Linux / Ubuntu: Single LibreOffice instance converts all files ─────────
    // Uses a per-job isolated user profile so concurrent queue jobs never conflict.
    const libreoffice = process.env.LIBREOFFICE_PATH || 'libreoffice';
    const sessionDir = path.dirname(conversions[0].docxPath);
    const loProfile = `/tmp/lo_profile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const docxList = conversions.map(c => `"${c.docxPath}"`).join(' ');
    const cmd = `"${libreoffice}" --headless --norestore "--env:UserInstallation=file://${loProfile}" --convert-to pdf:writer_pdf_Export --outdir "${sessionDir}" ${docxList}`;

    console.log(`[PDF Conversion] Starting batch conversion of ${conversions.length} files using LibreOffice...`);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        exec(cmd, {
            timeout: 240000,
            maxBuffer: 50 * 1024 * 1024,
            env: { ...process.env, HOME: process.env.HOME || '/root' }
        }, (err, stdout, stderr) => {
            // Always clean up the isolated profile dir
            try { fs.rmSync(loProfile, { recursive: true, force: true }); } catch (_) {}
            if (err) {
                console.warn('[PDF Conversion] LibreOffice batch failed:', err.message);
                return reject(err);
            }
            console.log(`[PDF Conversion] LibreOffice batch completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
            resolve();
        });
    });
}

// Background batch generator
async function processBatchInBackground(sessionId, passportDataList, selectedDocs, company, templateFolder, sessionOutput, outputFormat) {
    try {
        BATCH_STATUS[sessionId] = {
            status: "processing",
            total_batches: 100, // treat as percentage (0-100)
            completed_batches: 0,
            files: [],
            missing_messages: []
        };

        const statusPath = path.join(sessionOutput, 'status.json');
        fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));

        const allConversions = [];
        
        // Step 1: Generate all DOCX files first (very fast)
        for (let i = 0; i < passportDataList.length; i++) {
            const passportData = passportDataList[i];
            const srNo = passportData['srno'] || '0';
            
            try {
                const { generatedDocs, missing } = await generateDocxForPassport(
                    passportData,
                    selectedDocs,
                    company,
                    templateFolder,
                    sessionOutput
                );
                
                allConversions.push(...generatedDocs);
                BATCH_STATUS[sessionId].missing_messages.push(...missing);
            } catch (err) {
                console.error(`Error generating DOCX for passport row ${i}:`, err);
                BATCH_STATUS[sessionId].missing_messages.push(`Row ${i} error: ${err.message}`);
            }
            
            BATCH_STATUS[sessionId].completed_batches = Math.round(((i + 1) / passportDataList.length) * 50); // first 50% for DOCX generation
            BATCH_STATUS[sessionId].progress_label = `Preparing documents: ${i + 1}/${passportDataList.length}`;
            fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));
        }

        // Step 2: Convert all DOCX to PDF if requested
        if (outputFormat === 'pdf' && allConversions.length > 0) {
            // Show queue waiting position (multi-user: may need to wait for other users' jobs)
            const isQueueFull = activeConversionsCount >= MAX_CONCURRENT_CONVERSIONS;
            const aheadInQueue = isQueueFull ? (conversionQueue.length + 1) : 0;
            BATCH_STATUS[sessionId].completed_batches = 55;
            BATCH_STATUS[sessionId].progress_label = aheadInQueue > 0
                ? `Queued — ${aheadInQueue} job(s) ahead, please wait...`
                : 'Starting PDF conversion...';
            fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));

            // Enqueue — this await blocks here until it's this session's turn.
            // Other users' requests are served in parallel (DOCX generation) but
            // PDF conversion is serialized so LibreOffice never runs concurrently.
            await enqueueConversionJob(async () => {
                // It's our turn — update status
                BATCH_STATUS[sessionId].completed_batches = 60;
                BATCH_STATUS[sessionId].progress_label = `Converting ${allConversions.length} documents to PDF...`;
                fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));

                try {
                    await convertDocxToPdfBatch(allConversions);

                    // Check if any files missed batch conversion, and convert them sequentially as a fallback
                    const missedConversions = allConversions.filter(c => !fs.existsSync(c.targetPdf));
                    if (missedConversions.length > 0) {
                        console.warn(`[PDF Conversion] ${missedConversions.length} file(s) missed batch conversion. Retrying sequentially...`);
                        for (let i = 0; i < missedConversions.length; i++) {
                            const c = missedConversions[i];
                            try {
                                await convertDocxToPdf(c.docxPath, sessionOutput);
                            } catch (singleErr) {
                                console.error(`[PDF Conversion] Sequential retry failed for ${c.outputName}:`, singleErr.message);
                            }
                        }
                    }

                    BATCH_STATUS[sessionId].completed_batches = 90;
                    BATCH_STATUS[sessionId].progress_label = 'Finalising files...';
                    fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));

                    // Add files — prefer PDF, fallback to DOCX if conversion missed a file
                    allConversions.forEach(c => {
                        if (fs.existsSync(c.targetPdf)) {
                            try { fs.unlinkSync(c.docxPath); } catch (_) {} // clean up DOCX
                            BATCH_STATUS[sessionId].files.push({
                                name: `${c.outputName}.pdf`,
                                url: `/download/{session_id}/${c.outputName}.pdf`
                            });
                        } else {
                            BATCH_STATUS[sessionId].files.push({
                                name: `${c.outputName}.docx`,
                                url: `/download/{session_id}/${c.outputName}.docx`
                            });
                        }
                    });
                } catch (batchErr) {
                    console.warn('[PDF Conversion] Batch failed, converting sequentially:', batchErr.message);

                    // Sequential fallback — each file individually
                    for (let i = 0; i < allConversions.length; i++) {
                        const c = allConversions[i];
                        try {
                            await convertDocxToPdf(c.docxPath, sessionOutput);
                            if (fs.existsSync(c.targetPdf)) {
                                try { fs.unlinkSync(c.docxPath); } catch (_) {}
                                BATCH_STATUS[sessionId].files.push({
                                    name: `${c.outputName}.pdf`,
                                    url: `/download/{session_id}/${c.outputName}.pdf`
                                });
                            } else {
                                BATCH_STATUS[sessionId].files.push({
                                    name: `${c.outputName}.docx`,
                                    url: `/download/{session_id}/${c.outputName}.docx`
                                });
                            }
                        } catch (singleErr) {
                            console.error(`[PDF Conversion] Sequential fallback failed for ${c.outputName}:`, singleErr.message);
                            BATCH_STATUS[sessionId].files.push({
                                name: `${c.outputName}.docx`,
                                url: `/download/{session_id}/${c.outputName}.docx`
                            });
                        }
                        BATCH_STATUS[sessionId].completed_batches = 60 + Math.round(((i + 1) / allConversions.length) * 30);
                        BATCH_STATUS[sessionId].progress_label = `Converting file ${i + 1}/${allConversions.length}...`;
                        fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));
                    }
                }
            });
        } else {
            // DOCX only
            allConversions.forEach(c => {
                BATCH_STATUS[sessionId].files.push({
                    name: `${c.outputName}.docx`,
                    url: `/download/{session_id}/${c.outputName}.docx`
                });
            });
        }

        BATCH_STATUS[sessionId].completed_batches = 100;
        BATCH_STATUS[sessionId].progress_label = 'Done!';
        BATCH_STATUS[sessionId].status = "completed";
        fs.writeFileSync(statusPath, JSON.stringify(BATCH_STATUS[sessionId]));
    } catch (err) {
        console.error('Background generation error:', err);
        if (BATCH_STATUS[sessionId]) {
            BATCH_STATUS[sessionId].status = "error";
            BATCH_STATUS[sessionId].error = err.message;
            try {
                fs.writeFileSync(
                    path.join(sessionOutput, 'status.json'),
                    JSON.stringify(BATCH_STATUS[sessionId])
                );
            } catch (e) {}
        }
    }
}

// Single passport rows processor (now only generates DOCX)
async function generateDocxForPassport(passportData, selectedDocs, company, templateFolder, sessionOutput) {
    const generatedDocs = [];
    const missing = [];
    const srNo = passportData['srno'] || '0';

    for (const docType of selectedDocs) {
        const required = REQUIRED_FIELDS[docType] || [];
        const missingCols = [];
        for (const col of required) {
            const val = passportData[col];
            if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '0' || String(val).trim().toLowerCase() === 'nan') {
                missingCols.push(col);
            }
        }

        if (missingCols.length > 0) {
            const displayName = DOC_DISPLAY_NAMES[docType] || docType;
            missing.push(`${srNo} ${displayName} : ${missingCols.join(', ')}`);
            continue;
        }

        const countryName = passportData['Country Name'] || '';
        const templatesPath = path.join(templateFolder, String(countryName));
        if (!fs.existsSync(templatesPath)) {
            continue;
        }

        const docConfig = DOC_MAP[docType];
        if (!docConfig) continue;

        const templateFile = docConfig.template;
        const displayName = docConfig.name;
        const outputName = `${srNo}-${displayName}`;

        const templatePath = path.join(templatesPath, templateFile);
        if (!fs.existsSync(templatePath)) {
            continue;
        }

        const replacements = { ...passportData };
        if (replacements['USEDATE']) {
            replacements['USEDATE'] = formatToDmy(replacements['USEDATE']);
        }

        const outputDocx = path.join(sessionOutput, `${outputName}.docx`);

        try {
            const content = fs.readFileSync(templatePath);
            const zip = new PizZip(content);
            const doc = new Docxtemplater(zip, {
                delimiters: { start: '{{', end: '}}' },
                paragraphLoop: true,
                linebreaks: true
            });
            doc.render(replacements);
            const buf = doc.getZip().generate({ type: 'nodebuffer' });
            fs.writeFileSync(outputDocx, buf);

            generatedDocs.push({
                docxPath: outputDocx,
                outputName: outputName,
                targetPdf: path.join(sessionOutput, `${outputName}.pdf`)
            });
        } catch (err) {
            console.error(`Template processing failed for ${outputName}:`, err);
            missing.push(`Error filling ${displayName} for SRNO ${srNo}: ${err.message}`);
        }
    }

    return { generatedDocs, missing };
}

// --- EXPRESS ROUTE HANDLERS ---

// Root / login landing page
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.render('index.html', { email: req.session.user.email });
    }
    res.render('login.html');
});

// Redirect GET /login and GET /register to /
app.get('/login', (req, res) => {
    res.redirect('/');
});
app.get('/register', (req, res) => {
    res.redirect('/');
});

// Login POST Handler
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query("SELECT id, password_hash FROM users WHERE email = ?", [email]);
        const user = rows[0];
        if (user && await bcrypt.compare(password, user.password_hash)) {
            const otp = generateOtp();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            
            await pool.query(
                "INSERT INTO otps (user_email, otp_code, expires_at, purpose) VALUES (?, ?, ?, ?)",
                [email, otp, expiresAt, 'login']
            );

            await transporter.sendMail({
                from: process.env.MAIL_USERNAME,
                to: email,
                subject: 'Your Login OTP',
                text: `Your OTP for login is: ${otp}`
            });

            req.session.pending_user = email;
            req.session.pending_action = 'login';
            req.flash('info', 'OTP sent to your email.');
            req.session.save(() => {
                return res.redirect('/otp');
            });
        } else {
            req.flash('danger', 'Invalid email or password.');
            req.session.save(() => {
                return res.redirect('/');
            });
        }
    } catch (err) {
        console.error(err);
        req.flash('danger', 'An error occurred during login.');
        req.session.save(() => {
            return res.redirect('/');
        });
    }
});

// Register POST Handler
app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
        if (rows.length > 0) {
            req.flash('danger', 'Email already registered.');
            return res.redirect('/');
        }
        
        const otp = generateOtp();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await pool.query(
            "INSERT INTO otps (user_email, otp_code, expires_at, purpose) VALUES (?, ?, ?, ?)",
            [email, otp, expiresAt, 'register']
        );

        await transporter.sendMail({
            from: process.env.MAIL_USERNAME,
            to: process.env.ADMIN_EMAIL,
            subject: 'New User Registration OTP',
            text: `OTP for approving new user (${email}): ${otp}`
        });

        req.session.pending_user = email;
        req.session.pending_password = password;
        req.session.pending_action = 'register';
        req.flash('info', 'OTP sent to admin for approval. Please ask admin for the OTP.');
        req.session.save(() => {
            return res.redirect('/otp');
        });
    } catch (err) {
        console.error(err);
        req.flash('danger', 'An error occurred during registration.');
        req.session.save(() => {
            return res.redirect('/');
        });
    }
});

// OTP GET and POST Handlers
app.get('/otp', (req, res) => {
    res.render('otp.html');
});

app.post('/otp', async (req, res) => {
    const { otp } = req.body;
    const email = req.session.pending_user;
    const action = req.session.pending_action;

    if (!email || !action) {
        req.flash('danger', 'Session expired. Please try again.');
        return res.redirect('/');
    }

    try {
        const [rows] = await pool.query(
            "SELECT id, expires_at FROM otps WHERE user_email = ? AND otp_code = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
            [email, otp, action]
        );
        const record = rows[0];

        if (record && new Date() < new Date(record.expires_at)) {
            if (action === 'login') {
                const [uRows] = await pool.query("SELECT id, email FROM users WHERE email = ?", [email]);
                const userRow = uRows[0];
                if (userRow) {
                    req.session.user = { id: userRow.id, email: userRow.email };
                    req.session.user_email = email;
                    req.flash('success', 'Login successful!');
                    await pool.query("DELETE FROM otps WHERE id = ?", [record.id]);
                    
                    delete req.session.pending_user;
                    delete req.session.pending_action;
                    req.session.save(() => {
                        return res.redirect('/');
                    });
                }
            } else if (action === 'register') {
                const password = req.session.pending_password;
                const hashedPassword = await bcrypt.hash(password, 10);
                
                await pool.query("INSERT INTO users (email, password_hash) VALUES (?, ?)", [email, hashedPassword]);
                await pool.query("DELETE FROM otps WHERE id = ?", [record.id]);
                
                delete req.session.pending_user;
                delete req.session.pending_password;
                delete req.session.pending_action;

                req.flash('success', 'Registration successful! You can now log in.');
                req.session.save(() => {
                    return res.redirect('/');
                });
            }
        } else {
            req.flash('danger', 'Invalid or expired OTP.');
            req.session.save(() => {
                return res.redirect('/otp');
            });
        }
    } catch (err) {
        console.error(err);
        req.flash('danger', 'An error occurred during OTP verification.');
        req.session.save(() => {
            return res.redirect('/otp');
        });
    }
});

// Forgot & Reset Password Handlers
app.get('/forgot-password', (req, res) => {
    res.render('forgot_password.html');
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
        const user = rows[0];
        if (user) {
            const crypto = require('crypto');
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            await pool.query(`
                INSERT INTO password_resets (user_id, token, expires_at)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE token = ?, expires_at = ?
            `, [user.id, token, expiresAt, token, expiresAt]);

            const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
            await transporter.sendMail({
                from: process.env.MAIL_USERNAME,
                to: email,
                subject: 'Password Reset Request',
                text: `Click the link to reset your password: ${resetUrl}\nThis link will expire in 1 hour.`
            });
            req.flash('info', 'A password reset link has been sent to your email.');
        } else {
            req.flash('danger', 'Email not found.');
        }
        req.session.save(() => {
            res.redirect('/forgot-password');
        });
    } catch (err) {
        console.error(err);
        req.flash('danger', 'An error occurred during password reset.');
        req.session.save(() => {
            res.redirect('/forgot-password');
        });
    }
});

app.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const [rows] = await pool.query("SELECT user_id, expires_at FROM password_resets WHERE token = ?", [token]);
        const record = rows[0];
        if (!record || new Date() > new Date(record.expires_at)) {
            req.flash('danger', 'Invalid or expired token.');
            return res.redirect('/');
        }
        res.render('reset_password.html', { token });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

app.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;
    try {
        const [rows] = await pool.query("SELECT user_id, expires_at FROM password_resets WHERE token = ?", [token]);
        const record = rows[0];
        if (!record || new Date() > new Date(record.expires_at)) {
            req.flash('danger', 'Invalid or expired token.');
            return res.redirect('/');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashedPassword, record.user_id]);
        await pool.query("DELETE FROM password_resets WHERE token = ?", [token]);

        req.flash('success', 'Your password has been reset. Please log in.');
        req.session.save(() => {
            res.redirect('/');
        });
    } catch (err) {
        console.error(err);
        req.flash('danger', 'An error occurred during password reset.');
        req.session.save(() => {
            res.redirect('/');
        });
    }
});

// Dashboard landing route
app.get('/dashboard', loginRequired, (req, res) => {
    res.render('index.html', { email: req.session.user.email });
});

// Logout route
app.get('/logout', loginRequired, (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Search SRNOs for a date and company
app.post('/search-srnos', loginRequired, async (req, res) => {
    const { useDate, company } = req.body;
    try {
        const rows = await getGoogleSheetData(company);
        const filtered = rows.filter(row => {
            const sheetDate = formatToYmd(row['USEDATE']);
            return sheetDate === useDate;
        });
        const srnos = [...new Set(filtered.map(row => row['srno']).filter(Boolean))];
        res.json({
            count: srnos.length,
            srnos: srnos
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

// Filter count SRNOs for date and company
app.post('/filter-by-date', loginRequired, async (req, res) => {
    const { date, company } = req.body;
    if (!date || !company) {
        return res.json({ success: false, message: "Missing date or company" });
    }
    try {
        const rows = await getGoogleSheetData(company);
        const filtered = rows.filter(row => {
            const sheetDate = formatToYmd(row['USEDATE']);
            const matchDate = formatToYmd(date);
            return sheetDate === matchDate && row['srno'] && String(row['srno']).trim() !== '0';
        });

        const srnos = filtered.map(row => parseInt(row['srno'])).filter(val => !isNaN(val));
        res.json({
            success: true,
            total: srnos.length,
            srnos: srnos
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

// Document processing handler
app.post('/process', loginRequired, async (req, res) => {
    try {
        const { passportNumber, startSrno, endSrno, outputFormat, company, selectedDocs, useDate } = req.body;

        const TEMPLATE_FOLDER = COMPANY_TEMPLATES[company];
        if (!TEMPLATE_FOLDER || !fs.existsSync(TEMPLATE_FOLDER)) {
            return res.json({ success: false, message: "Invalid company selected" });
        }

        const rows = await getGoogleSheetData(company);
        let selectedRows = [];

        if (startSrno && endSrno) {
            const start = parseInt(startSrno);
            const end = parseInt(endSrno);

            selectedRows = rows.filter(row => {
                const sheetDate = formatToYmd(row['USEDATE']);
                const srnoStr = String(row['srno'] || '').trim();
                if (!/^\d+$/.test(srnoStr)) return false;
                const srnoInt = parseInt(srnoStr);
                return sheetDate === useDate && srnoInt >= start && srnoInt <= end;
            });
        } else if (passportNumber) {
            const passportSearch = String(passportNumber).trim().toUpperCase();
            const passportRows = rows.filter(row => {
                const rowPassport = String(row['PASSPORTNO'] || '').trim().toUpperCase();
                return rowPassport === passportSearch;
            });

            if (passportRows.length === 0) {
                return res.json({ success: false, message: "Passport number not found." });
            }

            // Sort by USEDATE descending to fetch latest record
            passportRows.sort((a, b) => {
                const dateA = new Date(formatToYmd(a['USEDATE']) || 0);
                const dateB = new Date(formatToYmd(b['USEDATE']) || 0);
                return dateB - dateA;
            });

            selectedRows = [passportRows[0]];
        } else {
            return res.json({ success: false, message: "Invalid filter parameters" });
        }

        if (selectedRows.length === 0) {
            return res.json({ success: false, message: "No matching records found" });
        }

        // Clean values for documents
        const cleanedRows = selectedRows.map(row => {
            const rowCopy = { ...row };
            rowCopy['CRNONDIDNO'] = cleanCrnondidno(rowCopy['CRNONDIDNO']);
            if (rowCopy['Country Name']) {
                rowCopy['Country Name'] = String(rowCopy['Country Name']).trim();
            }
            return rowCopy;
        });

        const sessionId = uuidv4();
        const sessionOutput = path.join(OUTPUT_FOLDER, sessionId);
        fs.mkdirSync(sessionOutput, { recursive: true });

        // Start async generation process in background
        processBatchInBackground(
            sessionId,
            cleanedRows,
            selectedDocs,
            company,
            TEMPLATE_FOLDER,
            sessionOutput,
            outputFormat
        );

        res.json({
            success: true,
            session_id: sessionId,
            message: "Document generation started"
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: `Processing error: ${err.message}` });
    }
});

// Generation progress / status check handler
app.get('/batch-status/:session_id', loginRequired, async (req, res) => {
    const { session_id } = req.params;
    try {
        if (BATCH_STATUS[session_id]) {
            const status = { ...BATCH_STATUS[session_id] };
            status.files = status.files.map(f => ({
                name: f.name,
                url: f.url.replace('{session_id}', session_id)
            }));
            return res.json({ success: true, ...status });
        }

        const statusPath = path.join(OUTPUT_FOLDER, session_id, 'status.json');
        if (fs.existsSync(statusPath)) {
            const content = fs.readFileSync(statusPath, 'utf8');
            const status = JSON.parse(content);
            status.files = status.files.map(f => ({
                name: f.name,
                url: f.url.replace('{session_id}', session_id)
            }));
            return res.json({ success: true, ...status });
        }

        res.json({ success: false, message: "Session not found" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

// Single file download route
app.get('/download/:session_id/:filename', loginRequired, (req, res) => {
    const { session_id, filename } = req.params;
    const filePath = path.join(OUTPUT_FOLDER, session_id, filename);

    // Security check to avoid directory traversal
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(OUTPUT_FOLDER)) {
        return res.status(403).send("Forbidden");
    }

    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("File not found");
    }
});

// Download all files as a ZIP archive
async function handleDownloadAll(sessionId, filePrefix, res) {
    if (!sessionId) {
        return res.status(404).send("No files to download. Generate documents first.");
    }
    const sessionDir = path.join(OUTPUT_FOLDER, sessionId);
    if (!fs.existsSync(sessionDir)) {
        return res.status(404).send("Session files not found");
    }

    const zipName = filePrefix ? `${filePrefix}.zip` : 'all_documents.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
        console.error('Archiver error:', err);
        res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    const files = fs.readdirSync(sessionDir);
    for (const file of files) {
        const filePath = path.join(sessionDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.docx'))) {
            archive.file(filePath, { name: file });
        }
    }

    await archive.finalize();
}

app.post('/download-all', loginRequired, async (req, res) => {
    const { session_id, file_prefix } = req.body;
    await handleDownloadAll(session_id, file_prefix, res);
});

app.get('/download-all', loginRequired, async (req, res) => {
    const { session_id, file_prefix } = req.query;
    await handleDownloadAll(session_id, file_prefix, res);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Document Generator running on http://localhost:${PORT}`);
    await initDb();

    // On startup: sweep zombie converters and old output folders
    cleanupZombieWordProcesses();
    cleanupOldOutputFolders();

    // Schedule old output folder cleanup every 24 hours
    setInterval(cleanupOldOutputFolders, 24 * 60 * 60 * 1000);

    // Schedule midnight output sweep to prevent storage full risk
    scheduleMidnightCleanup();
});
