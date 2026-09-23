/**
 * Which flyer links the Event Finder will show as an image.
 *
 * The public partner form used to ask for "a public link" to a flyer on Google
 * Drive, Dropbox or Canva. Those are share pages, not images: rendered in an
 * <img> they show nothing, and in the event schema they hand search engines a
 * link to somebody's file browser. Flyer uploads belong to approved HMC Partner
 * accounts, which store the file with HMC. So a share-page link is never used
 * as an image, whatever sheet row it arrives in.
 */
const SHARE_PAGE_HOSTS = [
  'canva.com', 'canva.link',
  'dropbox.com', 'dropboxusercontent.com', 'db.tt',
  'drive.google.com', 'docs.google.com', 'photos.google.com', 'photos.app.goo.gl',
];

const hostOf = (raw: string): string => {
  try { return new URL(raw.trim()).hostname.toLowerCase(); } catch { return ''; }
};

export const isShareLinkNotImage = (raw: string): boolean => {
  const host = hostOf(raw);
  if (!host) return false;
  return SHARE_PAGE_HOSTS.some(h => host === h || host.endsWith('.' + h));
};

/** The flyer URL to render, or '' when there is nothing safe to show. */
export const displayableFlyerUrl = (value: unknown): string => {
  const raw = value ? String(value) : '';
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/')) return '';
  if (isShareLinkNotImage(raw)) return '';
  return raw;
};
