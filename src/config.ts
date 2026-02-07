// Configuration for Event Finder Tool

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
// IMPORTANT: Replace this with your deployed Google Apps Script URL
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJAvUOPoD55fqwcG0REUojOgraAZaham-8x7wojNxuwwC1srf0F1hZ-9adXKezcCHHsg/exec';

// Admin passcode for accessing the admin panel
export const ADMIN_PASSCODE = 'HMC2026';

// Local storage keys (used as cache only, backend is source of truth)
export const STORAGE_KEYS = {
  EVENTS_CACHE: 'event-finder-events-cache',
  ADMIN_AUTH: 'event-finder-admin-auth',
} as const;
