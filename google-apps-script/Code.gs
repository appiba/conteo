const EVENTS_SHEET = 'EVENTOS';
const SUMMARY_SHEET = 'RESUMEN_HORARIO';
const REPORT_TIMEZONE = 'America/Guayaquil';

const EVENT_HEADERS = [
  'FECHA',
  'HORA',
  'TIMESTAMP',
  'CAMARA',
  'EVENTO',
  'GRUPO_ETARIO',
  'CONFIANZA',
  'TOTAL',
  'INTERVALO_SEGUNDOS',
  'FRANJA_HORARIA'
];

const SUMMARY_HEADERS = [
  'FECHA',
  'CAMARA',
  'FRANJA',
  'TOTAL',
  'NIÑOS',
  'ADOLESCENTES',
  'JOVENES',
  'ADULTOS',
  'ADULTOS_MAYORES',
  'SIN_DETERMINAR',
  'PROMEDIO_SEGUNDOS_ENTRE_INGRESOS',
  'MAX_PERSONAS_MINUTO',
  'COBERTURA',
  'ESTIMADO_HORA_COMPLETA'
];

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');

    if (payload.type === 'hourly_summary') {
      upsertSummary_(payload.summary || {}, payload.camera || 'CAMARA_01');
      return json_({ ok: true });
    }

    const entry = payload.entry || payload;
    appendEntry_(entry);
    if (payload.summary) {
      upsertSummary_(payload.summary, entry.camera || payload.camera || 'CAMARA_01');
    }
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'conteo-afluencia', timezone: REPORT_TIMEZONE });
}

function appendEntry_(entry) {
  const sheet = getSheet_(EVENTS_SHEET);
  ensureHeaders_(sheet, EVENT_HEADERS);
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  sheet.appendRow([
    entry.date || Utilities.formatDate(timestamp, REPORT_TIMEZONE, 'dd/MM/yyyy'),
    Utilities.formatDate(timestamp, REPORT_TIMEZONE, 'HH:mm:ss'),
    entry.timestamp || Utilities.formatDate(timestamp, REPORT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    entry.camera || 'CAMARA_01',
    entry.event || 'ENTRY',
    entry.age_group || 'SIN_DETERMINAR',
    Number(entry.age_confidence || entry.confidence || 0),
    Number(entry.total_count || entry.count || 0),
    entry.seconds_since_previous_entry === null || entry.seconds_since_previous_entry === undefined
      ? ''
      : Number(entry.seconds_since_previous_entry),
    entry.hour_bucket || ''
  ]);
}

function upsertSummary_(summary, camera) {
  const sheet = getSheet_(SUMMARY_SHEET);
  ensureHeaders_(sheet, SUMMARY_HEADERS);
  const timestamp = summary.timestamp ? new Date(summary.timestamp) : new Date();
  const date = summary.date || Utilities.formatDate(timestamp, REPORT_TIMEZONE, 'dd/MM/yyyy');
  const row = [
    date,
    camera || summary.camera || 'CAMARA_01',
    summary.hour || summary.hour_bucket || '',
    Number(summary.count || summary.actual_count || 0),
    Number(summary.children || 0),
    Number(summary.adolescents || 0),
    Number(summary.youth || 0),
    Number(summary.adults || 0),
    Number(summary.older_adults || 0),
    Number(summary.undetermined || 0),
    summary.avg_seconds_between_entries === null || summary.avg_seconds_between_entries === undefined
      ? ''
      : Number(summary.avg_seconds_between_entries),
    Number(summary.peak_people_per_minute || 0),
    Number(summary.coverage_percentage || 0),
    summary.estimated_full_hour_count === null || summary.estimated_full_hour_count === undefined
      ? ''
      : Number(summary.estimated_full_hour_count)
  ];

  const targetRow = findSummaryRow_(sheet, row[0], row[1], row[2]);
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function findSummaryRow_(sheet, date, camera, bucket) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let index = 0; index < values.length; index++) {
    if (values[index][0] === date && values[index][1] === camera && values[index][2] === bucket) {
      return index + 2;
    }
  }
  return -1;
}

function getSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  return sheet;
}

function ensureHeaders_(sheet, headers) {
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
