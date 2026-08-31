# Google Sheet Sync

Standalone worker data sync system for your private Google Sheet.

This folder does not modify the existing document downloader. It creates separate MySQL tables and reads the private Sheet directly with a Google service account.

## Your Google Sheet

```text
https://docs.google.com/spreadsheets/d/1l2BKCn8NmDHA6wQ-x_sxpLRsDPjehmaCuNEA6wrdYT0/edit?gid=262745233#gid=262745233
```

Service account shared with the Sheet:

```text
sheet-database-sync@civil-partition-484414-p9.iam.gserviceaccount.com
```

Tabs to sync:

```text
AR INT              -> google_sheet_ar_int_records
ROYAL SKY INT       -> google_sheet_royal_sky_int_records
VIVAN 2024          -> google_sheet_vivan_2024_records
SNS GLOBAL SERVICE  -> google_sheet_sns_global_service_records
```

Only records where the first-row `date` is `2026-01-01` or newer are stored.

Date cells may be written as `dd.mm.yyyy`, `dd-mm-yyyy`, or `dd/mm/yyyy`. Blank date cells below a dated record inherit the last date above them until the next date appears, so serial numbers 2, 3, 4, etc. stay in the same date block.

The sync saves data into the MySQL database named by `MYSQL_DB` in `google-sheet-sync/.env`. By default that is `google_sheet_sync`. The database is created automatically if it does not exist, then these tables are created inside it.

## Cell Alignment

Each worker record uses 3 rows and columns A-J.

```text
Row 1:
A date
B ppt_name
C ppt_number - en_number
D dob
F sponsor_phone_number
G jb_id
H visa_number
I father_name
J legal_status

Row 2:
A sr_no
B ppt_address
C ppt_issue_date
D ppt_issue_place
E country
F category - salary
G sponsor_name
H visa_issue_date
J id_name

Row 3:
A broker_name
B job_role
C ppt_expiry_date
D fe_number
E dm_number
F sponsor_address
G cr_number
H visa_expiry_date
I mother_name
J id_number
```

Important split cells:

```text
pptno - enno       -> ppt_number + en_number
category - salary  -> category + salary
```

## Safe Design

```text
Private Google Sheet
  -> service account reads with Google Sheets API
  -> parser groups every 3 rows into 1 record
  -> bad/header rows are skipped with warnings
  -> each tab writes to its own MySQL table
  -> each tab write runs in a transaction
  -> missing records become inactive, not deleted
```

Unsafe values like `02` are not used as passport keys.

Records are read back in proper date order: `date` ascending first, then original Google Sheet row order.

## Environment

Private ignored config:

```text
google-sheet-sync/.env
```

Important values:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=google_sheet_sync
GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE=google-sheet-sync/key/civil-partition-484414-p9-a02021fad08b.json
GOOGLE_WORKER_SHEET_TABS=AR INT,ROYAL SKY INT,VIVAN 2024,SNS GLOBAL SERVICE
GOOGLE_WORKER_DATE_FROM=2026-01-01
GOOGLE_WORKER_SKIP_TOP_ROWS=0
GOOGLE_WORKER_AUTO_DETECT_FIRST_DATA_ROW=true
GOOGLE_WORKER_SYNC_PORT=5200
GOOGLE_WORKER_AUTO_SYNC=true
GOOGLE_WORKER_RUN_ON_START=true
GOOGLE_WORKER_SYNC_INTERVAL_MS=300000
```

When `GOOGLE_WORKER_AUTO_DETECT_FIRST_DATA_ROW=true`, the sync finds the first row where column A is a date on or after `2026-01-01`, then starts 3-row grouping from there.

## Safe Run Order

Check Google access only:

```bash
node google-sheet-sync/src/checkGoogleAccess.js
```

Dry-run parser only, no MySQL writes:

```bash
node google-sheet-sync/src/dryRunParse.js
```

Check `recordSamples` in the dry-run output before writing. `pptName` should be a person name, and `pptNumber` should be a passport number.

Clear partial test data only from the four new sync tables:

```bash
node google-sheet-sync/src/clearSyncTables.js
```

Create/check the MySQL database and four tables only:

```bash
node google-sheet-sync/src/checkDatabase.js
```

Run one direct database sync:

```bash
node google-sheet-sync/src/cli.js
```

## Automatic Sync

Keep this process running:

```bash
node google-sheet-sync/server.js
```

Behavior:

```text
server starts -> sync now -> wait 5 minutes -> sync again -> repeat
```

If you see `EADDRINUSE` or `Port 5200 is already in use`, the sync server is already running. Check it here:

```text
http://127.0.0.1:5200/health
```

Manual API sync:

```text
POST http://127.0.0.1:5200/api/google-sheet-sync/sync
```

Search/status API:

```text
GET http://127.0.0.1:5200/api/google-sheet-sync/status
GET http://127.0.0.1:5200/api/google-sheet-sync/records?tab=AR%20INT&q=passport-or-name
```

## Optional Apps Script For Instant Edits

Direct Google API sync updates every 5 minutes. If you later want instant sync on every edit, use:

```text
google-sheet-sync/apps-script/sheet-sync-webhook.gs
```

For Apps Script, your server needs public HTTPS. Google cannot call `127.0.0.1`.

## Tests

```bash
node --check google-sheet-sync/src/checkGoogleAccess.js
node --check google-sheet-sync/src/dryRunParse.js
node --check google-sheet-sync/src/clearSyncTables.js
node google-sheet-sync/tests/config.test.js
node google-sheet-sync/tests/normalizer.test.js
node google-sheet-sync/tests/serviceAccountAuth.test.js
node google-sheet-sync/tests/syncService.test.js
node google-sheet-sync/tests/recordRepository.test.js
```