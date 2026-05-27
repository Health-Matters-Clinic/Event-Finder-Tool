// Configuration for Event Finder Tool

// Ad/sponsor banner configuration
export interface AdBanner {
  id: string;
  imageUrl: string;       // URL to the banner image
  linkUrl: string;        // Where clicking takes you
  altText: string;        // Accessibility + display fallback
  isActive: boolean;
}

export const AD_BANNERS: AdBanner[] = [
  {
    id: 'lacdmh-take-action',
    imageUrl: 'https://teamhmc.github.io/Event-Finder-Tool/ads/lacdmh-banner.png',
    linkUrl: 'https://healthmatters.clinic/takeactionla',
    altText: 'Take Action LA — Free Mental Health Events this May',
    isActive: true,
  },
  {
    id: 'hmc-calmkit',
    imageUrl: 'https://teamhmc.github.io/Event-Finder-Tool/ads/calmkit-banner.png',
    linkUrl: 'https://healthmatters.clinic',
    altText: 'CalmKit — Free Mental Wellness App by Health Matters Clinic',
    isActive: true,
  },
  {
    id: 'hmc-volunteer',
    imageUrl: 'https://teamhmc.github.io/Event-Finder-Tool/ads/volunteer-banner.png',
    linkUrl: 'https://volunteer.healthmatters.clinic',
    altText: 'Join the HMC Volunteer Team — Apply Today',
    isActive: true,
  },
];

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL =
  import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbz98ofEpj4SyQPXPer7qY8F04IFweCIv3s_MtGuHtU5OhmSUURgfEuBlQ5I-D8tily1TA/exec';

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
