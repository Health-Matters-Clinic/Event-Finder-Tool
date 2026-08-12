// Configuration for Event Finder Tool

// Ad/sponsor banner configuration
export interface AdBanner {
  id: string;
  imageUrl: string;         // Desktop: 728×90 pixels (leaderboard)
  mobileImageUrl?: string;  // Mobile 320x50 pixels (optional, falls back to imageUrl scaled)
  linkUrl: string;          // Where clicking takes you
  altText: string;          // Accessibility + display fallback
  isActive: boolean;
  order?: number;
}

// Default empty, banners are fetched dynamically from the Google Sheet
export const AD_BANNERS: AdBanner[] = [];

// Map a raw GAS ad row to the AdBanner shape, filtering inactive ones.
function mapActiveAds(ads: any[]): AdBanner[] {
  return ads
    .filter((ad: any) => ad.active === true || ad.active === 'TRUE')
    .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((ad: any): AdBanner => ({
      id: String(ad.id || ''),
      imageUrl: String(ad.imageUrl || ''),
      mobileImageUrl: ad.mobileImageUrl ? String(ad.mobileImageUrl) : undefined,
      linkUrl: String(ad.linkUrl || ''),
      altText: String(ad.altText || ''),
      isActive: true,
      order: Number(ad.order) || 0,
    }));
}

// Fetch active ad banners.
// Primary path is the portal API proxy, which fetches GAS server-side (GAS 302-redirects, which browser
// fetch() can fail to follow in iframes/Safari, silently returning no ads).
// Fallback: direct GAS call, mirroring how events are loaded.
export async function fetchAdBanners(): Promise<AdBanner[]> {
  // Primary: portal proxy
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${PORTAL_API_URL}/api/public/ads`, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.ads)) {
        return mapActiveAds(data.ads);
      }
    }
  } catch {
    // fall through to direct GAS
  }

  // Fallback: direct GAS
  try {
    const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_ads`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !Array.isArray(data.ads)) return [];
    return mapActiveAds(data.ads);
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
