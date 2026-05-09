// ============================================================
// ONE-TIME SEND — MOVE reminder email to all May 9 RSVPs
// Run once from the GAS editor: select sendMOVEReminder → Run
// ============================================================

function sendMOVEReminder() {
  var SPREADSHEET_ID   = '1L57FfGbos21rzGu4ciuKipcumJchqe2ZzDPUyp-oRmM';
  var WAIVER_BASE_URL  = 'https://eventfinder.healthmatters.clinic/waiver.html';
  var EVENT_DATE_MATCH = '5/9/2026'; // matches sheet col D timestamp prefix

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('No RSVPs found.');
    return;
  }

  // Columns (1-based in sheet, 0-based in array):
  // A=Timestamp B=EventID C=EventTitle D=EventDate E=Name
  // F=Email G=Phone H=Contact I=SMS J=Minor K=MinorName
  // L=Needs M=Language N=Source O=CheckinToken P=Status
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  var sent = 0, skipped = 0;

  for (var i = 0; i < data.length; i++) {
    var row        = data[i];
    var eventDate  = String(row[3] || '');
    var name       = String(row[4] || '').trim();
    var email      = String(row[5] || '').trim().toLowerCase();
    var eventId    = String(row[1] || '').trim();
    var eventTitle = String(row[2] || '').trim();
    var token      = String(row[14] || '').trim();

    // Only MOVE (May 9) RSVPs with an email and token
    var isMOVE = eventDate.indexOf('5/9/2026') === 0 ||
                 (eventDate instanceof Date && Utilities.formatDate(eventDate, 'America/Los_Angeles', 'M/d/yyyy') === '5/9/2026') ||
                 eventTitle.toLowerCase().indexOf('move') !== -1 ||
                 eventTitle.toLowerCase().indexOf('walk') !== -1;

    if (!isMOVE || !email || !token) { skipped++; continue; }

    var firstName  = name.split(' ')[0] || 'there';
    var checkinUrl = WAIVER_BASE_URL + '?checkin=' + encodeURIComponent(token) +
                     (eventId ? '&event=' + encodeURIComponent(eventId) : '');

    var subject = 'Today is Live Unstoppable — Issa Rae + Spencer Paysinger · Check In Here';

    var html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:Inter,Arial,sans-serif;margin:0;padding:20px;background:#f5f3ef;">' +
      '<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);border:1px solid #e5e5e5;">' +

      // Header
      '<div style="background:#233dff;color:white;padding:24px;text-align:center;">' +
      '<img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png" alt="HMC" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;background:white;padding:4px;">' +
      '<h1 style="margin:0;font-size:20px;font-weight:700;">Health Matters Clinic</h1>' +
      '<p style="margin:8px 0 0;opacity:.85;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Unstoppable Season 2026</p>' +
      '</div>' +

      // Body
      '<div style="padding:32px;">' +
      '<p style="font-size:18px;color:#1a1a1a;font-weight:600;margin:0 0 6px;">Hi ' + firstName + ',</p>' +
      '<p style="color:#444;font-size:15px;line-height:1.65;margin:0 0 28px;">Today is Live Unstoppable — and you are on the list.</p>' +

      // Guests callout
      '<div style="background:#f0f4ff;border:1.5px solid rgba(35,61,255,.18);border-radius:12px;padding:20px 24px;margin:0 0 28px;">' +
      '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#233dff;">Mental Health Awareness Month</p>' +
      '<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#111;">Issa Rae + Spencer Paysinger</p>' +
      '<p style="margin:0;font-size:14px;color:#555;line-height:1.6;">Before the walk, Dave Helem hosts Issa Rae and Spencer Paysinger in conversation about movement, mental health, and what it means to be unstoppable. No stage. Crowd close. About 25 minutes.</p>' +
      '</div>' +

      // What it is / isn't
      '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What Live Unstoppable is</p>' +
      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 20px;">HMC\'s monthly community movement series — May\'s theme is Mental Health Awareness Month. Your pace, your distance. Movement as part of mental wellness, not a performance.</p>' +

      '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What Live Unstoppable is not</p>' +
      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 28px;">Not an official race. Not a timed event. You do not need to be an expert runner, an athlete, or anything other than yourself. Just show up and move with us.</p>' +

      // Series
      '<div style="border-left:3px solid #233dff;padding:12px 0 12px 18px;margin:0 0 28px;">' +
      '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#233dff;text-transform:uppercase;letter-spacing:.08em;">The full series — all free</p>' +
      '<p style="margin:4px 0;font-size:14px;color:#111;">Live Unstoppable &nbsp;&middot;&nbsp; May 9 &nbsp;<span style="color:#233dff;font-weight:600;">Today</span></p>' +
      '<p style="margin:4px 0;font-size:14px;color:#555;">HEAL &nbsp;&middot;&nbsp; May 20</p>' +
      '<p style="margin:4px 0;font-size:14px;color:#555;">TRANSFORM &nbsp;&middot;&nbsp; May 27</p>' +
      '</div>' +

      // Schedule
      '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 10px;">This morning\'s schedule</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:0 0 28px;">' +
      '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">7:45 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">Registration opens</td></tr>' +
      '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">8:15 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">The Talk — Issa Rae + Spencer Paysinger with Dave Helem</td></tr>' +
      '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">8:45 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">Walk/Run begins</td></tr>' +
      '</table>' +

      // Location
      '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">Where to go</p>' +
      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 8px;">123 W. Manchester Blvd, Inglewood, CA 90301</p>' +
      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 8px;"><strong>Enter at the Queen St. entrance.</strong> Limited parking on site due to construction — street parking and surrounding parking lots are available. Public transit and rideshare encouraged.</p>' +

      // Attire
      '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What to wear</p>' +
      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 32px;">Comfortable shoes and layers — mornings can be cool.</p>' +

      // Morning affirmation
      '<div style="background:#111;border-radius:12px;padding:24px 28px;margin:0 0 28px;text-align:center;">' +
      '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);">A word for this morning</p>' +
      '<p style="margin:0;font-size:17px;font-weight:700;color:#fff;line-height:1.5;">Today you move. Not because you have to — because you chose to. That is what unstoppable looks like.</p>' +
      '</div>' +

      // Check-in button
      '<div style="text-align:center;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:24px;margin:0 0 28px;">' +
      '<p style="margin:0 0 4px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Check in now</p>' +
      '<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.55;">Your waiver and check-in are handled in one step from your phone. Nothing to print.</p>' +
      '<a href="' + checkinUrl + '" style="display:inline-block;background:#233dff;color:#fff;padding:15px 48px;border-radius:30px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;letter-spacing:.02em;">Check In Now</a>' +
      '</div>' +

      '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 6px;">See you out there.</p>' +
      '<p style="font-size:14px;color:#555;margin:0 0 28px;">— Health Matters Clinic</p>' +

      '<div style="border-top:1px solid #eee;padding-top:20px;">' +
      '<p style="font-size:12px;color:#bbb;line-height:1.5;margin:0;">Questions? Reply to this email or visit <a href="https://www.healthmatters.clinic" style="color:#233dff;text-decoration:none;">healthmatters.clinic</a>.<br>In crisis? Call or text <strong>988</strong>.</p>' +
      '</div>' +
      '</div></div></body></html>';

    var plain =
      'Hi ' + firstName + ',\n\n' +
      'Today is Live Unstoppable — and you are on the list.\n\n' +
      'MENTAL HEALTH AWARENESS MONTH\n' +
      'Before the walk, Dave Helem hosts Issa Rae and Spencer Paysinger in conversation about movement, mental health, and what it means to be unstoppable.\n\n' +
      'WHAT LIVE UNSTOPPABLE IS\n' +
      'HMC\'s monthly community movement series — May\'s theme is Mental Health Awareness Month. Your pace, your distance. Movement as part of mental wellness, not a performance.\n\n' +
      'WHAT LIVE UNSTOPPABLE IS NOT\n' +
      'Not an official race. Not a timed event. You do not need to be an expert runner, an athlete, or anything other than yourself. Just show up and move with us.\n\n' +
      'THIS MORNING\'S SCHEDULE\n' +
      '7:45 AM — Registration opens\n' +
      '8:15 AM — The Talk: Issa Rae + Spencer Paysinger with Dave Helem\n' +
      '8:45 AM — Walk/Run begins\n\n' +
      'WHERE TO GO\n' +
      '123 W. Manchester Blvd, Inglewood, CA 90301\n' +
      'Enter at the Queen St. entrance. Limited parking on site — street parking and surrounding lots available. Transit/rideshare encouraged.\n\n' +
      'A WORD FOR THIS MORNING\n' +
      'Today you move. Not because you have to — because you chose to. That is what unstoppable looks like.\n\n' +
      'CHECK IN NOW\n' +
      checkinUrl + '\n\n' +
      'THE FULL SERIES — ALL FREE\n' +
      'Live Unstoppable · May 9 (Today)\n' +
      'HEAL · May 20\n' +
      'TRANSFORM · May 27\n\n' +
      'See you out there.\n' +
      '— Health Matters Clinic\n\n' +
      'Questions? healthmatters.clinic | Crisis: call or text 988';

    try {
      GmailApp.sendEmail(email, subject, plain, {
        htmlBody: html,
        name:     'Health Matters Clinic Events',
        replyTo:  'rsvp@healthmatters.clinic'
      });
      sent++;
      Logger.log('Sent: ' + email + ' — ' + name);
    } catch (err) {
      Logger.log('ERROR ' + email + ': ' + err);
      skipped++;
    }

    Utilities.sleep(200); // stay within Gmail send limits
  }

  Logger.log('===== DONE — Sent: ' + sent + '  Skipped: ' + skipped + ' =====');
}

function sendTestReminder() {
  var WAIVER_BASE_URL = 'https://eventfinder.healthmatters.clinic/waiver.html';
  var firstName  = 'Erica';
  var email      = 'erica@healthmatters.clinic';
  var token      = '7316c16a-be5a-417d-aeeb-b3b2c3d61844';
  var eventId    = 'event-1772063101013';
  var checkinUrl = WAIVER_BASE_URL + '?checkin=' + encodeURIComponent(token) + '&event=' + encodeURIComponent(eventId);

  var subject = '[TEST] Today is Live Unstoppable — Issa Rae + Spencer Paysinger · Check In Here';

  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:Inter,Arial,sans-serif;margin:0;padding:20px;background:#f5f3ef;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);border:1px solid #e5e5e5;">' +
    '<div style="background:#233dff;color:white;padding:24px;text-align:center;">' +
    '<img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png" alt="HMC" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;background:white;padding:4px;">' +
    '<h1 style="margin:0;font-size:20px;font-weight:700;">Health Matters Clinic</h1>' +
    '<p style="margin:8px 0 0;opacity:.85;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Unstoppable Season 2026</p>' +
    '</div>' +
    '<div style="padding:32px;">' +
    '<p style="font-size:18px;color:#1a1a1a;font-weight:600;margin:0 0 6px;">Hi ' + firstName + ',</p>' +
    '<p style="color:#444;font-size:15px;line-height:1.65;margin:0 0 28px;">Today is Live Unstoppable — and you are on the list.</p>' +
    '<div style="background:#f0f4ff;border:1.5px solid rgba(35,61,255,.18);border-radius:12px;padding:20px 24px;margin:0 0 28px;">' +
    '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#233dff;">Mental Health Awareness Month</p>' +
    '<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#111;">Issa Rae + Spencer Paysinger</p>' +
    '<p style="margin:0;font-size:14px;color:#555;line-height:1.6;">Before the walk, Dave Helem hosts Issa Rae and Spencer Paysinger in conversation about movement, mental health, and what it means to be unstoppable. No stage. Crowd close. About 25 minutes.</p>' +
    '</div>' +
    '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What Live Unstoppable is</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 20px;">HMC\'s monthly community movement series — May\'s theme is Mental Health Awareness Month. Your pace, your distance. Movement as part of mental wellness, not a performance.</p>' +
    '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What Live Unstoppable is not</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 28px;">Not an official race. Not a timed event. You do not need to be an expert runner, an athlete, or anything other than yourself. Just show up and move with us.</p>' +
    '<div style="border-left:3px solid #233dff;padding:12px 0 12px 18px;margin:0 0 28px;">' +
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#233dff;text-transform:uppercase;letter-spacing:.08em;">The full series — all free</p>' +
    '<p style="margin:4px 0;font-size:14px;color:#111;">Live Unstoppable &nbsp;&middot;&nbsp; May 9 &nbsp;<span style="color:#233dff;font-weight:600;">Today</span></p>' +
    '<p style="margin:4px 0;font-size:14px;color:#555;">HEAL &nbsp;&middot;&nbsp; May 20</p>' +
    '<p style="margin:4px 0;font-size:14px;color:#555;">TRANSFORM &nbsp;&middot;&nbsp; May 27</p>' +
    '</div>' +
    '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 10px;">This morning\'s schedule</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:0 0 28px;">' +
    '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">7:45 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">Registration opens</td></tr>' +
    '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">8:15 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">The Talk — Issa Rae + Spencer Paysinger with Dave Helem</td></tr>' +
    '<tr><td style="font-size:14px;font-weight:600;color:#233dff;padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top;">8:45 AM</td><td style="font-size:14px;color:#444;padding:6px 0;">Walk/Run begins</td></tr>' +
    '</table>' +
    '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">Where to go</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 8px;">123 W. Manchester Blvd, Inglewood, CA 90301</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 28px;"><strong>Enter at the Queen St. entrance.</strong> Limited parking on site due to construction — street parking and surrounding parking lots are available. Public transit and rideshare encouraged.</p>' +
    '<p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px;">What to wear</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 32px;">Comfortable shoes and layers — mornings can be cool.</p>' +
    '<div style="background:#111;border-radius:12px;padding:24px 28px;margin:0 0 28px;text-align:center;">' +
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);">A word for this morning</p>' +
    '<p style="margin:0;font-size:17px;font-weight:700;color:#fff;line-height:1.5;">Today you move. Not because you have to — because you chose to. That is what unstoppable looks like.</p>' +
    '</div>' +
    '<div style="text-align:center;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:24px;margin:0 0 28px;">' +
    '<p style="margin:0 0 4px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Check in now</p>' +
    '<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.55;">Your waiver and check-in are handled in one step from your phone. Nothing to print.</p>' +
    '<a href="' + checkinUrl + '" style="display:inline-block;background:#233dff;color:#fff;padding:15px 48px;border-radius:30px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;letter-spacing:.02em;">Check In Now</a>' +
    '</div>' +
    '<p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 6px;">See you out there.</p>' +
    '<p style="font-size:14px;color:#555;margin:0 0 28px;">— Health Matters Clinic</p>' +
    '<div style="border-top:1px solid #eee;padding-top:20px;">' +
    '<p style="font-size:12px;color:#bbb;line-height:1.5;margin:0;">Questions? Reply to this email or visit <a href="https://www.healthmatters.clinic" style="color:#233dff;text-decoration:none;">healthmatters.clinic</a>.<br>In crisis? Call or text <strong>988</strong>.</p>' +
    '</div></div></div></body></html>';

  var plain =
    '[TEST EMAIL]\n\n' +
    'Hi ' + firstName + ',\n\n' +
    'Today is Live Unstoppable — and you are on the list.\n\n' +
    'MENTAL HEALTH AWARENESS MONTH\n' +
    'Before the walk, Dave Helem hosts Issa Rae and Spencer Paysinger in conversation about movement, mental health, and what it means to be unstoppable.\n\n' +
    'WHAT LIVE UNSTOPPABLE IS\n' +
    'HMC\'s monthly community movement series — May\'s theme is Mental Health Awareness Month. Your pace, your distance. Movement as part of mental wellness, not a performance.\n\n' +
    'WHAT LIVE UNSTOPPABLE IS NOT\n' +
    'Not an official race. Not a timed event. You do not need to be an expert runner, an athlete, or anything other than yourself. Just show up and move with us.\n\n' +
    'THIS MORNING\'S SCHEDULE\n' +
    '7:45 AM — Registration opens\n' +
    '8:15 AM — The Talk: Issa Rae + Spencer Paysinger with Dave Helem\n' +
    '8:45 AM — Walk/Run begins\n\n' +
    'WHERE TO GO\n' +
    '123 W. Manchester Blvd, Inglewood, CA 90301\n' +
    'Enter at the Queen St. entrance. Limited parking on site — street parking and surrounding lots available. Transit/rideshare encouraged.\n\n' +
    'A WORD FOR THIS MORNING\n' +
    'Today you move. Not because you have to — because you chose to. That is what unstoppable looks like.\n\n' +
    'CHECK IN NOW\n' +
    checkinUrl + '\n\n' +
    'THE FULL SERIES — ALL FREE\n' +
    'Live Unstoppable · May 9 (Today)\n' +
    'HEAL · May 20\n' +
    'TRANSFORM · May 27\n\n' +
    'See you out there.\n' +
    '— Health Matters Clinic\n\n' +
    'Questions? healthmatters.clinic | Crisis: call or text 988';

  GmailApp.sendEmail(email, subject, plain, {
    htmlBody: html,
    name:     'Health Matters Clinic Events',
    replyTo:  'rsvp@healthmatters.clinic'
  });

  Logger.log('Test email sent to ' + email);
}
