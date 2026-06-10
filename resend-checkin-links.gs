// ============================================================
// ONE-TIME RESEND — corrected check-in links for all RSVPs
// Run once from the GAS editor: select resendCheckinLinks → Run
// ============================================================

function resendCheckinLinks() {
  var DRY_RUN = true; // CHANGE TO false ONLY when intentionally ready to send
  var MAX_SEND = 5;   // Safety cap — ignored in dry-run mode

  var SPREADSHEET_ID = '1L57FfGbos21rzGu4ciuKipcumJchqe2ZzDPUyp-oRmM';
  var EVENT_FINDER_URL = 'https://eventfinder.healthmatters.clinic';

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('No RSVPs found.');
    return;
  }

  // Columns (1-based in sheet, 0-based in array):
  // A=Timestamp B=Event ID C=Event Title D=Event Date E=Name
  // F=Email G=Phone H=Contact I=SMS J=Minor K=MinorName
  // L=Needs M=Language N=Source O=Checkin Token
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
  var sent = 0, skipped = 0;

  for (var i = 0; i < data.length; i++) {
    var row         = data[i];
    var eventId     = String(row[1]  || '').trim();
    var eventTitle  = String(row[2]  || '').trim();
    var eventDate   = String(row[3]  || '').trim();
    var name        = String(row[4]  || '').trim();
    var email       = String(row[5]  || '').trim().toLowerCase();
    var checkinToken = String(row[14] || '').trim();

    if (!email || !checkinToken) { skipped++; continue; }

    var firstName   = name.split(' ')[0] || 'there';
    var checkinUrl  = EVENT_FINDER_URL + '?checkin=' + encodeURIComponent(checkinToken) +
                      (eventId ? '&event=' + encodeURIComponent(eventId) : '');
    var eventLine   = eventTitle ? (eventTitle + (eventDate ? ' · ' + eventDate : '')) : '';

    var subject = 'Your Check-In Link — Unstoppable Season 2026';

    var html =
      '<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:32px 24px;background:#fff;">' +
      '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#999;">Health Matters Clinic</p>' +
      '<h2 style="margin:0 0 18px;font-size:22px;color:#111;">Hi ' + firstName + ', here’s your check-in link.</h2>' +
      '<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#444;">We updated our check-in system. Tap the button below on event day — no extra steps needed.</p>' +
      '<div style="text-align:center;margin:32px 0;">' +
      '<a href="' + checkinUrl + '" style="display:inline-block;background:#233dff;color:#fff;padding:16px 52px;border-radius:30px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;letter-spacing:.02em;">Check In on Event Day</a>' +
      '</div>' +
      (eventLine ? '<p style="text-align:center;font-size:13px;color:#999;margin:0 0 28px;">' + eventLine + '</p>' : '') +
      '<p style="font-size:13px;color:#bbb;line-height:1.5;border-top:1px solid #eee;padding-top:20px;margin:28px 0 0;">Questions? Reply to this email or visit <a href="https://www.healthmatters.clinic" style="color:#233dff;text-decoration:none;">healthmatters.clinic</a>.<br>In crisis? Call or text <strong>988</strong>.</p>' +
      '</div>';

    var plain =
      'Hi ' + firstName + ',\n\n' +
      'Here is your updated check-in link for the Unstoppable Season 2026:\n\n' +
      checkinUrl + '\n\n' +
      'Use this link on event day to check in.' +
      (eventLine ? '\n\nEvent: ' + eventLine : '') +
      '\n\nHealth Matters Clinic\nhttps://www.healthmatters.clinic';

    try {
      if (DRY_RUN) {
        Logger.log('[DRY RUN] Would send to: ' + email);
        sent++;
      } else {
        if (sent >= MAX_SEND) { Logger.log('MAX_SEND reached'); return; }
        GmailApp.sendEmail(email, subject, plain, {
          htmlBody:  html,
          name:      'Health Matters Clinic Events',
          replyTo:   'rsvp@healthmatters.clinic'
        });
        sent++;
        Logger.log('Sent: ' + email + ' — ' + name);
      }
    } catch (err) {
      Logger.log('ERROR ' + email + ': ' + err);
      skipped++;
    }

    Utilities.sleep(250); // stay within Gmail send limits
  }

  Logger.log('===== DONE — Sent: ' + sent + '  Skipped: ' + skipped + ' =====');
}
