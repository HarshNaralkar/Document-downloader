# Google Sheet Sync Brain

## Purpose

This folder is a new system for turning the worker Google Sheet into database records. It is intentionally separate from the existing document downloader code.

The first goal is:

```text
Google Sheet
  -> read raw rows
  -> group every 3 rows as 1 worker record
  -> split combined cells
  -> normalize fields
  -> store in MySQL
  -> keep MySQL synced when the Sheet changes
```

No existing app file, template, document, cache file, or old database table is required to change for this first step.

## Core Rule

The Sheet is not database-ready. One worker record is spread across 3 consecutive rows.

```text
Sheet rows 1, 2, 3 -> database record 1
Sheet rows 4, 5, 6 -> database record 2
Sheet rows 7, 8, 9 -> database record 3
```

The row number in Google Sheets is only a source location. It must not be used as the permanent identity of a worker, because row numbers change when users insert or delete rows.

## Confirmed Cell Map

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

Blank cells are ignored unless later you decide they need meaning.
## Split Rules

Two cells contain two database columns:

```text
ppt_number_en_number = "PPTNO-ENNO"
  -> ppt_number
  -> en_number

category_salary = "CATEGORY-SALARY"
  -> category
  -> salary
```

The split happens at the first minus sign only. Example:

```text
AH040768-EN15977435 -> ppt_number AH040768, en_number EN15977435
DRIVER-120          -> category DRIVER, salary 120
```

The original 3 rows are still saved in `raw_data`, so nothing is lost if the mapping needs improvement later.


## Google Connection Requirements

Public Sheet path:

```text
Required from user:
  GOOGLE_WORKER_SHEET_URL
  GOOGLE_WORKER_SKIP_TOP_ROWS

Not required:
  Google API key
  service account JSON
```

Private Sheet path:

```text
Required from user:
  live HTTPS server URL
  GOOGLE_WORKER_SYNC_SECRET
  Apps Script installed from apps-script/sheet-sync-webhook.gs
```

The config supports a normal Sheet URL like:

```text
https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=0#gid=0
```

The code extracts `SHEET_ID` and `gid` automatically.

## System Parts

```text
google-sheet-sync/
  brain.md
  README.md
  .env.example
  apps-script/
    sheet-sync-webhook.gs
  config/
    sheetMapping.js
    syncConfig.js
  db/
    createPool.js
    schema.sql
  src/
    cli.js
    dateUtils.js
    googleSheetClient.js
    recordRepository.js
    routes.js
    scheduler.js
    syncService.js
    threeRowNormalizer.js
  tests/
    normalizer.test.js
```

## Database Tables

This system creates new tables only:

```text
google_sheet_ar_int_records
google_sheet_royal_sky_int_records
google_sheet_vivan_2024_records
google_sheet_sns_global_service_records
google_sheet_sync_runs
```

Main worker columns:

```text
date, sr_no, broker_name,
ppt_name, ppt_address, ppt_number, en_number,
ppt_issue_date, ppt_issue_place, ppt_expiry_date, dob,
country, fe_number, dm_number,
sponsor_phone_number, sponsor_name, sponsor_address,
category, salary, cr_number,
jb_id, visa_issue_date, visa_expiry_date, visa_number,
father_name, mother_name, legal_status,
id_name, id_number, job_role,
source_key, row_hash, is_active, source_row_start, source_row_end, raw_data
```

## Identity Rule

Use this priority for `source_key`:

```text
1. ppt_number
2. en_number
3. ppt_name + dob
4. ppt_name + country + date
5. source row fallback
```

`ppt_number` is best. Source row fallback exists only so bad/incomplete Sheet data can still be inspected.

## Soft Delete Rule

Do not delete database rows when a worker disappears from Google Sheet.

Instead:

```text
exists in Sheet     -> is_active = true
missing from Sheet  -> is_active = false
```

This protects against accidental Sheet deletes.

## Sync Workflow

```text
Google edit
  -> Apps Script webhook
  -> /api/google-sheet-sync/sync/from-payload
  -> 3-row grouping
  -> split ppt/en and category/salary
  -> normalize dates
  -> insert/update/inactivate
```

A scheduled full sync should also run every few minutes as a safety check.

```text
Apps Script trigger = fast update after edits
Scheduled full sync = safety net for pasted rows, row moves, deletes, missed triggers
```

## API Plan

When connected to Express, this router provides:

```text
GET  /api/google-sheet-sync/status
POST /api/google-sheet-sync/sync
POST /api/google-sheet-sync/sync/from-payload
GET  /api/google-sheet-sync/records
GET  /api/google-sheet-sync/records/:id
```

The router is not connected to the existing app yet, because this first step keeps all old code untouched.

## Security

Use `GOOGLE_WORKER_SYNC_SECRET`.

Apps Script must send this secret with every request:

```text
X-Sheet-Sync-Secret: your-secret
```

The Node route rejects sync requests when the secret is configured and missing/wrong.

## What Not To Do

Do not sort the Sheet to fix this.

Do not make the frontend read Google Sheet directly.

Do not use Google row number as the main unique ID.

Do not delete database records when Sheet rows disappear.

Do not edit the document downloader logic until this sync system is tested by itself.

## Next Build Steps

1. Run `node google-sheet-sync/tests/normalizer.test.js`.
2. Run `node google-sheet-sync/src/cli.js` against a test database.
3. Review inserted records in MySQL.
4. Add the Apps Script trigger.
5. Only after sync is stable, connect the router to the main Express app.
6. Build a separate database search page.

## Date Block Rule

Google Sheet dates may be written as dd.mm.yyyy. Blank date cells inherit the previous record date until the next date appears. This keeps serial numbers below one highlighted date inside the same MySQL date block and allows proper DATE sorting.
