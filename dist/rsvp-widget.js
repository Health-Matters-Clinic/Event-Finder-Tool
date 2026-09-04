/**
 * HMC RSVP Widget — retired, intentionally a no-op.
 *
 * The Webflow site still loads this file from its site-wide footer custom code,
 * so it must keep resolving. It does nothing on purpose.
 *
 * Two things were wrong with the widget it replaces:
 *
 * 1. It was already inert. It only ever built a button for elements carrying
 *    `.hmc-rsvp-container`, and no page on www.healthmatters.clinic has one.
 *    Verified in a browser after scripts ran: containers=0, rsvpButtons=0.
 *
 * 2. It reported success unconditionally. It POSTed to an Apps Script
 *    deployment that no longer resolves, and that endpoint answers 200 with an
 *    HTML error page. The old code read that as a win:
 *
 *        if (!response.ok) throw ...            // 200 passes
 *        try { data = await response.json(); }  // HTML throws, swallowed
 *        catch (_) {}                           // data stays null
 *        if (data && data.success === false)    // null passes
 *        return { success: true };              // "You're Registered!"
 *
 *    Its catch-block fallback returned { success: true } as well. Had anyone
 *    ever added that container class, every RSVP would have shown a
 *    confirmation screen and written nothing anywhere.
 *
 * RSVPs belong to the Event Finder, which records who owns each event's
 * registration and refuses, server-side, to collect one on behalf of an
 * organization that owns it. See rsvpOwner() in code.gs.
 *
 * Safe to delete outright once the script tag is gone from Webflow's footer
 * custom code (Site Settings -> Custom Code -> Footer).
 */
