// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  SPREADSHEET_ID: '1L57FfGbos21rzGu4ciuKipcumJchqe2ZzDPUyp-oRmM',
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby-KmIXY2Qu8zooU4f-hjbdpb59WKonTPJOwcktDV0SjxW5CJPMbtAV1rO0SdJx_0tK8Q/exec',
  ADMIN_EMAIL: 'admin@healthmatters.clinic',
  CC_EMAILS: 'events@healthmatters.clinic',
  LOGO_URL: 'https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png',
  TIMEZONE: 'America/Los_Angeles'
};

// ========================================
// PASSCODE AUTH FUNCTIONS
// ========================================

function sha256(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return raw.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function getConfigSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.appendRow(['key', 'value', 'expires']);
  }
  return sheet;
}

function getConfigValue(key) {
  var sheet = getConfigSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return { value: data[i][1], expires: data[i][2], row: i + 1 };
  }
  return null;
}

function setConfigValue(key, value, expires) {
  var sheet = getConfigSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 3).setValue(expires || '');
      return;
    }
  }
  sheet.appendRow([key, value, expires || '']);
}

function verifyPasscode(hash) {
  var stored = getConfigValue('passcode_hash');
  if (!stored || !stored.value) {
    return { success: false, needsSetup: true };
  }
  return { success: stored.value === hash };
}

function requestPasscodeReset() {
  var code = '';
  for (var i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  var codeHash = sha256(code);
  var expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  setConfigValue('reset_code', codeHash, expires);

  try {
    var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
      '<body style="font-family:Inter,Arial,sans-serif;margin:0;padding:20px;background:#f5f3ef;">' +
      '<div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:1px solid #e5e5e5;">' +
      '<div style="background:#233dff;color:white;padding:24px;text-align:center;">' +
      '<img src="' + CONFIG.LOGO_URL + '" alt="HMC" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;">' +
      '<h1 style="margin:0;font-size:22px;font-weight:700;">Event Finder Admin</h1>' +
      '<p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Passcode Reset</p></div>' +
      '<div style="padding:32px;text-align:center;">' +
      '<p style="color:#666;font-size:15px;margin:0 0 24px;">Your admin reset code is:</p>' +
      '<div style="background:#f0f4ff;padding:20px;border-radius:12px;margin:0 0 24px;border:1.5px solid rgba(35,61,255,0.2);">' +
      '<p style="font-size:36px;font-weight:800;color:#233dff;letter-spacing:8px;margin:0;">' + code + '</p></div>' +
      '<p style="color:#999;font-size:13px;margin:0;">This code expires in 15 minutes.</p>' +
      '</div></div></body></html>';

    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: 'Event Finder Admin - Passcode Reset Code',
      htmlBody: htmlBody,
      name: 'Health Matters Clinic Events'
    });
  } catch (err) {
    Logger.log('Reset email error: ' + err);
    return { success: false, error: 'Failed to send email' };
  }

  return { success: true };
}

function resetPasscode(codeHash, newPasscodeHash) {
  if (!codeHash || !newPasscodeHash) {
    return { success: false, error: 'Missing code or new passcode' };
  }

  var stored = getConfigValue('reset_code');
  if (!stored || !stored.value) {
    return { success: false, error: 'No reset code found. Request a new one.' };
  }

  // Check expiry
  if (stored.expires && new Date(stored.expires) < new Date()) {
    setConfigValue('reset_code', '', '');
    return { success: false, error: 'Reset code expired. Request a new one.' };
  }

  if (stored.value !== codeHash) {
    return { success: false, error: 'Invalid reset code' };
  }

  // Set new passcode and clear reset code
  setConfigValue('passcode_hash', newPasscodeHash, '');
  setConfigValue('reset_code', '', '');

  return { success: true };
}

// ========================================
// doGet - handles all incoming requests
// ========================================
function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, events: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var p = e.parameter;
  var action = p.action || '';

  // ===== AUTH ACTIONS =====
  if (action === 'verifyPasscode') {
    var result = verifyPasscode(p.hash || '');
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'requestPasscodeReset') {
    var result = requestPasscodeReset();
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'resetPasscode') {
    var result = resetPasscode(p.codeHash || '', p.newHash || '');
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ===== RSVP COUNT (for landing page counter) =====
  if (action === 'getRSVPCount') {
    var eventIds = (p.eventIds || '').split(',').filter(function(id) { return id; });
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('RSVPs');
    var count = 0;
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues(); // Column B = Event ID
      for (var i = 0; i < data.length; i++) {
        if (eventIds.length === 0 || eventIds.indexOf(String(data[i][0])) !== -1) {
          count++;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, count: count }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ===== HEALTH PING (lightweight — for monitoring, no Spreadsheet read) =====
  if (action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, ts: Date.now() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ===== EVENT ACTIONS (return JSON) =====
  if (action === 'getEvents') {
    return ContentService.createTextOutput(JSON.stringify(getEvents()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getEvent') {
    return ContentService.createTextOutput(JSON.stringify(getEvent(p.id)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ===== RSVP (image ping) =====
  if (action === 'preregister') {
    var payload = {
      eventId: p.eventId || '',
      eventTitle: p.eventTitle || '',
      eventDate: p.eventDate || '',
      eventTime: p.eventTime || '',
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      contact_method: p.contact_method || 'text',
      sms_consent: p.sms_consent === 'true',
      isMinor: p.isMinor === 'true',
      minorName: p.minorName || '',
      needs: p.needs || '',
      lang: p.lang || 'en',
      source: p.source || ''
    };
    handleRSVP(payload);
    return HtmlService.createHtmlOutput('OK');
  }

  // ===== PARTNER REQUEST (image ping) =====
  if (action === 'partner_request') {
    var payload = {
      name: p.name || '',
      email: p.email || '',
      organization: p.organization || '',
      eventTitle: p.eventTitle || '',
      eventDescription: p.eventDescription || '',
      proposedDate: p.proposedDate || '',
      eventTime: p.eventTime || '',
      location: p.location || '',
      flyerUrl: p.flyerUrl || '',
      lang: p.lang || 'en'
    };
    handlePartnerRequest(payload);
    return HtmlService.createHtmlOutput('OK');
  }

  // ===== SAVE EVENT (via GET for CORS compatibility) =====
  if (action === 'saveEvent') {
    try {
      var eventData = p.event ? JSON.parse(p.event) : null;
      if (eventData) {
        var result = saveEvent(eventData);
        return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Failed to parse event data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ===== DELETE EVENT (via GET for CORS compatibility) =====
  if (action === 'deleteEvent') {
    var result = deleteEvent(p.id);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ===== CHECK-IN BY TOKEN (returns HTML page) =====
  if (p.token) {
    return handleCheckinByToken(p.token);
  }

  // Default: return empty events
  return ContentService.createTextOutput(JSON.stringify({ success: true, events: [] }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================================
// doPost - handles POST requests
// ========================================
function doPost(e) {
  try {
    var params = e.parameter || {};

    // Handle POST body - try to parse as JSON regardless of content-type
    // (no-cors mode sends as text/plain, but content is still JSON)
    if (e.postData && e.postData.contents) {
      try {
        var jsonParams = JSON.parse(e.postData.contents);
        for (var key in jsonParams) {
          params[key] = jsonParams[key];
        }
      } catch (parseError) {
        // Continue with URL params if JSON parsing fails
        Logger.log('Failed to parse POST body as JSON: ' + parseError);
      }
    }

    var action = params.action || '';
    var result;

    switch (action) {
      case 'verifyPasscode':
        result = verifyPasscode(params.hash || '');
        break;
      case 'requestPasscodeReset':
        result = requestPasscodeReset();
        break;
      case 'resetPasscode':
        result = resetPasscode(params.codeHash || '', params.newHash || '');
        break;
      case 'saveEvent':
        result = saveEvent(params.event || params);
        break;
      case 'deleteEvent':
        result = deleteEvent(params.id);
        break;
      case 'saveAllEvents':
        result = saveAllEvents(params.events);
        break;
      case 'preregister':
        handleRSVP(params);
        result = { success: true };
        break;
      case 'partner_request':
        handlePartnerRequest(params);
        result = { success: true };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// EVENTS FUNCTIONS
// ========================================

// Normalize an ID value for comparison (handles Sheets auto-formatting IDs as Date objects)
function normalizeId(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'UTC', 'MMM-dd-yyyy');
  }
  return String(val);
}

function getEvents() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');

    if (!sheet) {
      return { success: true, events: [] };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, events: [] };
    }

    // Read all 19 columns explicitly — getDataRange() can miss trailing empty columns
    var headers = sheet.getRange(1, 1, 1, 19).getValues()[0];
    var data = sheet.getRange(1, 1, lastRow, 19).getValues();
    var events = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // Skip empty rows

      var event = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j];
        var value = row[j];

        // Handle Date objects from Google Sheets
        // Sheets auto-formats date-like strings (e.g. "Mar-14-2026") as Date objects,
        // which causes timezone-related corruption when serialized to JSON.
        // Use 'UTC' to avoid timezone shifts — the dates were entered as plain text
        // and Sheets stores them as midnight UTC internally.
        if (value instanceof Date) {
          if (header === 'id') {
            // Preserve original Mon-DD-YYYY format for IDs (e.g. "Mar-14-2026")
            value = Utilities.formatDate(value, 'UTC', 'MMM-dd-yyyy');
          } else if (header === 'date') {
            // Format as YYYY-MM-DD for the date field
            value = Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
          } else if (header === 'time') {
            // Time values: use project timezone since times are entered in local time
            value = Utilities.formatDate(value, CONFIG.TIMEZONE, 'h:mm a');
          } else {
            // For other date fields, convert to string using UTC
            value = Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
          }
        }

        // Convert boolean strings
        if (value === 'TRUE' || value === true) {
          value = true;
        } else if (value === 'FALSE' || value === false) {
          value = false;
        } else if (value === '' && (header === 'lat' || header === 'lng')) {
          value = 0;
        }

        // Convert numbers for lat/lng
        if (header === 'lat' || header === 'lng') {
          value = parseFloat(value) || 0;
        }

        // Parse sessions JSON back to array
        if (header === 'sessions') {
          if (value && typeof value === 'string' && value.trim().startsWith('[')) {
            try { value = JSON.parse(value); } catch(e) { value = []; }
          } else {
            value = [];
          }
        }

        event[header] = value;
      }

      events.push(event);
    }

    // Deduplicate by ID (keep last occurrence — most recently updated)
    var seen = {};
    var deduped = [];
    for (var k = events.length - 1; k >= 0; k--) {
      var eid = String(events[k].id);
      if (!seen[eid]) {
        seen[eid] = true;
        deduped.unshift(events[k]);
      }
    }

    return { success: true, events: deduped };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getEvent(id) {
  var result = getEvents();
  if (!result.success) return result;

  for (var i = 0; i < result.events.length; i++) {
    if (result.events[i].id === id) {
      return { success: true, event: result.events[i] };
    }
  }
  return { success: false, error: 'Event not found' };
}

function saveEvent(event) {
  try {
    if (!event || !event.id) {
      return { success: false, error: 'Invalid event data - missing id' };
    }

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');

    if (!sheet) {
      // Create Events sheet with headers
      sheet = ss.insertSheet('Events');
      sheet.appendRow([
        'id', 'title', 'date', 'dateDisplay', 'time', 'location', 'city', 'address',
        'program', 'lat', 'lng', 'description', 'saveTheDate', 'flyerUrl', 'websiteUrl',
        'isPromoted', 'isSponsored', 'createdAt', 'sessions'
      ]);
    }

    // Ensure sessions column header exists (migration for existing sheets)
    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headerRow.indexOf('sessions') === -1) {
      var nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue('sessions');
    }

    // Read all 19 columns explicitly — getDataRange() can miss trailing empty columns
    var lastRow = sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, 19).getValues()[0];
    var data = sheet.getRange(1, 1, lastRow, 19).getValues();

    // Normalize incoming event ID for comparison
    var eventIdNorm = normalizeId(event.id);

    // Find existing event row using normalized comparison
    // Also try Pacific timezone normalization for backwards compatibility
    // (frontend may have cached IDs generated with the old timezone)
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      var sheetIdNorm = normalizeId(data[i][0]);
      if (sheetIdNorm === eventIdNorm) {
        rowIndex = i + 1;
        break;
      }
      // Fallback: if sheet cell is a Date, also try Pacific timezone match
      if (data[i][0] instanceof Date) {
        var ptNorm = Utilities.formatDate(data[i][0], CONFIG.TIMEZONE, 'MMM-dd-yyyy');
        if (ptNorm === eventIdNorm || ptNorm.toLowerCase() === eventIdNorm.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      // Case-insensitive fallback
      if (sheetIdNorm.toLowerCase() === eventIdNorm.toLowerCase()) {
        rowIndex = i + 1;
        break;
      }
    }

    // Prepare row data
    var rowData = [];
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      var value = event[header];
      if (value === undefined || value === null) {
        rowData.push('');
      } else if (header === 'sessions') {
        // Serialize sessions array as JSON string
        rowData.push(Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : '');
      } else if (typeof value === 'boolean') {
        rowData.push(value ? 'TRUE' : 'FALSE');
      } else {
        rowData.push(value);
      }
    }

    if (rowIndex > 0) {
      // Format text columns BEFORE writing to prevent auto-conversion of IDs/dates
      sheet.getRange(rowIndex, 1).setNumberFormat('@');  // id
      sheet.getRange(rowIndex, 3).setNumberFormat('@');  // date
      sheet.getRange(rowIndex, 4).setNumberFormat('@');  // dateDisplay
      sheet.getRange(rowIndex, 5).setNumberFormat('@');  // time
      sheet.getRange(rowIndex, 14).setNumberFormat('@'); // flyerUrl
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // For new rows, append first then format
      sheet.appendRow(rowData);
      var lastRow = sheet.getLastRow();
      // Format and re-write text columns to fix auto-conversion
      sheet.getRange(lastRow, 1).setNumberFormat('@').setValue(String(event.id));
      sheet.getRange(lastRow, 3).setNumberFormat('@').setValue(String(event.date || ''));
      sheet.getRange(lastRow, 4).setNumberFormat('@').setValue(String(event.dateDisplay || ''));
      sheet.getRange(lastRow, 5).setNumberFormat('@').setValue(String(event.time || ''));
      if (event.flyerUrl) {
        sheet.getRange(lastRow, 14).setNumberFormat('@').setValue(String(event.flyerUrl));
      }
    }

    return { success: true, event: event };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteEvent(id) {
  try {
    if (!id) {
      return { success: false, error: 'Event ID required' };
    }

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');

    if (!sheet) {
      return { success: false, error: 'Events sheet not found' };
    }

    var data = sheet.getDataRange().getValues();
    var idNorm = normalizeId(id);

    for (var i = 1; i < data.length; i++) {
      if (normalizeId(data[i][0]) === idNorm) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }

    return { success: false, error: 'Event not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function saveAllEvents(events) {
  try {
    if (!events || !Array.isArray(events)) {
      return { success: false, error: 'Invalid events array' };
    }

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');

    if (!sheet) {
      sheet = ss.insertSheet('Events');
      sheet.appendRow([
        'id', 'title', 'date', 'dateDisplay', 'time', 'location', 'city', 'address',
        'program', 'lat', 'lng', 'description', 'saveTheDate', 'flyerUrl', 'websiteUrl',
        'isPromoted', 'isSponsored', 'createdAt', 'sessions'
      ]);
    }

    var headers = sheet.getRange(1, 1, 1, 19).getValues()[0];

    // Clear existing data (keep headers)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    // Add all events
    if (events.length > 0) {
      var rows = [];
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var row = [];
        for (var j = 0; j < headers.length; j++) {
          var header = headers[j];
          var value = event[header];
          if (value === undefined || value === null) {
            row.push('');
          } else if (header === 'sessions') {
            row.push(Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : '');
          } else if (typeof value === 'boolean') {
            row.push(value ? 'TRUE' : 'FALSE');
          } else {
            row.push(value);
          }
        }
        rows.push(row);
      }
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

      // Format text columns to prevent auto-conversion
      sheet.getRange(2, 1, rows.length, 1).setNumberFormat('@');  // id
      sheet.getRange(2, 3, rows.length, 1).setNumberFormat('@');  // date
      sheet.getRange(2, 4, rows.length, 1).setNumberFormat('@');  // dateDisplay
      sheet.getRange(2, 5, rows.length, 1).setNumberFormat('@');  // time
      sheet.getRange(2, 14, rows.length, 1).setNumberFormat('@'); // flyerUrl
    }

    return { success: true, count: events.length };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ========================================
// RSVP HANDLER
// ========================================
function handleRSVP(payload) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet) {
    sheet = ss.insertSheet('RSVPs');
    sheet.appendRow([
      'Timestamp', 'Event ID', 'Event Title', 'Event Date', 'Name',
      'Email', 'Phone', 'Contact Method', 'SMS Consent', 'Is Minor',
      'Minor Name', 'Needs', 'Language', 'Source', 'Checkin Token',
      'Status', 'Checked In At'
    ]);
  }

  var checkinToken = Utilities.getUuid();
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d/yyyy h:mm a') + ' PST';

  sheet.appendRow([
    timestamp,
    payload.eventId,
    payload.eventTitle,
    payload.eventDate,
    payload.name,
    payload.email,
    payload.phone,
    payload.contact_method,
    payload.sms_consent ? 'Yes' : 'No',
    payload.isMinor ? 'Yes' : 'No',
    payload.minorName,
    payload.needs,
    payload.lang,
    payload.source,
    checkinToken,
    'pre-registered',
    ''
  ]);

  if (payload.email) {
    sendRSVPConfirmationEmail(payload, checkinToken);
  }
}

// ========================================
// PARTNER REQUEST HANDLER
// ========================================
function handlePartnerRequest(payload) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Partner Requests');

  if (!sheet) {
    sheet = ss.insertSheet('Partner Requests');
    sheet.appendRow([
      'Timestamp', 'Name', 'Email', 'Organization', 'Event Title',
      'Event Description', 'Proposed Date', 'Event Time', 'Location',
      'Flyer URL', 'Language', 'Status'
    ]);
  }

  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d/yyyy h:mm a') + ' PST';

  sheet.appendRow([
    timestamp,
    payload.name,
    payload.email,
    payload.organization,
    payload.eventTitle,
    payload.eventDescription,
    payload.proposedDate,
    payload.eventTime || '',
    payload.location,
    payload.flyerUrl || '',
    payload.lang,
    'pending'
  ]);

  if (payload.email) {
    sendPartnerConfirmationEmail(payload);
  }

  sendPartnerAdminNotification(payload);
}

// ========================================
// CHECK-IN BY TOKEN
// ========================================
function handleCheckinByToken(token) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet) {
    return HtmlService.createHtmlOutput(buildErrorPage('Registration not found.'));
  }

  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][14] === token) {
      var name = data[i][4];
      var eventTitle = data[i][2];
      var currentStatus = data[i][15];
      var eventDateStr = data[i][3];

      if (currentStatus === 'checked-in') {
        return HtmlService.createHtmlOutput(buildAlreadyCheckedInPage(name, eventTitle));
      }

      // Check if event is today or tomorrow (in Pacific time)
      var now = new Date();
      var todayStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      var tomorrowDate = new Date(now.getTime() + 86400000);
      var tomorrowStr = Utilities.formatDate(tomorrowDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');

      // Parse event date as UTC to avoid timezone shift
      // (dates stored as "2026-02-14" would shift back a day if parsed as local)
      var eventDateNorm = eventDateStr;
      if (eventDateStr instanceof Date) {
        eventDateNorm = Utilities.formatDate(eventDateStr, 'UTC', 'yyyy-MM-dd');
      }

      if (eventDateNorm < todayStr) {
        return HtmlService.createHtmlOutput(buildErrorPage('This event has already passed.'));
      }

      if (eventDateNorm > tomorrowStr) {
        // Format date nicely for display — parse as UTC to preserve correct date
        var eventDate = new Date(eventDateNorm + 'T12:00:00Z');
        var formattedDate = Utilities.formatDate(eventDate, 'UTC', 'EEEE, MMMM d, yyyy');
        return HtmlService.createHtmlOutput(buildEarlyCheckinPage(name, eventTitle, formattedDate));
      }

      // Mark as checked in with Pacific time (hour:minute PST)
      sheet.getRange(i + 1, 16).setValue('checked-in');
      var checkinTime = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'h:mm a') + ' PST';
      sheet.getRange(i + 1, 17).setValue(checkinTime);

      return HtmlService.createHtmlOutput(buildSuccessPage(name, eventTitle, checkinTime));
    }
  }

  return HtmlService.createHtmlOutput(buildErrorPage('Registration not found.'));
}

// ========================================
// EMAIL FUNCTIONS
// ========================================
function sendRSVPConfirmationEmail(payload, checkinToken) {
  var subject = payload.lang === 'es'
    ? 'Registro Confirmado | Health Matters Clinic Events'
    : 'Registration Confirmed | Health Matters Clinic Events';

  var checkinUrl = CONFIG.SCRIPT_URL + '?token=' + checkinToken;

  var greeting = payload.lang === 'es' ? 'Hola ' : 'Hi ';
  var confirmMsg = payload.lang === 'es'
    ? 'Tu registro ha sido confirmado para:'
    : 'Your registration has been confirmed for:';
  var dateLabel = payload.lang === 'es' ? 'Fecha: ' : 'Date: ';
  var timeLabel = payload.lang === 'es' ? 'Hora: ' : 'Time: ';
  var checkinLabel = payload.lang === 'es' ? 'Check-in el Día del Evento' : 'Check-in on Event Day';
  var checkinNote = payload.lang === 'es'
    ? 'Usa el botón de arriba para hacer check-in cuando llegues al evento.'
    : 'Use the button above to check in when you arrive at the event.';
  var questionLabel = payload.lang === 'es' ? '¿Preguntas?' : 'Questions?';

  // Build time line if eventTime is provided
  var timeLine = '';
  if (payload.eventTime) {
    timeLine = '<p style="margin:5px 0;color:#555;font-size:14px;"><strong>' + timeLabel + '</strong>' + payload.eventTime + '</p>';
  }

  var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Inter,Arial,sans-serif;margin:0;padding:20px;background:#f5f3ef;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:1px solid #e5e5e5;">' +
    // Header with logo
    '<div style="background:#233dff;color:white;padding:24px;text-align:center;">' +
    '<img src="' + CONFIG.LOGO_URL + '" alt="HMC" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;">' +
    '<h1 style="margin:0;font-size:22px;font-weight:700;">Health Matters Clinic</h1>' +
    '<p style="margin:8px 0 0;opacity:0.9;font-size:14px;">' + (payload.lang === 'es' ? 'Registro Confirmado' : 'Registration Confirmed') + '</p></div>' +
    // Body content
    '<div style="padding:32px;">' +
    '<p style="font-size:18px;color:#1a1a1a;font-weight:600;margin:0 0 8px;">' + greeting + payload.name + '!</p>' +
    '<p style="color:#666;margin:0 0 24px;font-size:15px;">' + confirmMsg + '</p>' +
    // Event details box
    '<div style="background:#f0f4ff;padding:20px;border-radius:12px;margin:0 0 28px;border:1.5px solid rgba(35,61,255,0.2);">' +
    '<h2 style="color:#233dff;margin:0 0 12px 0;font-size:18px;font-weight:700;">' + payload.eventTitle + '</h2>' +
    '<p style="margin:5px 0;color:#555;font-size:14px;"><strong>' + dateLabel + '</strong>' + payload.eventDate + '</p>' +
    timeLine + '</div>' +
    // Check-in button
    '<div style="text-align:center;margin:0 0 20px;">' +
    '<a href="' + checkinUrl + '" style="display:inline-block;background:#233dff;color:white;padding:16px 48px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(35,61,255,0.3);">' + checkinLabel + '</a></div>' +
    '<p style="color:#999;font-size:12px;text-align:center;margin:0;">' + checkinNote + '</p>' +
    '</div>' +
    // Footer
    '<div style="background:#f5f3ef;padding:20px;border-top:1px solid #e5e5e5;text-align:center;">' +
    '<p style="color:#666;font-size:13px;margin:0;">' + questionLabel + ' <a href="mailto:events@healthmatters.clinic" style="color:#233dff;font-weight:600;">events@healthmatters.clinic</a></p>' +
    '</div></div></body></html>';

  try {
    MailApp.sendEmail({
      to: payload.email,
      subject: subject,
      htmlBody: htmlBody,
      name: 'Health Matters Clinic Events'
    });
  } catch (err) {
    Logger.log('RSVP email error: ' + err);
  }
}

function sendPartnerConfirmationEmail(payload) {
  var subject = payload.lang === 'es'
    ? 'Solicitud Recibida | Health Matters Clinic Events'
    : 'Request Received | Health Matters Clinic Events';

  var greeting = payload.lang === 'es' ? 'Hola ' : 'Hi ';
  var receivedMsg = payload.lang === 'es'
    ? 'Hemos recibido tu solicitud de evento. Nuestro equipo la revisará y te contactaremos pronto.'
    : 'We have received your event request. Our team will review it and contact you soon.';
  var orgLabel = payload.lang === 'es' ? 'Organización: ' : 'Organization: ';
  var dateLabel = payload.lang === 'es' ? 'Fecha propuesta: ' : 'Proposed date: ';
  var locLabel = payload.lang === 'es' ? 'Ubicación: ' : 'Location: ';
  var questionLabel = payload.lang === 'es' ? '¿Preguntas?' : 'Questions?';

  var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Inter,Arial,sans-serif;margin:0;padding:20px;background:#f5f3ef;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:1px solid #e5e5e5;">' +
    // Header with logo
    '<div style="background:#233dff;color:white;padding:24px;text-align:center;">' +
    '<img src="' + CONFIG.LOGO_URL + '" alt="HMC" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;">' +
    '<h1 style="margin:0;font-size:22px;font-weight:700;">Health Matters Clinic</h1>' +
    '<p style="margin:8px 0 0;opacity:0.9;font-size:14px;">' + (payload.lang === 'es' ? 'Solicitud de Evento' : 'Event Request') + '</p></div>' +
    // Body content
    '<div style="padding:32px;">' +
    '<p style="font-size:18px;color:#1a1a1a;font-weight:600;margin:0 0 8px;">' + greeting + payload.name + '!</p>' +
    '<p style="color:#666;margin:0 0 24px;font-size:15px;">' + receivedMsg + '</p>' +
    // Event details box
    '<div style="background:#f0f4ff;padding:20px;border-radius:12px;margin:0 0 28px;border:1.5px solid rgba(35,61,255,0.2);">' +
    '<h3 style="color:#233dff;margin:0 0 15px 0;font-size:18px;font-weight:700;">' + payload.eventTitle + '</h3>' +
    '<p style="margin:5px 0;color:#555;font-size:14px;"><strong>' + orgLabel + '</strong>' + payload.organization + '</p>' +
    '<p style="margin:5px 0;color:#555;font-size:14px;"><strong>' + dateLabel + '</strong>' + payload.proposedDate + '</p>' +
    '<p style="margin:5px 0;color:#555;font-size:14px;"><strong>' + locLabel + '</strong>' + payload.location + '</p></div>' +
    '</div>' +
    // Footer
    '<div style="background:#f5f3ef;padding:20px;border-top:1px solid #e5e5e5;text-align:center;">' +
    '<p style="color:#666;font-size:13px;margin:0;">' + questionLabel + ' <a href="mailto:events@healthmatters.clinic" style="color:#233dff;font-weight:600;">events@healthmatters.clinic</a></p>' +
    '</div></div></body></html>';

  try {
    MailApp.sendEmail({
      to: payload.email,
      subject: subject,
      htmlBody: htmlBody,
      name: 'Health Matters Clinic Events'
    });
  } catch (err) {
    Logger.log('Partner confirmation email error: ' + err);
  }
}

function sendPartnerAdminNotification(payload) {
  var subject = 'New Partner Event Request: ' + (payload.eventTitle || 'Untitled');

  var body = 'New partner event request received:\n\n' +
    'Organization: ' + (payload.organization || 'N/A') + '\n' +
    'Contact: ' + (payload.name || 'N/A') + ' (' + (payload.email || 'N/A') + ')\n' +
    'Event: ' + (payload.eventTitle || 'N/A') + '\n' +
    'Description: ' + (payload.eventDescription || 'N/A') + '\n' +
    'Proposed Date: ' + (payload.proposedDate || 'N/A') + '\n' +
    'Time: ' + (payload.eventTime || 'N/A') + '\n' +
    'Location: ' + (payload.location || 'N/A') + '\n' +
    'Flyer URL: ' + (payload.flyerUrl || 'Not provided') + '\n\n' +
    'Review in your Google Sheet.';

  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      cc: CONFIG.CC_EMAILS,
      subject: subject,
      body: body,
      name: 'Health Matters Clinic Events'
    });
  } catch (err) {
    Logger.log('Admin notification error: ' + err);
  }
}

// ========================================
// HTML PAGE BUILDERS - Apple-level design
// ========================================
function buildSuccessPage(name, eventTitle, checkinTime) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Check-in | Health Matters Clinic</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box}body{-webkit-font-smoothing:antialiased}</style></head>' +
    '<body style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:48px 24px;background:linear-gradient(180deg,#f5f3ef 0%,#eae7e2 100%);min-height:100vh;">' +
    '<div style="max-width:380px;margin:0 auto;">' +
    // Main card
    '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.08);">' +
    // Logo inside card
    '<img src="' + CONFIG.LOGO_URL + '" alt="Health Matters Clinic" style="width:72px;height:72px;border-radius:18px;margin:0 auto 24px;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.1);">' +
    '<h1 style="color:#1a1a1a;margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">You\'re Checked In</h1>' +
    '<p style="color:#666;margin:0 0 28px;font-size:17px;font-weight:400;">Welcome, ' + name + '</p>' +
    // Event info
    '<div style="background:#f8f9fc;padding:20px;border-radius:16px;">' +
    '<p style="font-weight:600;color:#1a1a1a;font-size:16px;margin:0 0 4px;line-height:1.4;">' + eventTitle + '</p>' +
    '<p style="color:#233dff;font-size:13px;font-weight:600;margin:0;">' + (checkinTime || '') + '</p></div>' +
    '</div>' +
    // Footer
    '<p style="text-align:center;color:#999;font-size:11px;margin-top:24px;font-weight:500;letter-spacing:0.5px;">HEALTH MATTERS CLINIC</p>' +
    '</div></body></html>';
}

function buildAlreadyCheckedInPage(name, eventTitle) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Check-in | Health Matters Clinic</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box}body{-webkit-font-smoothing:antialiased}</style></head>' +
    '<body style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:48px 24px;background:linear-gradient(180deg,#f5f3ef 0%,#eae7e2 100%);min-height:100vh;">' +
    '<div style="max-width:380px;margin:0 auto;">' +
    // Main card
    '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.08);">' +
    // Logo inside card
    '<img src="' + CONFIG.LOGO_URL + '" alt="Health Matters Clinic" style="width:72px;height:72px;border-radius:18px;margin:0 auto 24px;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.1);">' +
    '<h1 style="color:#1a1a1a;margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Already Checked In</h1>' +
    '<p style="color:#666;margin:0 0 28px;font-size:17px;font-weight:400;">Welcome back, ' + name + '</p>' +
    // Event info
    '<div style="background:#f8f9fc;padding:20px;border-radius:16px;">' +
    '<p style="font-weight:600;color:#1a1a1a;font-size:16px;margin:0;line-height:1.4;">' + eventTitle + '</p></div>' +
    '</div>' +
    // Footer
    '<p style="text-align:center;color:#999;font-size:11px;margin-top:24px;font-weight:500;letter-spacing:0.5px;">HEALTH MATTERS CLINIC</p>' +
    '</div></body></html>';
}

function buildEarlyCheckinPage(name, eventTitle, eventDate) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Check-in | Health Matters Clinic</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box}body{-webkit-font-smoothing:antialiased}</style></head>' +
    '<body style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:48px 24px;background:linear-gradient(180deg,#f5f3ef 0%,#eae7e2 100%);min-height:100vh;">' +
    '<div style="max-width:380px;margin:0 auto;">' +
    // Main card
    '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.08);">' +
    // Logo inside card
    '<img src="' + CONFIG.LOGO_URL + '" alt="Health Matters Clinic" style="width:72px;height:72px;border-radius:18px;margin:0 auto 24px;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.1);">' +
    '<h1 style="color:#1a1a1a;margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Not Yet</h1>' +
    '<p style="color:#666;margin:0 0 8px;font-size:17px;font-weight:400;">Hi ' + name + '</p>' +
    '<p style="color:#888;margin:0 0 28px;font-size:15px;font-weight:400;">Check-in opens on the day of the event</p>' +
    // Event info
    '<div style="background:#f8f9fc;padding:20px;border-radius:16px;">' +
    '<p style="font-weight:600;color:#1a1a1a;font-size:16px;margin:0 0 6px;line-height:1.4;">' + eventTitle + '</p>' +
    '<p style="color:#233dff;font-size:14px;font-weight:600;margin:0;">' + eventDate + '</p></div>' +
    '</div>' +
    // Footer
    '<p style="text-align:center;color:#999;font-size:11px;margin-top:24px;font-weight:500;letter-spacing:0.5px;">HEALTH MATTERS CLINIC</p>' +
    '</div></body></html>';
}

function buildErrorPage(message) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Check-in | Health Matters Clinic</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box}body{-webkit-font-smoothing:antialiased}</style></head>' +
    '<body style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:48px 24px;background:linear-gradient(180deg,#f5f3ef 0%,#eae7e2 100%);min-height:100vh;">' +
    '<div style="max-width:380px;margin:0 auto;">' +
    // Main card
    '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.08);">' +
    // Logo inside card
    '<img src="' + CONFIG.LOGO_URL + '" alt="Health Matters Clinic" style="width:72px;height:72px;border-radius:18px;margin:0 auto 24px;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.1);">' +
    '<h1 style="color:#1a1a1a;margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Something\'s Off</h1>' +
    '<p style="color:#666;margin:0 0 28px;font-size:16px;font-weight:400;line-height:1.5;">' + message + '</p>' +
    // Button
    '<a href="https://www.healthmatters.clinic" style="display:inline-block;background:#233dff;color:white;padding:16px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:15px;">Visit Website</a>' +
    '</div>' +
    // Footer
    '<p style="text-align:center;color:#999;font-size:11px;margin-top:24px;font-weight:500;letter-spacing:0.5px;">HEALTH MATTERS CLINIC</p>' +
    '</div></body></html>';
}

// ========================================
// TEST FUNCTION (no emails)
// ========================================
function test() {
  Logger.log('=== HEALTH MATTERS CLINIC EVENTS - TEST ===\n');

  var ss;
  Logger.log('1. Testing spreadsheet access...');
  try {
    ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log('   SUCCESS: ' + ss.getName() + '\n');
  } catch (e) {
    Logger.log('   FAILED: ' + e + '\n');
    return;
  }

  Logger.log('2. Checking sheets...');
  var eventsSheet = ss.getSheetByName('Events');
  var rsvpsSheet = ss.getSheetByName('RSVPs');
  var partnersSheet = ss.getSheetByName('Partner Requests');

  Logger.log('   Events: ' + (eventsSheet ? 'OK (' + (eventsSheet.getLastRow() - 1) + ' events)' : 'MISSING - run setupSheets()'));
  Logger.log('   RSVPs: ' + (rsvpsSheet ? 'OK (' + (rsvpsSheet.getLastRow() - 1) + ' registrations)' : 'MISSING'));
  Logger.log('   Partner Requests: ' + (partnersSheet ? 'OK' : 'MISSING') + '\n');

  Logger.log('3. Testing getEvents...');
  var eventsResult = getEvents();
  Logger.log('   ' + (eventsResult.success ? 'SUCCESS: ' + eventsResult.events.length + ' events found' : 'FAILED: ' + eventsResult.error) + '\n');

  Logger.log('=== TEST COMPLETE ===');
  Logger.log('Run testWithEmails() to test full flow including email delivery.');
}

// ========================================
// FULL TEST WITH EMAILS
// ========================================
function testWithEmails() {
  var testEmail = 'test@healthmatters.clinic';

  Logger.log('=== FULL TEST WITH EMAILS ===\n');
  Logger.log('Sending test emails to: ' + testEmail + '\n');

  var ss;
  Logger.log('1. Testing spreadsheet access...');
  try {
    ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log('   SUCCESS: ' + ss.getName() + '\n');
  } catch (e) {
    Logger.log('   FAILED: ' + e + '\n');
    return;
  }

  Logger.log('2. Checking sheets...');
  var eventsSheet = ss.getSheetByName('Events');
  var rsvpsSheet = ss.getSheetByName('RSVPs');
  var partnersSheet = ss.getSheetByName('Partner Requests');

  Logger.log('   Events: ' + (eventsSheet ? 'OK (' + (eventsSheet.getLastRow() - 1) + ' events)' : 'MISSING - run setupSheets()'));
  Logger.log('   RSVPs: ' + (rsvpsSheet ? 'OK (' + (rsvpsSheet.getLastRow() - 1) + ' registrations)' : 'MISSING'));
  Logger.log('   Partner Requests: ' + (partnersSheet ? 'OK' : 'MISSING') + '\n');

  Logger.log('3. Testing getEvents...');
  var eventsResult = getEvents();
  Logger.log('   ' + (eventsResult.success ? 'SUCCESS: ' + eventsResult.events.length + ' events found' : 'FAILED: ' + eventsResult.error) + '\n');

  Logger.log('4. Testing RSVP with email...');
  try {
    handleRSVP({
      eventId: 'TEST-001',
      eventTitle: 'Test Event - RSVP Email Test',
      eventDate: 'February 10, 2026',
      eventTime: '10:00 AM - 2:00 PM',
      name: 'Test User',
      email: testEmail,
      phone: '5551234567',
      contact_method: 'email',
      sms_consent: true,
      isMinor: false,
      minorName: '',
      needs: 'Health Screening',
      lang: 'en',
      source: 'Test Script'
    });
    Logger.log('   SUCCESS: RSVP created, confirmation email sent to ' + testEmail + '\n');
  } catch (e) {
    Logger.log('   FAILED: ' + e + '\n');
  }

  Logger.log('5. Testing Partner Request with email...');
  try {
    handlePartnerRequest({
      name: 'Test Partner',
      email: testEmail,
      organization: 'Test Organization',
      eventTitle: 'Test Partner Event - Email Test',
      eventDescription: 'This is a test partner event submission to verify email delivery.',
      proposedDate: '2026-03-15',
      eventTime: '10:00 AM - 2:00 PM',
      location: '123 Test Street, Los Angeles, CA 90001',
      flyerUrl: 'https://example.com/test-flyer.jpg',
      lang: 'en'
    });
    Logger.log('   SUCCESS: Partner request created, emails sent\n');
  } catch (e) {
    Logger.log('   FAILED: ' + e + '\n');
  }

  Logger.log('6. Testing saveEvent...');
  try {
    var testEvent = {
      id: 'test-event-' + Date.now(),
      title: 'Test Event from Script',
      date: '2026-03-01',
      dateDisplay: 'Sunday, March 1, 2026',
      time: '10:00 AM - 2:00 PM',
      location: 'Test Location',
      city: 'Los Angeles',
      address: '123 Test St, Los Angeles, CA 90001',
      program: 'Community Wellness',
      lat: 34.0522,
      lng: -118.2437,
      description: 'Test event created by script.',
      saveTheDate: false,
      flyerUrl: '',
      websiteUrl: '',
      isPromoted: false,
      isSponsored: false,
      createdAt: new Date().toISOString()
    };
    var saveResult = saveEvent(testEvent);
    Logger.log('   ' + (saveResult.success ? 'SUCCESS: Event saved to sheet' : 'FAILED: ' + saveResult.error) + '\n');
  } catch (e) {
    Logger.log('   FAILED: ' + e + '\n');
  }

  Logger.log('=== FULL TEST COMPLETE ===\n');
  Logger.log('Check the following:');
  Logger.log('1. RSVPs sheet - new test entry');
  Logger.log('2. Partner Requests sheet - new test entry');
  Logger.log('3. Events sheet - new test event');
  Logger.log('4. ' + testEmail + ' inbox:');
  Logger.log('   - RSVP confirmation email with check-in button');
  Logger.log('   - Partner request confirmation email');
  Logger.log('5. ' + CONFIG.ADMIN_EMAIL + ' inbox:');
  Logger.log('   - Admin notification for partner request');
}

// ========================================
// SETUP HELPER - Run this first!
// ========================================
function setupSheets() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // Create Events sheet if missing
  var eventsSheet = ss.getSheetByName('Events');
  if (!eventsSheet) {
    eventsSheet = ss.insertSheet('Events');
    eventsSheet.appendRow([
      'id', 'title', 'date', 'dateDisplay', 'time', 'location', 'city', 'address',
      'program', 'lat', 'lng', 'description', 'saveTheDate', 'flyerUrl', 'websiteUrl',
      'isPromoted', 'isSponsored', 'createdAt'
    ]);
    Logger.log('Created Events sheet with headers');
  } else {
    Logger.log('Events sheet already exists');
  }

  // Create RSVPs sheet if missing
  var rsvpsSheet = ss.getSheetByName('RSVPs');
  if (!rsvpsSheet) {
    rsvpsSheet = ss.insertSheet('RSVPs');
    rsvpsSheet.appendRow([
      'Timestamp', 'Event ID', 'Event Title', 'Event Date', 'Name',
      'Email', 'Phone', 'Contact Method', 'SMS Consent', 'Is Minor',
      'Minor Name', 'Needs', 'Language', 'Source', 'Checkin Token',
      'Status', 'Checked In At'
    ]);
    Logger.log('Created RSVPs sheet with headers');
  } else {
    Logger.log('RSVPs sheet already exists');
  }

  // Create Partner Requests sheet if missing
  var partnersSheet = ss.getSheetByName('Partner Requests');
  if (!partnersSheet) {
    partnersSheet = ss.insertSheet('Partner Requests');
    partnersSheet.appendRow([
      'Timestamp', 'Name', 'Email', 'Organization', 'Event Title',
      'Event Description', 'Proposed Date', 'Event Time', 'Location',
      'Flyer URL', 'Language', 'Status'
    ]);
    Logger.log('Created Partner Requests sheet with headers');
  } else {
    Logger.log('Partner Requests sheet already exists');
  }

  Logger.log('\n=== SETUP COMPLETE ===');
  Logger.log('All required sheets are ready!');
}

// ========================================
// RESTORE ORIGINAL EVENTS - Run this once!
// ========================================
function restoreOriginalEvents() {
  var events = [
    {
      id: 'dec-17-2025',
      title: 'Unstoppable Community Event',
      date: '2025-12-17',
      dateDisplay: 'December 17, 2025',
      time: '5:00 PM - 7:00 PM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Community Wellness',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Join us for an evening of connection, resources, and community support.',
      saveTheDate: false
    },
    {
      id: 'dec-19-2025',
      title: 'Community Health & Wellness Event',
      date: '2025-12-19',
      dateDisplay: 'Friday, December 19, 2025',
      time: '12:00 PM - 4:00 PM',
      location: 'Compton',
      city: 'Compton',
      address: 'Gym Basketball Courts, 11251 Compton Ave, Compton, CA 90059',
      program: 'Community Fair',
      lat: 33.8962,
      lng: -118.2207,
      description: 'Free health screenings, wellness resources, and community support.',
      saveTheDate: true
    },
    {
      id: 'jan-09-2026',
      title: 'Unstoppable Workshop: Social Connections',
      date: '2026-01-09',
      dateDisplay: 'Friday, January 9, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Build authentic connections and community in a safe, welcoming space.',
      saveTheDate: false
    },
    {
      id: 'jan-10-2026',
      title: 'Community Walk & Run',
      date: '2026-01-10',
      dateDisplay: 'Saturday, January 10, 2026',
      time: '8:00 AM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Community Walk & Run',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Join our monthly community walk and run. Community building through movement.',
      saveTheDate: false
    },
    {
      id: 'jan-21-2026',
      title: 'Unstoppable Wellness Meetup',
      date: '2026-01-21',
      dateDisplay: 'Wednesday, January 21, 2026',
      time: '6:00 PM - 7:15 PM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Unstoppable Wellness Meetup',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Safe space for authentic healing conversations. Set-up at 5:30 PM.',
      saveTheDate: false
    },
    {
      id: 'feb-06-2026',
      title: 'Unstoppable Workshop: Community Advocacy & Empowerment',
      date: '2026-02-06',
      dateDisplay: 'Friday, February 6, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Learn about advocacy and empower yourself and your community.',
      saveTheDate: false
    },
    {
      id: 'feb-14-2026',
      title: 'Community Walk & Run',
      date: '2026-02-14',
      dateDisplay: 'Saturday, February 14, 2026',
      time: '8:00 AM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Community Walk & Run',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Join our monthly community walk and run.',
      saveTheDate: false
    },
    {
      id: 'feb-18-2026',
      title: 'Unstoppable Wellness Meetup',
      date: '2026-02-18',
      dateDisplay: 'Wednesday, February 18, 2026',
      time: '6:00 PM - 7:15 PM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Unstoppable Wellness Meetup',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Safe space for authentic healing conversations.',
      saveTheDate: false
    },
    {
      id: 'mar-06-2026',
      title: 'Unstoppable Workshop: Mental Health Awareness',
      date: '2026-03-06',
      dateDisplay: 'Friday, March 6, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Explore mental health awareness and destigmatize mental wellness.',
      saveTheDate: false
    },
    {
      id: 'mar-14-2026',
      title: 'Community Walk & Run',
      date: '2026-03-14',
      dateDisplay: 'Saturday, March 14, 2026',
      time: '8:00 AM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Community Walk & Run',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Join our monthly community walk and run.',
      saveTheDate: false
    },
    {
      id: 'mar-18-2026',
      title: 'Unstoppable Wellness Meetup',
      date: '2026-03-18',
      dateDisplay: 'Wednesday, March 18, 2026',
      time: '6:00 PM - 7:15 PM',
      location: 'Inglewood',
      city: 'Inglewood',
      address: '123 W. Manchester Blvd, Inglewood, CA 90301',
      program: 'Unstoppable Wellness Meetup',
      lat: 33.9719,
      lng: -118.2108,
      description: 'Safe space for authentic healing conversations.',
      saveTheDate: false
    },
    {
      id: 'mar-27-2026',
      title: 'Unstoppable Workshop: Access to Healthcare',
      date: '2026-03-27',
      dateDisplay: 'Friday, March 27, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Navigate healthcare access and resources in your community.',
      saveTheDate: false
    },
    {
      id: 'mar-28-2026',
      title: '5K Walk + Health Fair',
      date: '2026-03-28',
      dateDisplay: 'Saturday, March 28, 2026',
      time: 'TBD',
      location: 'East Los Angeles',
      city: 'East Los Angeles',
      address: 'East Los Angeles, CA',
      program: 'Community Fair',
      lat: 34.0233,
      lng: -118.2013,
      description: 'Community health event with 5K walk and health screenings.',
      saveTheDate: true
    },
    {
      id: 'may-08-2026',
      title: 'Unstoppable Workshop: Cultural Competence & Inclusion',
      date: '2026-05-08',
      dateDisplay: 'Friday, May 8, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Celebrate cultural diversity and build inclusive communities.',
      saveTheDate: false
    },
    {
      id: 'jun-05-2026',
      title: 'Unstoppable Workshop: Physical Well-being',
      date: '2026-06-05',
      dateDisplay: 'Friday, June 5, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Explore physical health, movement, and wellness practices.',
      saveTheDate: false
    },
    {
      id: 'jun-06-2026',
      title: 'Health + Resources Fair',
      date: '2026-06-06',
      dateDisplay: 'Saturday, June 6, 2026',
      time: 'TBD',
      location: 'Lynwood',
      city: 'Lynwood',
      address: 'Lynwood, CA',
      program: 'Community Fair',
      lat: 33.9229,
      lng: -118.2114,
      description: 'Community health and resources fair.',
      saveTheDate: true
    },
    {
      id: 'jul-10-2026',
      title: 'Unstoppable Workshop: Financial Wellness',
      date: '2026-07-10',
      dateDisplay: 'Friday, July 10, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Build financial literacy and economic empowerment.',
      saveTheDate: false
    },
    {
      id: 'aug-07-2026',
      title: 'Unstoppable Workshop: Environmental Health',
      date: '2026-08-07',
      dateDisplay: 'Friday, August 7, 2026',
      time: '10:15 AM - 11:45 AM',
      location: 'Palmdale',
      city: 'Palmdale',
      address: '2072 E. Palmdale Blvd, Palmdale, CA 93550',
      program: 'Unstoppable Workshop',
      lat: 34.5801,
      lng: -118.1164,
      description: 'Understand environmental health and community sustainability.',
      saveTheDate: false
    },
    {
      id: 'aug-08-2026',
      title: 'Back to School Wellness Event',
      date: '2026-08-08',
      dateDisplay: 'Saturday, August 8, 2026',
      time: 'TBD',
      location: 'Huntington Park',
      city: 'Huntington Park',
      address: 'Huntington Park, CA',
      program: 'Community Fair',
      lat: 33.9773,
      lng: -118.2272,
      description: 'Back to school health and wellness fair.',
      saveTheDate: true
    },
    {
      id: 'dec-12-2026',
      title: 'Toy Distribution',
      date: '2026-12-12',
      dateDisplay: 'Saturday, December 12, 2026',
      time: 'TBD',
      location: 'Huntington Park',
      city: 'Huntington Park',
      address: 'Huntington Park, CA',
      program: 'Community Fair',
      lat: 33.9773,
      lng: -118.2272,
      description: 'Holiday toy distribution event.',
      saveTheDate: true
    }
  ];

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Events');

  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.appendRow([
      'id', 'title', 'date', 'dateDisplay', 'time', 'location', 'city', 'address',
      'program', 'lat', 'lng', 'description', 'saveTheDate', 'flyerUrl', 'websiteUrl',
      'isPromoted', 'isSponsored', 'createdAt'
    ]);
  }

  // Clear existing data (keep headers)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  // Add all events
  var headers = ['id', 'title', 'date', 'dateDisplay', 'time', 'location', 'city', 'address',
    'program', 'lat', 'lng', 'description', 'saveTheDate', 'flyerUrl', 'websiteUrl',
    'isPromoted', 'isSponsored', 'createdAt'];

  var rows = [];
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      var value = event[header];
      if (value === undefined || value === null) {
        row.push('');
      } else if (typeof value === 'boolean') {
        row.push(value ? 'TRUE' : 'FALSE');
      } else {
        row.push(value);
      }
    }
    rows.push(row);
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // IMPORTANT: Format columns as plain text to prevent auto-conversion
  // Column 1 = id, Column 3 = date, Column 4 = dateDisplay, Column 5 = time, Column 14 = flyerUrl
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat('@');  // id
  sheet.getRange(2, 3, rows.length, 1).setNumberFormat('@');  // date
  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('@');  // dateDisplay
  sheet.getRange(2, 5, rows.length, 1).setNumberFormat('@');  // time
  sheet.getRange(2, 14, rows.length, 1).setNumberFormat('@'); // flyerUrl

  Logger.log('=== RESTORED ' + events.length + ' ORIGINAL EVENTS ===');
  Logger.log('Events restored successfully!');
}
