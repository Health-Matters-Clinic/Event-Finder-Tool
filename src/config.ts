// Configuration for Event Finder Tool

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-KmIXY2Qu8zooU4f-hjbdpb59WKonTPJOwcktDV0SjxW5CJPMbtAV1rO0SdJx_0tK8Q/exec';

// Volunteer Portal API - dual-write RSVPs for volunteer matching
export const PORTAL_API_URL = 'https://hmc-volunteer-portal-172668994130.us-central1.run.app';

// reCAPTCHA v3 - invisible bot protection
export const RECAPTCHA_SITE_KEY = '6LfHmlssAAAAAB_K8kuGyUn_GgPf_m8ZsPiBhh0L';

// Local storage keys (used as cache only, backend is source of truth)
export const STORAGE_KEYS = {
  EVENTS_CACHE: 'event-finder-events-cache',
  ADMIN_AUTH: 'event-finder-admin-auth',
} as const;

// SHA-256 hash utility for passcode verification
export async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
