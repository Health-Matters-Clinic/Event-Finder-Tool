// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  SPREADSHEET_ID: '1L57FfGbos21rzGu4ciuKipcumJchqe2ZzDPUyp-oRmM',
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby0Fse9o3DxN_3RnbOAWYFKZlXQZNEHFVjCuL1SeWi3ZQAyTWx0Cog7jW7Emai74KaVqA/exec',
  ADMIN_EMAIL: 'admin@healthmatters.clinic',
  CC_EMAILS: 'events@healthmatters.clinic'
};

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

    // Handle JSON POST body
    if (e.postData && e.postData.type === 'application/json') {
      try {
        var jsonParams = JSON.parse(e.postData.contents);
        for (var key in jsonParams) {
          params[key] = jsonParams[key];
        }
      } catch (parseError) {
        // Continue with URL params
      }
    }

    var action = params.action || '';
    var result;

    switch (action) {
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

function getEvents() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');

    if (!sheet) {
      return { success: true, events: [] };
    }

    var data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return { success: true, events: [] };
    }

    var headers = data[0];
    var events = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // Skip empty rows

      var event = {};
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j];
        var value = row[j];

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

        event[header] = value;
      }

      events.push(event);
    }

    return { success: true, events: events };
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
        'isPromoted', 'isSponsored', 'createdAt'
      ]);
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find existing event row
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === event.id) {
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
      } else if (typeof value === 'boolean') {
        rowData.push(value ? 'TRUE' : 'FALSE');
      } else {
        rowData.push(value);
      }
    }

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
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

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
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
        'isPromoted', 'isSponsored', 'createdAt'
      ]);
    }

    var headers = sheet.getRange(1, 1, 1, 18).getValues()[0];

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
          } else if (typeof value === 'boolean') {
            row.push(value ? 'TRUE' : 'FALSE');
          } else {
            row.push(value);
          }
        }
        rows.push(row);
      }
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
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
  var timestamp = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'M/d/yyyy HH:mm:ss');

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

  var timestamp = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'M/d/yyyy HH:mm:ss');

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

      // Check if event is today or tomorrow
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      var eventDate = new Date(eventDateStr);
      eventDate.setHours(0, 0, 0, 0);

      if (eventDate < today) {
        return HtmlService.createHtmlOutput(buildErrorPage('This event has already passed.'));
      }

      if (eventDate > tomorrow) {
        return HtmlService.createHtmlOutput(buildEarlyCheckinPage(name, eventTitle, eventDateStr));
      }

      // Mark as checked in
      sheet.getRange(i + 1, 16).setValue('checked-in');
      sheet.getRange(i + 1, 17).setValue(Utilities.formatDate(new Date(), 'America/Los_Angeles', 'M/d/yyyy HH:mm:ss'));

      return HtmlService.createHtmlOutput(buildSuccessPage(name, eventTitle));
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
    timeLine = '<p style="margin:5px 0;color:#666;"><strong>' + timeLabel + '</strong>' + payload.eventTime + '</p>';
  }

  var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="background:#233dff;color:white;padding:30px;text-align:center;">' +
    '<h1 style="margin:0;font-size:24px;">Health Matters Clinic Events</h1>' +
    '<p style="margin:10px 0 0;opacity:0.9;">' + (payload.lang === 'es' ? 'Registro Confirmado' : 'Registration Confirmed') + '</p></div>' +
    '<div style="padding:30px;">' +
    '<p style="font-size:18px;color:#333;">' + greeting + payload.name + '!</p>' +
    '<p style="color:#666;">' + confirmMsg + '</p>' +
    '<div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #233dff;">' +
    '<h2 style="color:#233dff;margin:0 0 10px 0;font-size:20px;">' + payload.eventTitle + '</h2>' +
    '<p style="margin:5px 0;color:#666;"><strong>' + dateLabel + '</strong>' + payload.eventDate + '</p>' +
    timeLine + '</div>' +
    '<div style="text-align:center;margin:30px 0;">' +
    '<a href="' + checkinUrl + '" style="display:inline-block;background:#10b981;color:white;padding:15px 40px;border-radius:30px;text-decoration:none;font-weight:bold;font-size:16px;">' + checkinLabel + '</a></div>' +
    '<p style="color:#999;font-size:12px;text-align:center;">' + checkinNote + '</p>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:30px 0;">' +
    '<p style="color:#666;font-size:14px;">' + questionLabel + ' <a href="mailto:events@healthmatters.clinic" style="color:#233dff;">events@healthmatters.clinic</a></p>' +
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
    '<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="background:#233dff;color:white;padding:30px;text-align:center;">' +
    '<h1 style="margin:0;font-size:24px;">Health Matters Clinic Events</h1>' +
    '<p style="margin:10px 0 0;opacity:0.9;">' + (payload.lang === 'es' ? 'Solicitud de Evento' : 'Event Request') + '</p></div>' +
    '<div style="padding:30px;">' +
    '<p style="font-size:18px;color:#333;">' + greeting + payload.name + '!</p>' +
    '<p style="color:#666;">' + receivedMsg + '</p>' +
    '<div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #233dff;">' +
    '<h3 style="color:#233dff;margin:0 0 15px 0;">' + payload.eventTitle + '</h3>' +
    '<p style="margin:5px 0;color:#666;"><strong>' + orgLabel + '</strong>' + payload.organization + '</p>' +
    '<p style="margin:5px 0;color:#666;"><strong>' + dateLabel + '</strong>' + payload.proposedDate + '</p>' +
    '<p style="margin:5px 0;color:#666;"><strong>' + locLabel + '</strong>' + payload.location + '</p></div>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:30px 0;">' +
    '<p style="color:#666;font-size:14px;">' + questionLabel + ' <a href="mailto:events@healthmatters.clinic" style="color:#233dff;">events@healthmatters.clinic</a></p>' +
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
// HTML PAGE BUILDERS
// ========================================
function buildSuccessPage(name, eventTitle) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check-in | Health Matters Clinic</title></head>' +
    '<body style="font-family:Arial,sans-serif;margin:0;padding:40px 20px;background:#f0fdf4;min-height:100vh;box-sizing:border-box;">' +
    '<div style="background:white;padding:40px;border-radius:16px;max-width:400px;margin:0 auto;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="width:70px;height:70px;background:#10b981;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">' +
    '<span style="color:white;font-size:36px;">✓</span></div>' +
    '<h1 style="color:#166534;margin:0 0 10px;font-size:24px;">Check-in Successful!</h1>' +
    '<p style="color:#666;margin:10px 0;">Welcome, ' + name + '!</p>' +
    '<p style="font-weight:bold;color:#233dff;font-size:18px;">' + eventTitle + '</p>' +
    '<p style="color:#999;font-size:12px;margin-top:30px;">Health Matters Clinic Events</p>' +
    '</div></body></html>';
}

function buildAlreadyCheckedInPage(name, eventTitle) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check-in | Health Matters Clinic</title></head>' +
    '<body style="font-family:Arial,sans-serif;margin:0;padding:40px 20px;background:#f0fdf4;min-height:100vh;box-sizing:border-box;">' +
    '<div style="background:white;padding:40px;border-radius:16px;max-width:400px;margin:0 auto;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="width:70px;height:70px;background:#10b981;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">' +
    '<span style="color:white;font-size:36px;">✓</span></div>' +
    '<h1 style="color:#166534;margin:0 0 10px;font-size:24px;">Already Checked In!</h1>' +
    '<p style="color:#666;margin:10px 0;">Welcome back, ' + name + '!</p>' +
    '<p style="font-weight:bold;color:#233dff;font-size:18px;">' + eventTitle + '</p>' +
    '<p style="color:#999;font-size:12px;margin-top:30px;">Health Matters Clinic Events</p>' +
    '</div></body></html>';
}

function buildEarlyCheckinPage(name, eventTitle, eventDate) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check-in | Health Matters Clinic</title></head>' +
    '<body style="font-family:Arial,sans-serif;margin:0;padding:40px 20px;background:#fffbeb;min-height:100vh;box-sizing:border-box;">' +
    '<div style="background:white;padding:40px;border-radius:16px;max-width:400px;margin:0 auto;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="width:70px;height:70px;background:#f59e0b;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">' +
    '<span style="color:white;font-size:36px;">📅</span></div>' +
    '<h1 style="color:#92400e;margin:0 0 10px;font-size:24px;">Too Early to Check In</h1>' +
    '<p style="color:#666;margin:10px 0;">Hi ' + name + '!</p>' +
    '<p style="color:#666;">Check-in opens on the day of the event.</p>' +
    '<p style="font-weight:bold;color:#233dff;font-size:18px;">' + eventTitle + '</p>' +
    '<p style="color:#666;">' + eventDate + '</p>' +
    '<p style="color:#999;font-size:12px;margin-top:30px;">Health Matters Clinic Events</p>' +
    '</div></body></html>';
}

function buildErrorPage(message) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error | Health Matters Clinic</title></head>' +
    '<body style="font-family:Arial,sans-serif;margin:0;padding:40px 20px;background:#fef2f2;min-height:100vh;box-sizing:border-box;">' +
    '<div style="background:white;padding:40px;border-radius:16px;max-width:400px;margin:0 auto;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
    '<div style="font-size:50px;margin-bottom:20px;">❌</div>' +
    '<h1 style="color:#dc2626;margin:0 0 10px;font-size:24px;">Oops!</h1>' +
    '<p style="color:#666;">' + message + '</p>' +
    '<a href="https://www.healthmatters.clinic" style="display:inline-block;margin-top:20px;color:#233dff;text-decoration:none;">Go to Website</a>' +
    '<p style="color:#999;font-size:12px;margin-top:30px;">Health Matters Clinic Events</p>' +
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
