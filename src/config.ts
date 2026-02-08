// Configuration for Event Finder Tool

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxWCsuJczUbaPbRA48bskH7EMb31bZahT6w78IXZC6LjymUhv7wN-gMCPj8xNtnt8kqJw/exec';

// Admin passcode for accessing the admin panel
export const ADMIN_PASSCODE = 'HMC2026';

// Local storage keys (used as cache only, backend is source of truth)
export const STORAGE_KEYS = {
  EVENTS_CACHE: 'event-finder-events-cache',
  ADMIN_AUTH: 'event-finder-admin-auth',
} as const;
