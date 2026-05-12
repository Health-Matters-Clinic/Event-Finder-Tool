// Configuration for Event Finder Tool

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL =
  import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbyM6jD_8ePyk4_M2Ki0gKFjq0AKZZSonZFqirvygPDlFv06lz6tFtDE0BBGhAc95FZsBA/exec';

// Volunteer Portal API - dual-write RSVPs for volunteer matching
export const PORTAL_API_URL =
  import.meta.env.VITE_PORTAL_API_URL ||
  'https://hmc-volunteer-portal-172668994130.us-central1.run.app';

// reCAPTCHA v3 - invisible bot protection
export const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  '6LfHmlssAAAAAB_K8kuGyUn_GgPf_m8ZsPiBhh0L';

// Local storage keys (used as cache only, backend is source of truth)
export const STORAGE_KEYS = {
  EVENTS_CACHE: 'event-finder-events-cache',
  ADMIN_AUTH: 'event-finder-admin-auth',
  ADMIN_HASH: 'event-finder-admin-hash',
} as const;

export function buildGasUrl(params: URLSearchParams): string {
  return `${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;
}

export async function postGasJson(params: Record<string, unknown>): Promise<any> {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      body.append(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  });

  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

// SHA-256 hash utility for passcode verification
export async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
