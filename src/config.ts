// Configuration for Event Finder Tool

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-KmIXY2Qu8zooU4f-hjbdpb59WKonTPJOwcktDV0SjxW5CJPMbtAV1rO0SdJx_0tK8Q/exec';

// Admin passcode for accessing the admin panel
export const ADMIN_PASSCODE = 'HMC2026';

// Volunteer Portal API - dual-write RSVPs for volunteer matching
export const PORTAL_API_URL = 'https://hmc-volunteer-portal-172668994130.us-west2.run.app';

// Local storage keys (used as cache only, backend is source of truth)
export const STORAGE_KEYS = {
  EVENTS_CACHE: 'event-finder-events-cache',
  ADMIN_AUTH: 'event-finder-admin-auth',
} as const;
