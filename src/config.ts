// Configuration for Event Finder Tool

// Volunteer Portal API URL - used to fetch events and post RSVPs
export const VOLUNTEER_PORTAL_API_URL = 'https://hmc-volunteer-portal.vercel.app/api';

// Google Apps Script URL for form submissions
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJAvUOPoD55fqwcG0REUojOgraAZaham-8x7wojNxuwwC1srf0F1hZ-9adXKezcCHHsg/exec';

// Admin passcode for accessing the admin panel
export const ADMIN_PASSCODE = 'HMC2026';

// Local storage keys
export const STORAGE_KEYS = {
  EVENTS: 'event-finder-events',
  ADMIN_AUTH: 'event-finder-admin-auth',
} as const;
