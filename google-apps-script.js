/**
 * Google Apps Script for Event Finder - Persistent Backend
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet with 2 tabs: "Events" and "RSVPs"
 * 2. In the Events tab, add these headers in row 1:
 *    id | title | date | dateDisplay | time | location | city | address | program | lat | lng | description | saveTheDate | flyerUrl | websiteUrl | isPromoted | isSponsored | createdAt
 * 3. In the RSVPs tab, add these headers in row 1:
 *    timestamp | eventId | eventTitle | eventDate | name | email | phone | contactMethod | smsConsent | isMinor | minorName | needs | lang | source | checkinToken | status | checkedInAt
 * 4. Create a new Google Apps Script project (script.google.com)
 * 5. Paste this entire code
 * 6. Replace SPREADSHEET_ID with your Google Sheet ID
 * 7. Deploy as Web App: Execute as "Me", Access "Anyone"
 * 8. Copy the deployment URL to your Event Finder config
 */

// CONFIGURE THIS - Replace with your actual Google Sheet ID
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// Sheet names
const EVENTS_SHEET = 'Events';
const RSVPS_SHEET = 'RSVPs';
const PARTNERS_SHEET = 'PartnerRequests';

function doGet(e) {
  const params = e.parameter;
  const action = params.action || 'getEvents';

  try {
    let result;

    switch (action) {
      case 'getEvents':
        result = getEvents();
        break;
      case 'getEvent':
        result = getEvent(params.id);
        break;
      default:
        // Handle RSVP/partner submissions via GET (image ping)
        if (params.action === 'preregister') {
          result = handleRSVP(params);
        } else if (params.action === 'partner_request') {
          result = handlePartnerRequest(params);
        } else {
          result = { success: false, error: 'Unknown action' };
        }
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let params;

    // Handle both JSON body and form data
    if (e.postData && e.postData.type === 'application/json') {
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter;
    }

    const action = params.action;
    let result;

    switch (action) {
      case 'saveEvent':
        result = saveEvent(params.event);
        break;
      case 'deleteEvent':
        result = deleteEvent(params.id);
        break;
      case 'saveAllEvents':
        result = saveAllEvents(params.events);
        break;
      case 'preregister':
        result = handleRSVP(params);
        break;
      case 'partner_request':
        result = handlePartnerRequest(params);
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============ EVENTS FUNCTIONS ============

function getEvents() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EVENTS_SHEET);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return { success: true, events: [] };
  }

  const headers = data[0];
  const events = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Skip empty rows

    const event = {};
    headers.forEach((header, index) => {
      let value = row[index];

      // Convert boolean strings
      if (value === 'TRUE' || value === true) value = true;
      else if (value === 'FALSE' || value === false) value = false;

      // Convert numbers
      if (header === 'lat' || header === 'lng') {
        value = parseFloat(value) || 0;
      }

      event[header] = value;
    });

    events.push(event);
  }

  return { success: true, events: events };
}

function getEvent(id) {
  const result = getEvents();
  if (!result.success) return result;

  const event = result.events.find(e => e.id === id);
  if (event) {
    return { success: true, event: event };
  }
  return { success: false, error: 'Event not found' };
}

function saveEvent(event) {
  if (!event || !event.id) {
    return { success: false, error: 'Invalid event data' };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EVENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find existing event row
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === event.id) {
      rowIndex = i + 1; // Sheet rows are 1-indexed
      break;
    }
  }

  // Prepare row data
  const rowData = headers.map(header => {
    let value = event[header];
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return value;
  });

  if (rowIndex > 0) {
    // Update existing row
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Append new row
    sheet.appendRow(rowData);
  }

  return { success: true, event: event };
}

function deleteEvent(id) {
  if (!id) {
    return { success: false, error: 'Event ID required' };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EVENTS_SHEET);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { success: false, error: 'Event not found' };
}

function saveAllEvents(events) {
  if (!events || !Array.isArray(events)) {
    return { success: false, error: 'Invalid events array' };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EVENTS_SHEET);
  const headers = sheet.getRange(1, 1, 1, 18).getValues()[0];

  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  // Add all events
  const rows = events.map(event => {
    return headers.map(header => {
      let value = event[header];
      if (value === undefined || value === null) return '';
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return value;
    });
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  return { success: true, count: events.length };
}

// ============ RSVP FUNCTIONS ============

function handleRSVP(params) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVPS_SHEET);

  // Generate a check-in token
  const checkinToken = Utilities.getUuid();
  const timestamp = new Date().toISOString();

  // Append row with RSVP data
  sheet.appendRow([
    timestamp,
    params.eventId || '',
    params.eventTitle || '',
    params.eventDate || '',
    params.name || '',
    params.email || '',
    params.phone || '',
    params.contact_method || '',
    params.sms_consent || 'false',
    params.isMinor || 'false',
    params.minorName || '',
    params.needs || '',
    params.lang || 'en',
    params.source || '',
    checkinToken,
    'registered',
    ''
  ]);

  // Send confirmation email if email provided
  if (params.email) {
    try {
      sendConfirmationEmail(params);
    } catch (emailError) {
      Logger.log('Email error: ' + emailError);
    }
  }

  return { success: true, checkinToken: checkinToken };
}

// ============ PARTNER REQUEST FUNCTIONS ============

function handlePartnerRequest(params) {
  // Try to get or create partner sheet
  let sheet;
  try {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PARTNERS_SHEET);
    if (!sheet) {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      sheet = ss.insertSheet(PARTNERS_SHEET);
      sheet.appendRow(['timestamp', 'name', 'email', 'organization', 'eventTitle', 'eventDescription', 'proposedDate', 'eventTime', 'location', 'flyerUrl', 'lang', 'status']);
    }
  } catch (e) {
    // If partner sheet doesn't exist, use RSVP sheet with marker
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVPS_SHEET);
  }

  const timestamp = new Date().toISOString();

  sheet.appendRow([
    timestamp,
    params.name || '',
    params.email || '',
    params.organization || '',
    params.eventTitle || '',
    params.eventDescription || '',
    params.proposedDate || '',
    params.eventTime || '',
    params.location || '',
    params.flyerUrl || '',
    params.lang || 'en',
    'pending'
  ]);

  // Notify admin
  try {
    sendAdminNotification(params);
  } catch (e) {
    Logger.log('Admin notification error: ' + e);
  }

  return { success: true };
}

// ============ EMAIL FUNCTIONS ============

function sendConfirmationEmail(params) {
  const subject = params.lang === 'es'
    ? `Confirmacion: ${params.eventTitle}`
    : `Confirmation: ${params.eventTitle}`;

  const body = params.lang === 'es'
    ? `Hola ${params.name},\n\nGracias por registrarte para ${params.eventTitle}!\n\nFecha: ${params.eventDate}\n\nTe esperamos.\n\n- Health Matters Clinic`
    : `Hi ${params.name},\n\nThank you for registering for ${params.eventTitle}!\n\nDate: ${params.eventDate}\n\nWe look forward to seeing you.\n\n- Health Matters Clinic`;

  MailApp.sendEmail(params.email, subject, body);
}

function sendAdminNotification(params) {
  // Replace with your admin email
  const adminEmail = Session.getActiveUser().getEmail();

  const subject = `New Partner Event Request: ${params.eventTitle}`;
  const body = `New partner event request received:\n\n` +
    `Organization: ${params.organization}\n` +
    `Contact: ${params.name} (${params.email})\n` +
    `Event: ${params.eventTitle}\n` +
    `Description: ${params.eventDescription}\n` +
    `Proposed Date: ${params.proposedDate}\n` +
    `Time: ${params.eventTime}\n` +
    `Location: ${params.location}\n` +
    `Flyer URL: ${params.flyerUrl || 'Not provided'}\n`;

  MailApp.sendEmail(adminEmail, subject, body);
}

// ============ UTILITY FUNCTIONS ============

// Test function to verify setup
function testSetup() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const eventsSheet = ss.getSheetByName(EVENTS_SHEET);
    const rsvpsSheet = ss.getSheetByName(RSVPS_SHEET);

    if (!eventsSheet) {
      Logger.log('ERROR: Events sheet not found. Create a sheet named "Events"');
      return false;
    }
    if (!rsvpsSheet) {
      Logger.log('ERROR: RSVPs sheet not found. Create a sheet named "RSVPs"');
      return false;
    }

    Logger.log('SUCCESS: Setup looks good!');
    Logger.log('Events sheet has ' + (eventsSheet.getLastRow() - 1) + ' events');
    Logger.log('RSVPs sheet has ' + (rsvpsSheet.getLastRow() - 1) + ' registrations');
    return true;
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    return false;
  }
}
