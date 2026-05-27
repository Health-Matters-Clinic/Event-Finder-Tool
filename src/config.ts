// Configuration for Event Finder Tool

// Ad/sponsor banner configuration
export interface AdBanner {
  id: string;
  imageUrl: string;         // Desktop: 728×90 pixels (leaderboard)
  mobileImageUrl?: string;  // Mobile: 320×50 pixels (optional — falls back to imageUrl scaled)
  linkUrl: string;          // Where clicking takes you
  altText: string;          // Accessibility + display fallback
  isActive: boolean;
  order?: number;
}

// Default empty — banners are fetched dynamically from Google Sheet
export const AD_BANNERS: AdBanner[] = [];

// Fetch active ad banners from GAS (Ads sheet)
export async function fetchAdBanners(): Promise<AdBanner[]> {
  try {
    const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_ads`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !Array.isArray(data.ads)) return [];
    const active = data.ads
      .filter((ad: any) => ad.active === true || ad.active === 'TRUE')
      .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));
    return active.map((ad: any): AdBanner => ({
      id: String(ad.id || ''),
      imageUrl: String(ad.imageUrl || ''),
      mobileImageUrl: ad.mobileImageUrl ? String(ad.mobileImageUrl) : undefined,
      linkUrl: String(ad.linkUrl || ''),
      altText: String(ad.altText || ''),
      isActive: true,
      order: Number(ad.order) || 0,
    }));
  } catch {
    return [];
  }
}

// Google Apps Script URL - Backend for events, RSVPs, and partner requests
export const GOOGLE_APPS_SCRIPT_URL =
  import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPUzjEIQhwEO5uD55EK1IHKKHh3RabUtAGyNcNkx_1KpefWm21_FOuRrZknDWyGU1J1g/exec';

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
