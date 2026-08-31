var SYNC_URL = 'https://your-domain.com/api/google-sheet-sync/sync/from-payload';
var SYNC_SECRET = 'change-this-secret';
var SYNC_SHEET_NAMES = [
  'AR INT',
  'ROYAL SKY INT',
  'VIVAN 2024',
  'SNS GLOBAL SERVICE'
];

function isConfiguredSheet_(sheetName) {
  return SYNC_SHEET_NAMES.indexOf(sheetName) !== -1;
}

function readSheet_(sheet) {
  return {
    name: sheet.getName(),
    rows: sheet.getDataRange().getValues()
  };
}

function sendPayload_(payload) {
  var response = UrlFetchApp.fetch(SYNC_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Sheet-Sync-Secret': SYNC_SECRET
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}

function sendOneSheetToDatabase_(sheet, triggerName) {
  if (!sheet || !isConfiguredSheet_(sheet.getName())) {
    return;
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  sendPayload_({
    trigger: triggerName || 'onEdit',
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    rows: sheet.getDataRange().getValues()
  });
}

function sendAllSheetsToDatabase_(triggerName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = [];

  SYNC_SHEET_NAMES.forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('Sheet tab not found: ' + sheetName);
    }
    sheets.push(readSheet_(sheet));
  });

  sendPayload_({
    trigger: triggerName || 'manual',
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheets: sheets
  });
}

function sheetSyncOnEdit(e) {
  if (!e || !e.range) {
    return;
  }
  sendOneSheetToDatabase_(e.range.getSheet(), 'onEdit');
}

function syncNow() {
  sendAllSheetsToDatabase_('manual');
}

function scheduledFullSync() {
  sendAllSheetsToDatabase_('scheduled');
}

function createInstallableEditTrigger() {
  ScriptApp.newTrigger('sheetSyncOnEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}

function createFiveMinuteFullSyncTrigger() {
  ScriptApp.newTrigger('scheduledFullSync')
    .timeBased()
    .everyMinutes(5)
    .create();
}