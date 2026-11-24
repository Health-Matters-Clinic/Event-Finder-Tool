/**
 * The date a partner typed into the "Post an Event" form, read back from the sheet.
 *
 * The form sends YYYY-MM-DD. Google Sheets turns that into a date cell, and the
 * Apps Script hands it back as a full timestamp (midnight in the script's time zone,
 * which is 04:00 to 10:00 UTC on the same calendar day). Shown through the browser's
 * own time zone it came out a day early, at 10 PM, and the approval form could not read
 * it at all, so the date field opened empty and every approved event needed its date
 * typed in again.
 *
 * A date cell is a calendar day, not a moment, so the day is the UTC date of the
 * timestamp. That is right for any United States time zone, which is where every
 * script and every partner is.
 */
export function partnerRequestDate(raw: string | undefined | null): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/** "Tue, Jun 1, 2027" for a YYYY-MM-DD day, or the original text when it cannot be read. */
export function partnerRequestDateLabel(raw: string | undefined | null): string {
  const iso = partnerRequestDate(raw);
  if (!iso) return String(raw ?? '');
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
