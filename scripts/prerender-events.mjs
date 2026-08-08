/**
 * Generates a real, crawlable page per event, plus a sitemap.
 *
 * eventfinder.healthmatters.clinic is already crawlable on its own domain, but
 * it is client-rendered: every event shares one URL, so Google has no per-event
 * page to attach an Event rich result to. This creates one page per event at
 * build time from live data, so the markup can never go stale the way the
 * hand-written schema did.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://volunteer.healthmatters.clinic/api/public/events';
const ORIGIN = 'https://eventfinder.healthmatters.clinic';
const DIST = 'dist';
const ORG = { '@type': 'Organization', name: 'Health Matters Clinic', url: 'https://www.healthmatters.clinic' };

const esc = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slug = (e) => String(e.id || e.title || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/** Combine the event date with its start time when one is parseable. */
function startISO(e) {
  if (!e.date) return null;
  const m = String(e.time || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return e.date;
  let h = parseInt(m[1], 10);
  if (/PM/i.test(m[3]) && h !== 12) h += 12;
  if (/AM/i.test(m[3]) && h === 12) h = 0;
  return `${e.date}T${String(h).padStart(2,'0')}:${m[2] || '00'}:00-07:00`;
}

function schema(e) {
  const url = `${ORIGIN}/event/${slug(e)}/`;
  const s = {
    '@context': 'https://schema.org', '@type': 'Event',
    name: e.title,
    description: e.description || `${e.title} hosted by Health Matters Clinic in ${e.city || 'Los Angeles County'}.`,
    url, eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true, organizer: ORG,
    // Stating price explicitly is what lets Google show the "Free" label.
    offers: { '@type':'Offer', price:'0', priceCurrency:'USD', availability:'https://schema.org/InStock', url },
  };
  const start = startISO(e);
  if (start) s.startDate = start;
  if (e.flyerUrl) s.image = e.flyerUrl;
  if (e.location || e.address) {
    s.location = { '@type':'Place', name: e.location || e.city,
      address: { '@type':'PostalAddress', streetAddress: e.address || undefined,
        addressLocality: e.city || undefined, addressRegion:'CA', addressCountry:'US' } };
    if (e.lat && e.lng) s.location.geo = { '@type':'GeoCoordinates', latitude:e.lat, longitude:e.lng };
  }
  return s;
}

const page = (e) => {
  const url = `${ORIGIN}/event/${slug(e)}/`;
  const desc = e.description || `${e.title} hosted by Health Matters Clinic in ${e.city || 'Los Angeles County'}. Free and open to the community.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(e.title)}${e.dateDisplay ? ` | ${esc(e.dateDisplay)}` : ''} | Health Matters Clinic</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(e.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${e.flyerUrl ? `<meta property="og:image" content="${esc(e.flyerUrl)}">` : ''}
<script type="application/ld+json">
${JSON.stringify(schema(e), null, 2)}
</script>
<style>
body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:40px 24px;color:#141518;line-height:1.6}
h1{font-size:32px;line-height:1.15;margin:0 0 8px}.meta{color:#4b4f5a;margin:0 0 24px}
.cta{display:inline-flex;align-items:center;gap:14px;background:#2333df;color:#fff;border:1px solid #0f0f0f;border-radius:100px;padding:12px 22px;text-decoration:none}
img{max-width:100%;border-radius:12px;margin:24px 0}
</style>
</head>
<body>
<main>
<h1>${esc(e.title)}</h1>
<p class="meta">${esc(e.dateDisplay || e.date || '')}${e.time ? ` &middot; ${esc(e.time)}` : ''}<br>${esc(e.location || '')}${e.address ? `<br>${esc(e.address)}` : ''}</p>
<p>${esc(desc)}</p>
<p>Hosted by Health Matters Clinic. Free and open to the community.</p>
${e.flyerUrl ? `<img src="${esc(e.flyerUrl)}" alt="${esc(e.title)} flyer">` : ''}
<p><a class="cta" href="/?event=${encodeURIComponent(slug(e))}">RSVP for this event</a></p>
<p><a href="/">See all free wellness events near you</a></p>
</main>
</body>
</html>
`;
};

try {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`events API returned ${res.status}`);
  const events = (await res.json()).filter((e) => e && e.title && e.date);
  for (const e of events) {
    const dir = join(DIST, 'event', slug(e));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), page(e), 'utf8');
  }
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`  <url><loc>${ORIGIN}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...events.map((e) => `  <url><loc>${ORIGIN}/event/${slug(e)}/</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>`)].join('\n');
  await writeFile(join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
  console.log(`prerendered ${events.length} event page(s) + sitemap.xml`);
} catch (err) {
  // A prerender failure must never break the deploy; the app still works.
  console.warn(`[prerender-events] skipped: ${err.message}`);
}
