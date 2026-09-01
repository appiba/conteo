const SHEET_NAME = 'Ingresos';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const sheet = getSheet_();
    ensureHeaders_(sheet);

    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    sheet.appendRow([
      Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss'),
      payload.camera || 'CAMARA_01',
      payload.type || 'entry',
      Number(payload.count || 0)
    ]);

    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'conteo-ingresos' });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  const headers = ['FECHA', 'HORA', 'CAMARA', 'EVENTO', 'TOTAL'];
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('') !== headers.join('')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
