// ============================================================
// HMC — Eventbrite RSVP Auto-Sync
// ============================================================
// What it does:
//   1. Runs on a time trigger (every 10 min recommended)
//   2. Scans the rsvp@healthmatters.clinic inbox for unread
//      Eventbrite order-notification emails
//   3. Parses each email → extracts attendee name, email,
//      order #, event name, event date, location
//   4. Appends the RSVP to the same "RSVPs" sheet used by the
//      Event Finder (with Source = "Eventbrite")
//   5. Sends the attendee a warm HMC welcome email with their
//      personal check-in button (same link format as direct RSVPs)
//   6. Labels the thread "eventbrite-processed" so it is never
//      double-processed
//
// SETUP (one-time):
//   1. Paste this file into the same Apps Script project as code.gs
//      (or create a new project bound to the same spreadsheet)
//   2. In Triggers → Add Trigger:
//       Function:   processEventbriteEmails
//       Event:      Time-driven → Minutes timer → Every 10 minutes
//   3. Authorize the script — it needs Gmail + Spreadsheet access
// ============================================================

// ---- shared config (matches code.gs) -----------------------
var EB_CONFIG = {
  SPREADSHEET_ID:  '1L57FfGbos21rzGu4ciuKipcumJchqe2ZzDPUyp-oRmM',
  EVENT_FINDER_URL: 'https://eventfinder.healthmatters.clinic',
  TIMEZONE:        'America/Los_Angeles',
  BRAND_COLOR:     '#233dff',
  LOGO_URL:        'https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png',
  PROCESSED_LABEL: 'eventbrite-processed',
  SENDER_NAME:     'Health Matters Clinic Events',
  REPLY_TO:        'rsvp@healthmatters.clinic',
};

// ============================================================
// WEB APP ENTRY POINT — redirect legacy ?token= links to Event Finder
// ============================================================
function doGet(e) {
  var token = e && e.parameter && e.parameter.token;
  var dest = EB_CONFIG.EVENT_FINDER_URL;
  if (token) dest += '?checkin=' + encodeURIComponent(token);
  return HtmlService.createHtmlOutput(
    '<script>window.location.replace("' + dest + '")</script>'
  );
}

// ============================================================
// MAIN — called by time trigger
// ============================================================
function processEventbriteEmails() {
  var label = getOrCreateLabel(EB_CONFIG.PROCESSED_LABEL);

  // Retry once on transient INTERNAL storage errors (Google-side infrastructure blips)
  var threads;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var query = 'from:noreply@order.eventbrite.com subject:"Order Notification" is:unread -label:' + EB_CONFIG.PROCESSED_LABEL;
      threads = GmailApp.search(query, 0, 50);
      break;
    } catch (searchErr) {
      if (attempt === 0 && String(searchErr).indexOf('INTERNAL') !== -1) {
        Logger.log('Transient INTERNAL error on Gmail search — retrying in 5s');
        Utilities.sleep(5000);
      } else {
        throw searchErr;
      }
    }
  }

  Logger.log('Found ' + threads.length + ' unprocessed Eventbrite notification(s)');

  threads.forEach(function(thread) {
    try {
      var messages = thread.getMessages();
      var msg = messages[0];
      var body = msg.getPlainBody();
      var subject = msg.getSubject();

      var attendee = parseEventbriteEmail(body, subject);
      if (!attendee) {
        Logger.log('Could not parse: ' + subject);
        thread.addLabel(label);
        return;
      }

      Logger.log('Parsed RSVP: ' + attendee.name + ' <' + attendee.email + '> for ' + attendee.eventTitle);

      var checkinToken = Utilities.getUuid();
      var eventMatch = lookupEvent(attendee.eventTitle);
      var eventId = eventMatch ? eventMatch.id : ('eventbrite-' + attendee.orderNum);
      if (eventMatch) attendee.eventTitle = eventMatch.title;
      writeToRSVPSheet(attendee, checkinToken);

      var checkinUrl = EB_CONFIG.EVENT_FINDER_URL + '?event=' + encodeURIComponent(eventId) + '&checkin=' + checkinToken;
      sendEventbriteWelcomeEmail(attendee, checkinUrl);

      thread.addLabel(label);
      thread.markRead();

    } catch (err) {
      Logger.log('Error processing thread: ' + err);
    }
  });
}

// ============================================================
// PARSE — extract structured data from Eventbrite email body
// ============================================================
function parseEventbriteEmail(body, subject) {
  try {
    var attendee = {
      name:       '',
      email:      '',
      orderNum:   '',
      eventTitle: '',
      eventDate:  '',
      eventTime:  '',
      location:   '',
    };

    // Normalize line endings (\r\n → \n)
    body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // --- Event title from subject line ---
    var subjectMatch = subject.match(/Order Notification for (.+)/i);
    if (subjectMatch) attendee.eventTitle = subjectMatch[1].trim();

    // --- Attendee name + email ---
    // Actual Eventbrite plain text format has " \n" (space-newline) as blank lines:
    //
    // Pattern A — top of email:
    //   "confirmation email for:\n \nLeizel Olegario\ndancingvotebox@yahoo.com\nOrder # 123"
    var confBlock = body.match(/confirmation email for:\n[^\n]*\n([A-Za-z][^\n@]{2,60})\n([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (confBlock) {
      attendee.name  = confBlock[1].trim();
      attendee.email = confBlock[2].trim();
    }

    // Pattern B — Ticket section:
    //   "Ticket #1: General Admission\n \nLeizel Olegario\ndancingvotebox@yahoo.com"
    if (!attendee.name || !attendee.email) {
      var ticketBlock = body.match(/Ticket\s*#\d+[^\n]*\n[^\n]*\n([A-Za-z][^\n@]{2,60})\n([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
      if (ticketBlock) {
        attendee.name  = ticketBlock[1].trim();
        attendee.email = ticketBlock[2].trim();
      }
    }

    // Fallback: email anywhere + name on line before it
    if (!attendee.email) {
      var emailMatch = body.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        attendee.email = emailMatch[1];
        var beforeEmail = body.substring(0, body.indexOf(emailMatch[1]));
        var lines = beforeEmail.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
        var candidate = lines[lines.length - 1] || '';
        if (candidate && !/order|event|notification|confirmation|cheers|good news/i.test(candidate) && candidate.length < 60) {
          attendee.name = candidate;
        }
      }
    }

    // --- Order number ---
    var orderMatch = body.match(/Order\s*#\s*(\d{8,})/i);
    if (orderMatch) attendee.orderNum = orderMatch[1];

    // --- Phone ---
    // Actual format: "Cell Phone\n \n6199201387"  (blank line between label and value)
    var phoneMatch = body.match(/Cell\s*Phone\n[^\n]*\n([0-9][0-9\-\+\(\) ]{6,18})/i);
    attendee.phone = phoneMatch ? phoneMatch[1].trim() : '';

    // --- Shirt size ---
    // Actual format: "Shirt Size\n \nS"
    var shirtMatch = body.match(/Shirt\s*Size\n[^\n]*\n([^\n\r]{1,5})/i);
    attendee.tshirtSize = shirtMatch ? shirtMatch[1].trim() : '';

    // --- Event date/time ---
    var dateMatch = body.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+ \d+,\s*\d{4})(?:\s+from\s+([\d:]+\s*[AP]M)\s+to\s+([\d:]+\s*[AP]M))?/i);
    if (dateMatch) {
      attendee.eventDate = dateMatch[1] + ', ' + dateMatch[2];
      if (dateMatch[3] && dateMatch[4]) attendee.eventTime = dateMatch[3] + ' – ' + dateMatch[4] + ' PT';
    }

    // --- Location ---
    var locationMatch = body.match(/(\d+[^\n]+(?:Blvd|Ave|St|Dr|Rd|Way|Ln|Pl)[^\n]*)\n([^\n]+,\s*[A-Z]{2}\s+\d{5})/i);
    if (locationMatch) {
      attendee.location = locationMatch[1].trim() + ', ' + locationMatch[2].trim();
    }

    Logger.log('Parse result — name: "' + attendee.name + '" email: "' + attendee.email + '" phone: "' + attendee.phone + '" shirt: "' + attendee.tshirtSize + '" order: "' + attendee.orderNum + '"');

    // Require at minimum a name and email
    if (!attendee.name || !attendee.email) return null;

    return attendee;

  } catch (err) {
    Logger.log('Parse error: ' + err);
    return null;
  }
}

// ============================================================
// SHEET — append RSVP row (same 17-col schema as handleRSVP)
// ============================================================
function writeToRSVPSheet(attendee, checkinToken) {
  var ss = SpreadsheetApp.openById(EB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet) {
    sheet = ss.insertSheet('RSVPs');
    sheet.appendRow([
      'Timestamp', 'Event ID', 'Event Title', 'Event Date', 'Name',
      'Email', 'Phone', 'Contact Method', 'SMS Consent', 'Is Minor',
      'Minor Name', 'Needs', 'Language', 'Source', 'Checkin Token',
      'Status', 'Checked In At', 'Shirt Size'
    ]);
  }

  // Dedup — check PropertiesService cache first (fast, no sheet read)
  // Falls back to a one-time sheet scan to seed the cache on first run
  if (attendee.orderNum) {
    var props = PropertiesService.getScriptProperties();
    var cacheKey = 'eb_order_' + attendee.orderNum;
    if (props.getProperty(cacheKey)) {
      Logger.log('Skipping duplicate order #' + attendee.orderNum + ' (cached)');
      return;
    }
    // Cold-cache fallback: scan sheet once to check (seeds cache for future runs)
    if (sheet.getLastRow() > 1) {
      var srcData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      var headers2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var srcCol2  = headers2.indexOf('Source');
      for (var j = 0; j < srcData.length; j++) {
        var src2 = String(srcData[j][srcCol2] || '');
        var m = src2.match(/Eventbrite #(\d+)/);
        if (m) props.setProperty('eb_order_' + m[1], '1');
      }
      if (props.getProperty(cacheKey)) {
        Logger.log('Skipping duplicate order #' + attendee.orderNum + ' (sheet scan)');
        return;
      }
    }
    // Mark as processed in cache immediately so concurrent runs don't double-write
    props.setProperty(cacheKey, '1');
  }

  // Try to match to an existing Event ID in the Events sheet
  var eventId = lookupEventId(attendee.eventTitle);

  var timestamp = Utilities.formatDate(new Date(), EB_CONFIG.TIMEZONE, 'M/d/yyyy h:mm a') + ' PST';

  sheet.appendRow([
    timestamp,
    eventId || 'eventbrite-' + attendee.orderNum,
    attendee.eventTitle,
    attendee.eventDate,
    attendee.name,
    attendee.email,
    attendee.phone || '',     // Cell Phone from Questions section
    '',                       // contact method
    '',                       // SMS consent
    '',                       // is minor
    '',                       // minor name
    '',                       // needs
    'en',                     // language
    'Eventbrite #' + attendee.orderNum,
    checkinToken,
    'pre-registered',
    '',                       // checked in at
    attendee.tshirtSize || '' // Shirt Size from Questions section
  ]);
}

// ============================================================
// EVENT ID LOOKUP — fuzzy match on title in Events sheet
// ============================================================
// Returns { id, title } using the canonical title from the Events sheet,
// or null if no match. Using the sheet title avoids storing raw Eventbrite
// subject-line casing (e.g. "UNSTOPPABLE: WELLNESS MEETUP") in the RSVPs sheet.
function lookupEvent(title) {
  try {
    var ss = SpreadsheetApp.openById(EB_CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');
    if (!sheet || sheet.getLastRow() < 2) return null;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol    = headers.indexOf('id');
    var titleCol = headers.indexOf('title');
    if (idCol === -1 || titleCol === -1) return null;

    var titleNorm = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

    for (var i = 1; i < data.length; i++) {
      var canonicalTitle = String(data[i][titleCol]);
      var sheetNorm = canonicalTitle.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (sheetNorm && (sheetNorm.indexOf(titleNorm) !== -1 || titleNorm.indexOf(sheetNorm) !== -1)) {
        var id = String(data[i][idCol]);
        if (id && /^event-\d+$/.test(id)) return { id: id, title: canonicalTitle };
      }
    }
    return null;
  } catch (err) {
    Logger.log('Event lookup error: ' + err);
    return null;
  }
}

// Legacy wrapper — callers that only need the ID
function lookupEventId(title) {
  var match = lookupEvent(title);
  return match ? match.id : null;
}

// ============================================================
// EMAIL — warm HMC welcome, same design as existing RSVP emails
// ============================================================
function sendEventbriteWelcomeEmail(attendee, checkinUrl) {
  var firstName = attendee.name.split(' ')[0] || attendee.name;
  var upcomingHtml = buildUpcomingEventsHtml(attendee.eventTitle);
  var subject = "You're registered! | " + attendee.eventTitle;

  // Event detail rows
  var eventDetails =
    (attendee.eventDate ? "<tr><td style='padding:4px 0;font-size:14px;color:#555;'><strong>Date:</strong> " + esc(attendee.eventDate) + "</td></tr>" : '') +
    (attendee.eventTime ? "<tr><td style='padding:4px 0;font-size:14px;color:#555;'><strong>Time:</strong> " + esc(attendee.eventTime) + "</td></tr>" : '') +
    (attendee.location  ? "<tr><td style='padding:4px 0;font-size:14px;color:#555;'><strong>Location:</strong> " + esc(attendee.location) + "</td></tr>" : '');

  // Upcoming events section
  var upcomingSection = upcomingHtml
    ? "<tr><td style='padding:24px 0 0;border-top:1px solid #e5e5e5;'>" +
      "<p style='font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 14px;'>More Upcoming Events</p>" +
      upcomingHtml + "</td></tr>"
    : '';

  var htmlBody =
    "<!doctype html><html><head><meta charset='utf-8'/>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'/>" +
    "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap' rel='stylesheet'>" +
    "</head><body style='margin:0;padding:20px;background:#f5f3ef;font-family:Inter,Arial,sans-serif;color:#1a1a1a;'>" +
    "<table role='presentation' width='100%' cellspacing='0' cellpadding='0'>" +
    "<tr><td align='center'>" +
    "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:1px solid #e5e5e5;'>" +

    // Header
    "<tr><td style='padding:24px;background:#233dff;text-align:center;'>" +
    "<img src='" + EB_CONFIG.LOGO_URL + "' alt='HMC' width='48' height='48' style='width:48px;height:48px;border-radius:8px;display:block;margin:0 auto 12px;'>" +
    "<h1 style='margin:0;font-size:22px;font-weight:700;color:#ffffff;'>Health Matters Clinic</h1>" +
    "<p style='margin:8px 0 0;opacity:0.9;font-size:14px;color:#ffffff;'>Registration Confirmed</p>" +
    "</td></tr>" +

    // Body
    "<tr><td style='padding:32px;'>" +
    "<table role='presentation' width='100%' cellspacing='0' cellpadding='0'>" +

    // Greeting
    "<tr><td><p style='font-size:18px;color:#1a1a1a;font-weight:600;margin:0 0 8px;'>Hi " + esc(firstName) + "!</p>" +
    "<p style='font-size:15px;line-height:24px;color:#555;margin:0 0 20px;'>Your registration has been confirmed for:</p></td></tr>" +

    // Event box
    "<tr><td style='background:#f0f4ff;padding:20px;border-radius:12px;margin-bottom:24px;border:1.5px solid rgba(35,61,255,0.2);display:block;'>" +
    "<h2 style='color:#233dff;margin:0 0 12px;font-size:18px;font-weight:700;'>" + esc(attendee.eventTitle) + "</h2>" +
    "<table role='presentation' cellspacing='0' cellpadding='0'>" + eventDetails + "</table>" +
    "</td></tr>" +

    // Check-in note
    "<tr><td style='padding:24px 0 24px;text-align:center;'><p style='font-size:12px;color:#9ca3af;margin:8px 0 0;'>We will send you check-in instructions before the event.</p></td></tr>" +

    // About HMC
    "<tr><td style='background:#fafafa;padding:20px;border-radius:12px;border:1px solid #f0f0f0;display:block;'>" +
    "<p style='font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;'>About Health Matters Clinic</p>" +
    "<p style='color:#555;font-size:14px;line-height:1.7;margin:0 0 10px;'>Health Matters Clinic is a 501(c)(3) community-powered organization on a mission to break down barriers to health. We connect people to free care, mental health support, and essential resources where it&#39;s needed most, while creating experiences that help people heal, grow, and take control of their health.</p>" +
    "<a href='https://healthmatters.clinic' style='color:#233dff;font-size:14px;font-weight:600;text-decoration:none;'>Learn more at healthmatters.clinic &rarr;</a>" +
    "</td></tr>" +

    upcomingSection +

    "</table></td></tr>" +

    // Footer
    "<tr><td style='background:#f5f3ef;padding:20px;border-top:1px solid #e5e5e5;text-align:center;'>" +
    "<p style='color:#666;font-size:13px;margin:0;'>Questions? <a href='mailto:contact@healthmatters.clinic' style='color:#233dff;font-weight:600;'>contact@healthmatters.clinic</a></p>" +
    "<p style='margin:12px 0 0;font-size:11px;color:#9ca3af;'>&copy; " + new Date().getFullYear() + " Health Matters Clinic. All rights reserved.</p>" +
    "</td></tr>" +

    "</table></td></tr></table></body></html>";

  var textBody =
    'Hi ' + firstName + '!\n\n' +
    'Your registration for ' + attendee.eventTitle + ' is confirmed.\n\n' +
    (attendee.eventDate ? 'Date: '     + attendee.eventDate + '\n' : '') +
    (attendee.eventTime ? 'Time: '     + attendee.eventTime + '\n' : '') +
    (attendee.location  ? 'Location: ' + attendee.location  + '\n' : '') +
    '\nCheck-in instructions will be sent before the event.\n\n' +
    'Health Matters Clinic connects communities in LA to free health, mental health, housing, and social services.\nhealthmatters.clinic\n\n' +
    'Questions? contact@healthmatters.clinic';

  GmailApp.sendEmail(attendee.email, subject, textBody, {
    name:     EB_CONFIG.SENDER_NAME,
    replyTo:  EB_CONFIG.REPLY_TO,
    htmlBody: htmlBody,
  });

  Logger.log('Welcome email sent to ' + attendee.email);
}

// ── HTML helpers (matches email-service.gs) ──────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escAttr(str) { return esc(str).replace(/"/g, '&quot;'); }

// ============================================================
// SEND TEST EMAIL — run this once from the Apps Script editor
// to preview the welcome email in your own inbox
// ============================================================
function sendTestWelcomeEmail() {
  var testAttendee = {
    name:       'Erica Robinson',
    email:      'contact@healthmatters.clinic', // ← change to your email
    orderNum:   'TEST001',
    eventTitle: 'Live Unstoppable Walk/Run',
    eventDate:  'Saturday, May 9, 2026',
    eventTime:  '8:00 AM PT',
    location:   '123 W Manchester Blvd, Inglewood, CA 90301',
  };
  var fakeCheckinUrl = EB_CONFIG.EVENT_FINDER_URL + '?checkin=test-preview-token';
  sendEventbriteWelcomeEmail(testAttendee, fakeCheckinUrl);
  Logger.log('Test email sent!');
}

// ============================================================
// TAKE ACTION LA — hardcoded campaign events (May 2026)
// These are shown in welcome emails as "More Upcoming Events"
// ============================================================
var TAKE_ACTION_EVENTS = [
  {
    title:     'Live Unstoppable Walk/Run',
    dateStr:   'Saturday, May 9, 2026',
    time:      '8:00 AM',
    eventDate: new Date('May 9, 2026'),
    link:      'https://www.healthmatters.clinic/resources/eventfinder?event=event-1772063101013',
  },
  {
    title:     'Unstoppable Wellness Meetup',
    dateStr:   'Wednesday, May 20, 2026',
    time:      '6:00 PM',
    location:  '123 W Manchester Blvd, Inglewood, CA 90301',
    eventDate: new Date('May 20, 2026'),
    link:      'https://www.healthmatters.clinic/resources/eventfinder?event=event-1772064063990',
  },
  {
    title:     'UNSTOPPABLE Experience',
    dateStr:   'Wednesday, May 27, 2026',
    time:      '6:00 PM',
    location:  'Virtual — Online',
    eventDate: new Date('May 27, 2026'),
    link:      'https://www.healthmatters.clinic/resources/eventfinder?event=event-1773943614235',
  },
];

// ============================================================
// UPCOMING EVENTS — show Take Action LA events (excl. current),
// then fall back to Events sheet if campaign is over
// ============================================================
function buildUpcomingEventsHtml(excludeTitle) {
  try {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter to future Take Action events, exclude the one they just registered for
    var upcoming = TAKE_ACTION_EVENTS.filter(function(ev) {
      return ev.title !== excludeTitle && ev.eventDate >= today;
    });

    // If campaign is over, fall back to Events sheet
    if (!upcoming.length) {
      upcoming = getUpcomingFromSheet(excludeTitle, today);
    }

    if (!upcoming.length) return '';

    var html = '';
    upcoming.forEach(function(ev) {
      var cardStyle = 'display:block;margin-bottom:16px;padding:16px;background:#fafafa;border-radius:12px;border:1px solid #f0f0f0;text-decoration:none;color:inherit;';
      var open  = ev.link ? '<a href="' + escAttr(ev.link) + '" style="' + cardStyle + '">' : '<div style="' + cardStyle + '">';
      var close = ev.link ? '</a>' : '</div>';
      html +=
        open +
        '<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a1a1a;">' + esc(ev.title) + '</p>' +
        (ev.dateStr ? '<p style="margin:0 0 6px;font-size:13px;color:#666;">' + esc(ev.dateStr) + (ev.time ? ' &middot; ' + esc(ev.time) : '') + '</p>' : '') +
        (ev.link ? '<span style="font-size:13px;font-weight:600;color:#233dff;">Register &rarr;</span>' : '') +
        close;
    });
    return html;

  } catch (err) {
    Logger.log('Upcoming events error: ' + err);
    return '';
  }
}

function getUpcomingFromSheet(excludeTitle, today) {
  try {
    var ss = SpreadsheetApp.openById(EB_CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Events');
    if (!sheet || sheet.getLastRow() < 2) return [];

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var titleCol = headers.indexOf('title');
    var dateCol  = headers.indexOf('dateDisplay');
    var timeCol  = headers.indexOf('time');
    var linkCol  = headers.indexOf('registrationLink');
    if (titleCol === -1) return [];

    var results = [];
    for (var i = 1; i < data.length; i++) {
      var title = String(data[i][titleCol] || '').trim();
      if (!title || title === excludeTitle) continue;
      var dateStr = dateCol !== -1 ? String(data[i][dateCol] || '').trim() : '';
      var eventDate = null;
      if (dateStr) { try { eventDate = new Date(dateStr); } catch (e) {} }
      if (eventDate && eventDate < today) continue;
      results.push({ title: title, dateStr: dateStr, eventDate: eventDate,
        time: timeCol !== -1 ? String(data[i][timeCol] || '').trim() : '',
        link: linkCol !== -1 ? String(data[i][linkCol] || '').trim() : '' });
    }
    results.sort(function(a, b) {
      if (!a.eventDate && !b.eventDate) return 0;
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate - b.eventDate;
    });
    return results.slice(0, 3);
  } catch (err) {
    Logger.log('Sheet events error: ' + err);
    return [];
  }
}

// ============================================================
// HELPERS
// ============================================================
function getOrCreateLabel(name) {
  var labels = GmailApp.getUserLabels();
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].getName() === name) return labels[i];
  }
  return GmailApp.createLabel(name);
}



// ============================================================
// REPROCESS FAILED — removes "eventbrite-processed" label from
// emails that were labeled but never written to the sheet.
// Run this ONCE manually after updating the parser to retry them.
// ============================================================
function reprocessFailedEmails() {
  var label = getOrCreateLabel(EB_CONFIG.PROCESSED_LABEL);

  // Find all threads with the processed label
  var threads = GmailApp.search('label:' + EB_CONFIG.PROCESSED_LABEL + ' from:noreply@order.eventbrite.com', 0, 100);
  Logger.log('Found ' + threads.length + ' previously processed threads to check');

  // Get all order numbers already in the RSVPs sheet
  var ss = SpreadsheetApp.openById(EB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');
  var processedOrders = {};
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sourceCol = headers.indexOf('Source');
    for (var i = 1; i < data.length; i++) {
      var src = String(data[i][sourceCol] || '');
      var match = src.match(/Eventbrite #(\d+)/);
      if (match) processedOrders[match[1]] = true;
    }
  }
  Logger.log('Already in sheet: ' + Object.keys(processedOrders).length + ' Eventbrite orders');

  var resetCount = 0;
  threads.forEach(function(thread) {
    try {
      var body = thread.getMessages()[0].getPlainBody().replace(/\r\n/g, '\n');
      var orderMatch = body.match(/Order\s*#\s*(\d{8,})/i);
      var orderNum = orderMatch ? orderMatch[1] : null;

      if (!orderNum || !processedOrders[orderNum]) {
        // Not in sheet — remove label so it gets reprocessed
        thread.removeLabel(label);
        thread.markUnread();
        resetCount++;
        Logger.log('Reset thread for retry: ' + thread.getFirstMessageSubject());
      }
    } catch (err) {
      Logger.log('Error checking thread: ' + err);
    }
  });

  Logger.log('Reset ' + resetCount + ' thread(s) for reprocessing. Run processEventbriteEmails next.');
}

// ============================================================
// MANUAL TEST — run this function once from the Apps Script
// editor to test with a real Eventbrite email already in inbox
// ============================================================
function testEventbriteParsing() {
  var sampleSubject = 'Order Notification for Unstoppable Workshop: Cultural Competence and Inclusion';
  var sampleBody = [
    'Good news!',
    'An order for Unstoppable Workshop: Cultural Competence and Inclusion just came through.',
    'Below, you\'ll find a copy of the order confirmation email for:',
    ' ',
    'nancy huebner',
    'onefrzzldmom@gmail.com',
    'Order # 14614150863',
    '',
    'Friday, May 8, 2026 from 10:15 AM to 11:45 AM (PT)',
    '',
    '2072 E Palmdale Blvd',
    '2072 East Palmdale Boulevard',
    'Palmdale, CA 93550',
  ].join('\n');

  var result = parseEventbriteEmail(sampleBody, sampleSubject);
  Logger.log(JSON.stringify(result, null, 2));
}
