/**
 * The address of an online event.
 *
 * An in-person event's address is where to go; an online event's is where to join:
 * a Zoom, Google Meet, YouTube, Teams or similar link. It lives in the same
 * `address` field so it travels everywhere an address already does (the sheet, the
 * portal's allow-lists, the RSVP payload) and the confirmation email can hand it
 * to the attendee. A blank address is what used to stand in for "online", which
 * left the email with nothing to say about how to attend.
 */

/** Hosts we can name on a button. Anything else is still a valid join link. */
const PLATFORMS: ReadonlyArray<{ hosts: string[]; en: string; es: string }> = [
  { hosts: ['zoom.us', 'zoomgov.com'], en: 'Zoom', es: 'Zoom' },
  { hosts: ['meet.google.com'], en: 'Google Meet', es: 'Google Meet' },
  { hosts: ['youtube.com', 'youtu.be'], en: 'YouTube', es: 'YouTube' },
  { hosts: ['teams.microsoft.com', 'teams.live.com'], en: 'Microsoft Teams', es: 'Microsoft Teams' },
  { hosts: ['webex.com'], en: 'Webex', es: 'Webex' },
];

/**
 * The same pattern code.gs applies before a link goes into an email. Kept identical
 * on purpose: a link this front end accepts but the email script rejects would save
 * cleanly and then simply be missing from every confirmation.
 */
const JOIN_LINK_PATTERN = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?([/?#][^\s<>"'`]*)?$/;

const parseHttps = (raw: unknown): URL | null => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || !JOIN_LINK_PATTERN.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
};

/**
 * True when the value is a web address people can join from. https only: this is
 * placed in an email and a calendar entry, so it is an allowlist of one scheme
 * rather than a list of schemes to refuse.
 */
export const isJoinLink = (raw: unknown): boolean => parseHttps(raw) !== null;

/** The platform behind a join link, or '' when it is some other site. */
export const joinPlatform = (raw: unknown, lang: 'en' | 'es' = 'en'): string => {
  const url = parseHttps(raw);
  if (!url) return '';
  const host = url.hostname.toLowerCase();
  const hit = PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith('.' + h)));
  return hit ? hit[lang] : '';
};

/** "Online on Zoom", or just "Online" when the platform is not one we recognize. */
export const onlineLabel = (raw: unknown, lang: 'en' | 'es' = 'en'): string => {
  const platform = joinPlatform(raw, lang);
  if (lang === 'es') return platform ? `En línea por ${platform}` : 'En línea';
  return platform ? `Online on ${platform}` : 'Online';
};
