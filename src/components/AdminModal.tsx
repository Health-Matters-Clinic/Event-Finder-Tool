import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { ClinicEvent, EventSession, Language } from '../types';
import { STORAGE_KEYS, GOOGLE_APPS_SCRIPT_URL, PORTAL_API_URL, hashPasscode, postGasJson, AdBanner } from '../config';
import { EVENTS } from '../constants';

interface AdminModalProps {
  lang: Language;
  events: ClinicEvent[];
  onClose: () => void;
  onEventsUpdate: (events: ClinicEvent[]) => void;
}

type AdminView = 'passcode' | 'main' | 'edit' | 'reset-request' | 'reset-confirm' | 'partner-requests' | 'ads';

interface AdRow {
  id: string;            // row number as string
  imageUrl: string;      // Desktop: 728×90
  mobileImageUrl: string; // Mobile: 320×50 (empty string if not provided)
  linkUrl: string;
  altText: string;
  active: boolean;
  order: number;
}

const emptyAdForm = (): AdRow => ({ id: '', imageUrl: '', mobileImageUrl: '', linkUrl: '', altText: '', active: true, order: 0 });

interface PartnerAdSubmission {
  id: string;
  partnerName: string;
  imageUrl: string;
  mobileImageUrl: string;
  linkUrl: string;
  altText: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

interface PartnerRequest {
  id: number;
  submittedAt: string;
  name: string;
  email: string;
  organization: string;
  eventTitle: string;
  eventDescription: string;
  proposedDate: string;
  eventTime: string;
  location: string;
  flyerUrl: string;
  websiteUrl: string;
  rsvpMode: string;
  rsvpContact: string;
  lang: string;
  status: string;
}

/**
 * Events still carrying no answer about who owns their RSVP. Those fall back to the
 * pre-field behaviour (a link means the org, a blank means HMC's own form), which is
 * the very default this field replaces, so they are surfaced rather than left to sit.
 */
const rsvpModeUnset = (e: ClinicEvent): boolean =>
  !['hmc', 'hmc-for-partner', 'external', 'none'].includes(String(e.rsvpMode || ''));

const PROGRAM_OPTIONS = [
  'Unstoppable Workshop',
  'Unstoppable Wellness Meetup',
  'Community Walk & Run',
  'Community Fair',
  'Community Wellness',
  'Partner Event',
  'Training',
  'Volunteer',
  // Not everything is Unstoppable. A summit, an interfaith meeting and a resource
  // fair were all filed as Community Wellness and drawn in the same colour.
  'Conference',
  'Meeting',
  'Panel',
];

const PROGRAM_COLORS: Record<string, string> = {
  'Unstoppable Workshop': '#233dff',
  'Unstoppable Wellness Meetup': '#7c3aed',
  'Community Walk & Run': '#059669',
  'Community Fair': '#ea580c',
  'Community Wellness': '#db2777',
  'Partner Event': '#0891b2',
  'Training': '#4338ca',
  'Volunteer': '#f59e0b',
  'Conference': '#b91c1c',
  'Meeting': '#0d9488',
  'Panel': '#a21caf',
};

const SHARE_BASE_URL = 'https://www.healthmatters.clinic/resources/eventfinder?event=';
const REQUIRED_EVENT_IDS = ['event-1772064063990', 'event-1773943614235'];

// Get default date (2 weeks from now), in local time. See todayStr() below
// for why toISOString() is the wrong tool for a local calendar date.
const getDefaultDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const emptyEvent: ClinicEvent = {
  id: '',
  title: '',
  date: getDefaultDate(),
  dateDisplay: '',
  time: '',
  location: '',
  city: '',
  address: '',
  program: 'Community Wellness',
  // Deliberately 0, not a real coordinate. These used to default to 33.9719 /
  // -118.2108, which is DEFAULT_CENTER in App.tsx, so every event saved without
  // looking up coordinates landed on one spot in Willowbrook and looked placed.
  lat: 0,
  lng: 0,
  description: '',
  saveTheDate: false,
  isPromoted: false,
  isSponsored: false,
};

// Helper: parse event date to midnight local Date
const parseEventDate = (dateStr: string): Date => {
  return new Date(dateStr + 'T00:00:00');
};

// Helper: get today as YYYY-MM-DD, in local time. toISOString() converts to
// UTC first, which rolls the date forward a full day for anyone west of UTC
// (e.g. Pacific) once local time passes UTC midnight minus the offset, an
// event dated tomorrow was showing a TODAY badge from early evening onward.
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const preserveRequiredEvents = (events: ClinicEvent[]) => {
  const byId = new Map(events.map((event) => [event.id, event]));
  REQUIRED_EVENT_IDS.forEach((id) => {
    if (!byId.has(id)) {
      const fallback = EVENTS.find((event) => event.id === id);
      if (fallback) byId.set(id, fallback);
    }
  });
  return Array.from(byId.values());
};

// Helper: days between two YYYY-MM-DD strings
const daysBetween = (a: string, b: string): number => {
  const msDay = 86400000;
  return Math.round((parseEventDate(a).getTime() - parseEventDate(b).getTime()) / msDay);
};

// Collapsible section component for the edit form
const FormSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
};

// Skeleton placeholder for loading states
const SkeletonCard: React.FC = () => (
  <div className="animate-pulse bg-gray-100 rounded-xl p-4 flex items-center gap-4">
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
    <div className="flex gap-2">
      <div className="h-8 w-16 bg-gray-200 rounded-full" />
      <div className="h-8 w-16 bg-gray-200 rounded-full" />
    </div>
  </div>
);

export const AdminModal: React.FC<AdminModalProps> = ({
  lang,
  events,
  onClose,
  onEventsUpdate,
}) => {
  const [view, setView] = useState<AdminView>('passcode');
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [passcodeLoading, setPasscodeLoading] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [editingEvent, setEditingEvent] = useState<ClinicEvent | null>(null);
  const [formData, setFormData] = useState<ClinicEvent>(emptyEvent);
  const [eventFormat, setEventFormat] = useState<'in-person' | 'in-person-tba' | 'virtual'>('in-person');
  const [geoStatus, setGeoStatus] = useState<'' | 'looking' | 'ok' | 'none' | 'error'>('');

  /**
   * Turn the typed address into coordinates, so an event lands where it actually is.
   * Nothing in this codebase geocoded before, and the coordinate fields were
   * pre-filled with the map's default centre, so every event added without
   * manually looking up a latitude was pinned to the same spot.
   *
   * Runs only when the button is pressed, never on render or on save, which keeps
   * usage to a handful of requests a day and well inside Nominatim's terms.
   */
  const lookUpCoordinates = async () => {
    const street = (formData.address || '').trim();
    const city = (formData.city || '').trim();
    if (!street && !city) { setGeoStatus('none'); return; }

    // A suite or unit number is not something a street gazetteer knows, and it
    // makes the whole lookup miss: "801 Parkview Dr N Suite #100" returns nothing
    // while "801 Parkview Dr N" resolves. Try what was typed first, then retry
    // without the unit designator.
    const withoutUnit = street
      .replace(/[,;]?\s*(?:suite|ste\.?|apt\.?|unit|#)\s*[\w-]*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[,\s]+$/, '');

    const attempts = Array.from(new Set([street, withoutUnit].filter(Boolean)))
      .map((line) => [line, city, 'CA', 'USA'].filter(Boolean).join(', '));

    setGeoStatus('looking');
    try {
      for (const query of attempts) {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`,
          { headers: { Accept: 'application/json' } },
        );
        if (!res.ok) throw new Error(String(res.status));
        const hits = await res.json();
        const hit = Array.isArray(hits) ? hits[0] : null;
        const lat = hit ? parseFloat(hit.lat) : NaN;
        const lng = hit ? parseFloat(hit.lon) : NaN;
        if (isFinite(lat) && isFinite(lng)) {
          setFormData((prev) => ({ ...prev, lat, lng }));
          setGeoStatus('ok');
          return;
        }
      }
      setGeoStatus('none');
    } catch {
      setGeoStatus('error');
    }
  };
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Partner requests state
  const [partnerRequests, setPartnerRequests] = useState<PartnerRequest[]>([]);
  const [partnerRequestsLoading, setPartnerRequestsLoading] = useState(false);
  const [partnerRequestCount, setPartnerRequestCount] = useState<number | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [approveFormData, setApproveFormData] = useState<Partial<ClinicEvent>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [partnerActionLoading, setPartnerActionLoading] = useState(false);
  const [partnerToast, setPartnerToast] = useState<string | null>(null);

  // Ads state
  const [ads, setAds] = useState<AdRow[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState('');
  const [adFormVisible, setAdFormVisible] = useState(false);
  const [adForm, setAdForm] = useState<AdRow>(emptyAdForm());
  const [adSaving, setAdSaving] = useState(false);
  const [adsToast, setAdsToast] = useState<string | null>(null);
  const [adLinkMode, setAdLinkMode] = useState<'event' | 'custom' | 'none'>('event');

  // Partner ad submissions state
  const [partnerAds, setPartnerAds] = useState<PartnerAdSubmission[]>([]);
  const [partnerAdsLoading, setPartnerAdsLoading] = useState(false);
  const [partnerAdsError, setPartnerAdsError] = useState('');
  const [partnerAdsToast, setPartnerAdsToast] = useState<string | null>(null);

  // Trust session auth within the same browser session -- passcode was already verified
  useEffect(() => {
    const auth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
    if (auth === 'true') {
      setView('main');
    }
  }, []);

  // Fetch partner request count when on main view
  useEffect(() => {
    if (view === 'main') {
      fetchPartnerRequestCount();
    }
    if (view === 'ads') {
      fetchAds();
      fetchPartnerAds();
    }
  }, [view]);

  const fetchPartnerRequestCount = async () => {
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    if (!hash) return;
    try {
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_partner_requests&hash=${encodeURIComponent(hash)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setPartnerRequestCount(data.requests.length);
        setPartnerRequests(data.requests);
      }
    } catch {
      // silently ignore, the badge just won't show
    }
  };

  const fetchPartnerRequests = async () => {
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    if (!hash) return;
    setPartnerRequestsLoading(true);
    try {
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_partner_requests&hash=${encodeURIComponent(hash)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setPartnerRequests(data.requests);
        setPartnerRequestCount(data.requests.length);
      }
    } catch {
      // keep existing list
    } finally {
      setPartnerRequestsLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setPartnerToast(msg);
    setTimeout(() => setPartnerToast(null), 3000);
  };

  // ---- Ads helpers ----
  const showAdsToast = (msg: string) => {
    setAdsToast(msg);
    setTimeout(() => setAdsToast(null), 3000);
  };

  const showPartnerAdsToast = (msg: string) => {
    setPartnerAdsToast(msg);
    setTimeout(() => setPartnerAdsToast(null), 4000);
  };

  const fetchPartnerAds = async () => {
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    if (!hash) return;
    setPartnerAdsLoading(true);
    setPartnerAdsError('');
    try {
      const res = await fetch(`${PORTAL_API_URL}/api/public/partner-ads-pending?hash=${encodeURIComponent(hash)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.ads)) {
        setPartnerAds(data.ads.map((d: any) => ({
          id: d.id,
          partnerName: d.partnerName || 'Unknown Partner',
          imageUrl: d.imageUrl || '',
          mobileImageUrl: d.mobileImageUrl || '',
          linkUrl: d.linkUrl || '',
          altText: d.altText || '',
          notes: d.notes || '',
          status: d.status || 'pending',
          submittedAt: d.submittedAt || '',
        })));
      } else {
        setPartnerAdsError(data.error || 'Failed to load partner submissions');
      }
    } catch {
      setPartnerAdsError('Connection error loading partner submissions');
    } finally {
      setPartnerAdsLoading(false);
    }
  };

  const handleApprovePartnerAd = async (ad: PartnerAdSubmission) => {
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    if (!hash) return;
    try {
      const res = await fetch(`${PORTAL_API_URL}/api/public/partner-ads/${ad.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      const data = await res.json();
      if (data.success) {
        showPartnerAdsToast('Ad approved and sent to Event Finder.');
        setPartnerAds(prev => prev.filter(a => a.id !== ad.id));
      } else {
        showPartnerAdsToast('Error: ' + (data.error || 'Approval failed'));
      }
    } catch {
      showPartnerAdsToast('Connection error. Please try again.');
    }
  };

  const handleRejectPartnerAd = async (ad: PartnerAdSubmission) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? null;
    if (reason === null) return; // user cancelled prompt
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    if (!hash) return;
    try {
      const res = await fetch(`${PORTAL_API_URL}/api/public/partner-ads/${ad.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, reason }),
      });
      const data = await res.json();
      if (data.success) {
        showPartnerAdsToast('Ad rejected and partner notified.');
        setPartnerAds(prev => prev.filter(a => a.id !== ad.id));
      } else {
        showPartnerAdsToast('Error: ' + (data.error || 'Rejection failed'));
      }
    } catch {
      showPartnerAdsToast('Connection error. Please try again.');
    }
  };

  const fetchAds = async () => {
    setAdsLoading(true);
    setAdsError('');
    try {
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_ads`);
      const data = await res.json();
      if (data.success && Array.isArray(data.ads)) {
        setAds(data.ads.map((ad: any): AdRow => ({
          id: String(ad.id || ''),
          imageUrl: String(ad.imageUrl || ''),
          mobileImageUrl: String(ad.mobileImageUrl || ''),
          linkUrl: String(ad.linkUrl || ''),
          altText: String(ad.altText || ''),
          active: ad.active === true || ad.active === 'TRUE',
          order: Number(ad.order) || 0,
        })));
      } else {
        setAdsError(data.error || 'Failed to load ads');
      }
    } catch {
      setAdsError('Connection error');
    } finally {
      setAdsLoading(false);
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdSaving(true);
    setAdsError('');
    try {
      const params = new URLSearchParams({
        action: 'save_ad',
        hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '',
        id: adForm.id,
        imageUrl: adForm.imageUrl,
        mobileImageUrl: adForm.mobileImageUrl,
        linkUrl: adForm.linkUrl,
        altText: adForm.altText,
        active: adForm.active ? 'TRUE' : 'FALSE',
        order: String(adForm.order),
      });
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        showAdsToast(adForm.id ? 'Ad updated.' : 'Ad created.');
        setAdFormVisible(false);
        setAdForm(emptyAdForm());
        await fetchAds();
      } else {
        setAdsError(data.error || 'Save failed');
      }
    } catch {
      setAdsError('Connection error');
    } finally {
      setAdSaving(false);
    }
  };

  const handleDeleteAd = async (id: string) => {
    const ad = ads.find(a => a.id === id);
    if (!ad) return;
    if (!window.confirm('Remove this ad? It will be deactivated and hidden from the Event Finder.')) return;
    setAdsError('');
    try {
      const params = new URLSearchParams({
        action: 'save_ad',
        hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '',
        id: ad.id,
        imageUrl: ad.imageUrl,
        mobileImageUrl: ad.mobileImageUrl,
        linkUrl: ad.linkUrl,
        altText: ad.altText,
        active: 'FALSE',
        order: String(ad.order),
      });
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        showAdsToast('Ad removed.');
        await fetchAds();
      } else {
        setAdsError(data.error || 'Failed to remove ad');
      }
    } catch {
      setAdsError('Connection error');
    }
  };

  const handleToggleAdActive = async (ad: AdRow) => {
    setAdsError('');
    try {
      const params = new URLSearchParams({
        action: 'save_ad',
        hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '',
        id: ad.id,
        imageUrl: ad.imageUrl,
        mobileImageUrl: ad.mobileImageUrl,
        linkUrl: ad.linkUrl,
        altText: ad.altText,
        active: ad.active ? 'FALSE' : 'TRUE',
        order: String(ad.order),
      });
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        await fetchAds();
      } else {
        setAdsError(data.error || 'Toggle failed');
      }
    } catch {
      setAdsError('Connection error');
    }
  };

  const handleApprovePartnerRequest = async (req: PartnerRequest) => {
    setPartnerActionLoading(true);
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    // Build the date display string from proposedDate
    let dateDisplay = approveFormData.dateDisplay || '';
    if (!dateDisplay && approveFormData.date) {
      const [year, month, day] = (approveFormData.date as string).split('-').map(Number);
      const d = new Date(year, month - 1, day);
      dateDisplay = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    const eventData: Partial<ClinicEvent> = {
      id: `event-${Date.now()}`,
      title: approveFormData.title || req.eventTitle,
      date: approveFormData.date || '',
      dateDisplay,
      time: approveFormData.time || req.eventTime,
      location: approveFormData.location || req.location,
      city: approveFormData.city || req.location,
      address: approveFormData.address || req.location,
      program: approveFormData.program || 'Partner Event',
      description: approveFormData.description || req.eventDescription,
      flyerUrl: req.flyerUrl || '',
      // A partner request is by definition someone else's event, so the submitting
      // organization is the host and their answer about registration is carried
      // through. These used to be dropped on approval, which is how a partner event
      // with its own Eventbrite page arrived on the listing pointing at HMC's form.
      hostOrg: req.organization || '',
      rsvpMode: (['hmc', 'hmc-for-partner', 'external', 'none'].includes(req.rsvpMode)
        ? req.rsvpMode
        : req.websiteUrl
        ? 'external'
        : 'none') as ClinicEvent['rsvpMode'],
      websiteUrl: req.websiteUrl || '',
      rsvpContact: req.rsvpContact || '',
      lat: approveFormData.lat || 33.9719,
      lng: approveFormData.lng || -118.2108,
      isPromoted: false,
      isSponsored: false,
      saveTheDate: false,
      createdAt: new Date().toISOString(),
    };
    try {
      const params = new URLSearchParams({
        action: 'approve_partner_request',
        hash,
        rowIndex: String(req.id),
        eventData: JSON.stringify(eventData),
      });
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        // Also save event to portal backend
        try {
          await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'saveEvent', event: eventData, hash }),
          });
          fetch(`${PORTAL_API_URL}/api/public/bust-events-cache`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash }),
          }).catch(() => {});
        } catch { /* non-fatal */ }
        // Update local events list
        const updated = [...events, eventData as ClinicEvent];
        const safeUpdated = preserveRequiredEvents(updated);
        onEventsUpdate(safeUpdated);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(safeUpdated));
        setPartnerRequests((prev) => prev.filter((r) => r.id !== req.id));
        setPartnerRequestCount((c) => (c !== null ? Math.max(0, c - 1) : null));
        setApprovingId(null);
        setApproveFormData({});
        showToast('Event approved and published.');
      } else {
        showToast('Error: ' + (data.error || 'Approval failed'));
      }
    } catch {
      showToast('Connection error. Please try again.');
    } finally {
      setPartnerActionLoading(false);
    }
  };

  const handleRejectPartnerRequest = async (req: PartnerRequest) => {
    setPartnerActionLoading(true);
    const hash = sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '';
    try {
      const params = new URLSearchParams({
        action: 'reject_partner_request',
        hash,
        rowIndex: String(req.id),
        reason: rejectReason,
      });
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPartnerRequests((prev) => prev.filter((r) => r.id !== req.id));
        setPartnerRequestCount((c) => (c !== null ? Math.max(0, c - 1) : null));
        setRejectingId(null);
        setRejectReason('');
        showToast('Submission rejected and submitter notified.');
      } else {
        showToast('Error: ' + (data.error || 'Rejection failed'));
      }
    } catch {
      showToast('Connection error. Please try again.');
    } finally {
      setPartnerActionLoading(false);
    }
  };

  // ---- Stats ----
  const today = todayStr();

  const stats = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    let todayCount = 0;
    let nextEvent: ClinicEvent | null = null;
    let nextDays = Infinity;

    for (const ev of events) {
      const diff = daysBetween(ev.date, today);
      if (diff > 0) {
        upcoming++;
        if (diff < nextDays) {
          nextDays = diff;
          nextEvent = ev;
        }
      } else if (diff === 0) {
        todayCount++;
        upcoming++; // today counts as upcoming
        if (!nextEvent) {
          nextEvent = ev;
          nextDays = 0;
        }
      } else {
        past++;
      }
    }

    return { upcoming, past, total: events.length, todayCount, nextEvent, nextDays };
  }, [events, today]);

  // ---- Sorted + filtered events ----
  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const da = daysBetween(a.date, today);
      const db = daysBetween(b.date, today);
      // Upcoming (>=0) first, sorted ascending by date; then past sorted descending
      const aUp = da >= 0;
      const bUp = db >= 0;
      if (aUp && !bUp) return -1;
      if (!aUp && bUp) return 1;
      if (aUp && bUp) return da - db; // sooner first
      return db - da; // more recent past first
    });

    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((e) => e.title.toLowerCase().includes(q));
  }, [events, today, searchQuery]);

  // ---- Event status helper ----
  const getEventStatus = (ev: ClinicEvent): { label: string; color: string; bg: string } => {
    const diff = daysBetween(ev.date, today);
    if (diff === 0) return { label: 'TODAY', color: 'text-blue-700', bg: 'bg-blue-100' };
    if (diff > 0) return { label: 'UPCOMING', color: 'text-emerald-700', bg: 'bg-emerald-100' };
    return { label: 'PAST', color: 'text-gray-500', bg: 'bg-gray-100' };
  };

  /** Today or later. Past events are not worth chasing for an RSVP owner. */
  const eventHasPassedAdmin = (ev: ClinicEvent): boolean => daysBetween(ev.date, today) < 0;

  // ---- Share link ----
  // rsvp=true opens HMC's form on arrival, so it only belongs on an event whose RSVP
  // HMC actually takes. On anyone else's event the app ignores it; the link should
  // not carry the claim either.
  const getShareLink = (ev: ClinicEvent) =>
    SHARE_BASE_URL +
    encodeURIComponent(ev.id) +
    (ev.rsvpMode === 'external' || ev.rsvpMode === 'none' ? '' : '&rsvp=true');

  const handleCopyShareLink = async (ev: ClinicEvent) => {
    const link = getShareLink(ev);
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* both failed */ }
    }
    if (copied) {
      setCopyFeedback(ev.id);
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  // ---- Auth handlers (unchanged logic) ----
  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setPasscodeError(lang === 'es' ? 'Ingresa un codigo' : 'Enter a passcode');
      return;
    }
    setPasscodeLoading(true);
    setPasscodeError('');
    try {
      const hash = await hashPasscode(passcode);
      let data: any;
      try {
        const res = await fetch(`${PORTAL_API_URL}/api/public/admin-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verifyPasscode', hash }),
        });
        if (!res.ok) throw new Error('Portal auth failed');
        data = await res.json();
      } catch {
        data = await postGasJson({ action: 'verifyPasscode', hash });
      }
      if (data.success === true && !('events' in data)) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_HASH, hash);
        setView('main');
      } else if (data.needsSetup) {
        setPasscodeError(lang === 'es' ? 'No hay codigo configurado. Usa "Restablecer Codigo" para crear uno.' : 'No passcode set. Use "Reset Passcode" to create one.');
      } else if (data.success === true && 'events' in data) {
        setPasscodeError(lang === 'es' ? 'Error del servidor. Contacta al administrador.' : 'Server auth not configured. Redeploy the Apps Script.');
      } else {
        setPasscodeError(lang === 'es' ? 'Codigo incorrecto' : 'Incorrect passcode');
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error. Try again.');
    } finally {
      setPasscodeLoading(false);
    }
  };

  const handleRequestReset = async () => {
    setPasscodeLoading(true);
    setResetMessage('');
    setPasscodeError('');
    try {
      const data = await postGasJson({ action: 'requestPasscodeReset' });
      if (data.success) {
        setView('reset-confirm');
        setResetMessage(lang === 'es' ? 'Codigo enviado al correo del admin.' : 'Reset code sent to admin email.');
      } else {
        setPasscodeError(data.error || 'Failed to send reset code');
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error');
    } finally {
      setPasscodeLoading(false);
    }
  };

  const handleResetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !newPasscode.trim()) {
      setPasscodeError(lang === 'es' ? 'Completa todos los campos' : 'Fill in all fields');
      return;
    }
    if (newPasscode.length < 4) {
      setPasscodeError(lang === 'es' ? 'El codigo debe tener al menos 4 caracteres' : 'Passcode must be at least 4 characters');
      return;
    }
    setPasscodeLoading(true);
    setPasscodeError('');
    try {
      const codeHash = await hashPasscode(resetCode);
      const newHash = await hashPasscode(newPasscode);
      const data = await postGasJson({ action: 'resetPasscode', codeHash, newHash });
      if (data.success) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_HASH, newHash);
        setView('main');
        setPasscode('');
        setResetCode('');
        setNewPasscode('');
      } else {
        setPasscodeError(data.error || (lang === 'es' ? 'Codigo invalido' : 'Invalid code'));
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error');
    } finally {
      setPasscodeLoading(false);
    }
  };

  // ---- CRUD handlers (unchanged logic) ----
  const handleCreateNew = () => {
    const newId = `event-${Date.now()}`;
    setFormData({ ...emptyEvent, id: newId, date: getDefaultDate(), createdAt: new Date().toISOString() });
    setEditingEvent(null);
    setEventFormat('in-person');
    setSessions([]);
    setView('edit');
  };

  const handleEditEvent = (event: ClinicEvent) => {
    setFormData({ ...event });
    setEditingEvent(event);
    setEventFormat(
      event.isVirtual === true || (event.isVirtual === undefined && event.locationTBD !== true && !event.address)
        ? 'virtual'
        : event.locationTBD === true
          ? 'in-person-tba'
          : 'in-person',
    );
    setSessions(event.sessions || []);
    setView('edit');
  };

  const handleDuplicateEvent = (event: ClinicEvent) => {
    const newId = `event-${Date.now()}`;
    setFormData({
      ...event,
      id: newId,
      title: event.title + ' (Copy)',
      createdAt: new Date().toISOString(),
    });
    setEditingEvent(null);
    setEventFormat(
      event.isVirtual === true || (event.isVirtual === undefined && event.locationTBD !== true && !event.address)
        ? 'virtual'
        : event.locationTBD === true
          ? 'in-person-tba'
          : 'in-person',
    );
    setSessions(event.sessions ? event.sessions.map((s) => ({ ...s, id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) : []);
    setView('edit');
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm(lang === 'es' ? 'Eliminar este evento?' : 'Delete this event?')) {
      setIsSaving(true);
      setSaveError('');

      try {
        const delRes = await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteEvent', id: eventId, hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '' }),
        });
        const delResult = await delRes.json();
        if (!delResult.success) throw new Error(delResult.error || 'Delete failed');

        const updated = events.filter((e) => e.id !== eventId);
        const safeUpdated = preserveRequiredEvents(updated);
        onEventsUpdate(safeUpdated);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(safeUpdated));
      } catch (error) {
        console.error('Failed to delete event:', error);
        setSaveError(lang === 'es' ? 'Error al eliminar' : 'Failed to delete');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');

    let eventToSave = { ...formData, sessions: sessions.length > 0 ? sessions : undefined };
    if (eventToSave.date && !eventToSave.dateDisplay) {
      // Parse date parts manually to avoid timezone shift (UTC vs local)
      const [year, month, day] = eventToSave.date.split('-').map(Number);
      const d = new Date(year, month - 1, day); // month is 0-indexed
      eventToSave.dateDisplay = d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    if (!eventToSave.location && eventToSave.city) {
      eventToSave.location = eventToSave.city;
    }

    // Required rather than defaulted. Every event on this listing now states who owns
    // its RSVP; leaving it unanswered is what used to quietly route another
    // organization's attendees into HMC's own registration sheet.
    if (!['hmc', 'hmc-for-partner', 'external', 'none'].includes(String(eventToSave.rsvpMode || ''))) {
      setSaveError(lang === 'es'
        ? 'Elige quien recibe los registros de este evento.'
        : 'Choose who receives RSVPs for this event.');
      setIsSaving(false);
      return;
    }
    if (eventToSave.rsvpMode === 'hmc-for-partner' && !(eventToSave.hostOrg || '').trim()) {
      setSaveError(lang === 'es'
        ? 'Nombra la organizacion para la que recoges los registros.'
        : 'Name the organization you are collecting RSVPs for.');
      setIsSaving(false);
      return;
    }
    if (eventToSave.rsvpMode === 'external' && !(eventToSave.websiteUrl || '').trim() && !(eventToSave.rsvpContact || '').trim()) {
      setSaveError(lang === 'es'
        ? 'Agrega el enlace o el contacto de registro de la organizacion.'
        : "Add the organization's registration link or contact.");
      setIsSaving(false);
      return;
    }

    try {
      await saveEventToBackend(eventToSave);
    } catch (error) {
      console.error('Backend save failed:', error);
      setSaveError(lang === 'es' ? 'Error al guardar' : `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSaving(false);
      return;
    }

    let updated: ClinicEvent[];
    if (editingEvent) {
      updated = events.map((e) => (e.id === editingEvent.id ? eventToSave : e));
    } else {
      updated = [...events, eventToSave];
    }

    const safeUpdated = preserveRequiredEvents(updated);
    onEventsUpdate(safeUpdated);
    localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(safeUpdated));
    setView('main');
    setIsSaving(false);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(events, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveEventToBackend = async (event: ClinicEvent) => {
    const res = await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveEvent', event, hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '' }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Save failed');
    // Bust server-side GAS cache so Event Finder shows updates immediately
    fetch(`${PORTAL_API_URL}/api/public/bust-events-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '' }),
    }).catch(() => {});
  };

  const handleImportJSON = async () => {
    try {
      const imported = JSON.parse(importText);
      if (Array.isArray(imported)) {
        setIsSaving(true);

        try {
          for (const event of imported) {
            await saveEventToBackend(event);
          }
        } catch (e) {
          console.warn('Failed to sync to backend:', e);
        }

        const safeImported = preserveRequiredEvents(imported);
        onEventsUpdate(safeImported);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(safeImported));
        setShowImport(false);
        setImportText('');
        setIsSaving(false);
        alert(lang === 'es' ? 'Eventos importados con exito!' : 'Events imported successfully!');
      } else {
        alert(lang === 'es' ? 'Formato JSON invalido' : 'Invalid JSON format');
      }
    } catch (err) {
      setIsSaving(false);
      alert(lang === 'es' ? 'Error al parsear JSON' : 'Error parsing JSON');
    }
  };

  const handleSyncToCloud = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      for (const event of events) {
        await saveEventToBackend(event);
      }
      alert(lang === 'es' ? 'Sincronizado!' : 'Synced to cloud!');
    } catch (e) {
      setSaveError(lang === 'es' ? 'Error al sincronizar' : 'Sync failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshFromCloud = async () => {
    setIsRefreshing(true);
    setSaveError('');
    try {
      // Bust cache first so portal returns fresh data
      await fetch(`${PORTAL_API_URL}/api/public/bust-events-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: sessionStorage.getItem(STORAGE_KEYS.ADMIN_HASH) || '' }),
      }).catch(() => {});

      // Prefer portal API (already deduplicates); fall back to GAS
      let raw: ClinicEvent[] | null = null;
      try {
        const portalRes = await fetch(`${PORTAL_API_URL}/api/public/events`);
        if (portalRes.ok) {
          const arr = await portalRes.json();
          if (Array.isArray(arr) && arr.length > 0) raw = arr;
        }
      } catch { /* fall through */ }

      if (!raw) {
        const gasRes = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getEvents`);
        const data = await gasRes.json();
        if (data.events && Array.isArray(data.events)) raw = data.events;
      }

      if (!raw) throw new Error('Invalid response');

      // Deduplicate by title + date (same logic as App.tsx sanitizeEvents)
      const seen = new Map<string, ClinicEvent>();
      for (const e of raw) {
        const key = `${String(e.title || '').trim().toLowerCase()}|${String(e.date || '').split('T')[0]}`;
        if (!seen.has(key)) seen.set(key, e);
      }
      const deduped = preserveRequiredEvents(Array.from(seen.values()));

      onEventsUpdate(deduped);
      localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(deduped));
    } catch {
      setSaveError(lang === 'es' ? 'Error al actualizar' : 'Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_HASH);
    setView('passcode');
    setPasscode('');
  };

  // ---- Input class shorthand ----
  const inputCls =
    'w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2';

  // ---- Render ----
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'EventOps - Panel de Operaciones' : 'EventOps Dashboard'}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl border border-gray-200 shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="bg-[#fafbff] border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Back arrow when in edit, partner-requests, or ads view */}
            {(view === 'edit' || view === 'partner-requests' || view === 'ads') && (
              <button
                onClick={() => {
                  setView('main');
                  setApprovingId(null);
                  setRejectingId(null);
                  setApproveFormData({});
                  setRejectReason('');
                  setAdFormVisible(false);
                  setAdForm(emptyAdForm());
                  setAdLinkMode('event');
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#233dff] hover:bg-blue-50 transition-all"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#233dff] tracking-tight">EventOps</span>
                {view === 'main' && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#233dff] text-white px-2 py-0.5 rounded-full">
                    {lang === 'es' ? 'en vivo' : 'live'}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 font-medium">
                {view === 'passcode' || view === 'reset-request' || view === 'reset-confirm'
                  ? lang === 'es'
                    ? view === 'reset-confirm' ? 'Restablecer Codigo' : 'Autenticacion'
                    : view === 'reset-confirm' ? 'Reset Passcode' : 'Authentication'
                  : view === 'edit'
                  ? editingEvent
                    ? lang === 'es' ? 'Editar Evento' : 'Edit Event'
                    : lang === 'es' ? 'Nuevo Evento' : 'New Event'
                  : view === 'partner-requests'
                  ? lang === 'es' ? 'Solicitudes de Socios' : 'Partner Requests'
                  : view === 'ads'
                  ? 'Ad Banners'
                  : lang === 'es'
                  ? 'Panel de Operaciones de Eventos'
                  : 'Event Operations Dashboard'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ===== BODY ===== */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Status Messages */}
          {isSaving && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm font-semibold text-blue-700">
                {lang === 'es' ? 'Guardando...' : 'Saving...'}
              </span>
            </div>
          )}
          {saveError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-yellow-800">{saveError}</span>
              <button onClick={() => setSaveError('')} className="text-yellow-600 hover:text-yellow-800 text-xs font-bold">
                {lang === 'es' ? 'Cerrar' : 'Dismiss'}
              </button>
            </div>
          )}

          {/* ===== PASSCODE VIEW ===== */}
          {view === 'passcode' && (
            <div className="max-w-sm mx-auto py-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#233dff]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#233dff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {lang === 'es' ? 'Acceso a EventOps' : 'EventOps Access'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {lang === 'es' ? 'Ingresa tu codigo para continuar' : 'Enter your passcode to continue'}
                </p>
              </div>
              <form onSubmit={handlePasscodeSubmit} className="space-y-5">
                <div>
                  <label className={labelCls}>
                    {lang === 'es' ? 'Codigo de Acceso' : 'Passcode'}
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className={inputCls}
                    placeholder={lang === 'es' ? 'Ingresa el codigo' : 'Enter passcode'}
                    autoFocus
                    required
                    minLength={4}
                    disabled={passcodeLoading}
                  />
                  {passcodeError && (
                    <p className="text-red-500 text-sm font-semibold mt-2">{passcodeError}</p>
                  )}
                </div>
                <Button type="submit" className="w-full justify-center h-12" disabled={passcodeLoading || !passcode.trim()}>
                  {passcodeLoading
                    ? lang === 'es' ? 'Verificando...' : 'Verifying...'
                    : lang === 'es' ? 'Ingresar' : 'Enter'}
                </Button>
                <button
                  type="button"
                  onClick={handleRequestReset}
                  disabled={passcodeLoading}
                  className="w-full text-center text-sm font-semibold text-[#233dff] hover:underline disabled:opacity-50"
                >
                  {passcodeLoading
                    ? lang === 'es' ? 'Enviando...' : 'Sending...'
                    : lang === 'es' ? 'Restablecer Codigo' : 'Reset Passcode'}
                </button>
              </form>
            </div>
          )}

          {/* ===== RESET CONFIRM VIEW ===== */}
          {view === 'reset-confirm' && (
            <div className="max-w-sm mx-auto py-8">
              <form onSubmit={handleResetPasscode} className="space-y-6">
                {resetMessage && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-blue-700">{resetMessage}</p>
                  </div>
                )}
                <div>
                  <label className={labelCls}>
                    {lang === 'es' ? 'Codigo de Verificacion' : 'Verification Code'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-2xl font-bold tracking-[0.3em] text-center focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    disabled={passcodeLoading}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    {lang === 'es' ? 'Nuevo Codigo de Acceso' : 'New Passcode'}
                  </label>
                  <input
                    type="password"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    className={inputCls}
                    placeholder={lang === 'es' ? 'Minimo 4 caracteres' : 'Minimum 4 characters'}
                    disabled={passcodeLoading}
                  />
                </div>
                {passcodeError && (
                  <p className="text-red-500 text-sm font-semibold">{passcodeError}</p>
                )}
                <Button type="submit" className="w-full justify-center h-12" disabled={passcodeLoading}>
                  {passcodeLoading
                    ? lang === 'es' ? 'Guardando...' : 'Saving...'
                    : lang === 'es' ? 'Establecer Codigo' : 'Set Passcode'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setView('passcode'); setPasscodeError(''); setResetMessage(''); }}
                  className="w-full text-center text-sm font-semibold text-gray-400 hover:text-gray-600"
                >
                  {lang === 'es' ? 'Volver' : 'Back to Login'}
                </button>
              </form>
            </div>
          )}

          {/* ===== MAIN DASHBOARD VIEW ===== */}
          {view === 'main' && (
            <div className="space-y-5">
              {/* ---- Stats Row ---- */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Upcoming */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-[#233dff] tabular-nums">{stats.upcoming}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mt-0.5">
                    {lang === 'es' ? 'Próximos' : 'Upcoming'}
                  </div>
                </div>
                {/* Past */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-gray-400 tabular-nums">{stats.past}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
                    {lang === 'es' ? 'Pasados' : 'Past'}
                  </div>
                </div>
                {/* Total */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-white tabular-nums">{stats.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
                    {lang === 'es' ? 'Total' : 'Total'}
                  </div>
                </div>
                {/* Next Event */}
                <div
                  className={`border rounded-xl p-3 text-center transition-all duration-300 ${
                    stats.nextDays === 0
                      ? 'bg-green-50 border-green-200'
                      : stats.nextDays <= 7
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-emerald-50 border-emerald-100'
                  }`}
                >
                  {stats.nextEvent ? (
                    <>
                      <div
                        className={`text-sm font-bold truncate ${
                          stats.nextDays === 0
                            ? 'text-green-700'
                            : stats.nextDays <= 7
                            ? 'text-orange-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {stats.nextDays === 0
                          ? lang === 'es' ? 'Hoy!' : 'Today!'
                          : `${lang === 'es' ? 'en' : 'in'} ${stats.nextDays}d`}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5 truncate" title={stats.nextEvent.title}>
                        {stats.nextEvent.title.length > 18
                          ? stats.nextEvent.title.slice(0, 18) + '...'
                          : stats.nextEvent.title}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-gray-300">--</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mt-0.5">
                        {lang === 'es' ? 'Sin eventos' : 'No events'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ---- Action Bar ---- */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Primary: Create Event */}
                <Button onClick={handleCreateNew} className="h-10" disabled={isSaving}>
                  <svg className="w-4 h-4 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {lang === 'es' ? 'Crear Evento' : 'Create Event'}
                </Button>

                {/* Refresh from Cloud */}
                <button
                  onClick={handleRefreshFromCloud}
                  disabled={isRefreshing}
                  className="h-10 px-4 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isRefreshing
                    ? lang === 'es' ? 'Actualizando...' : 'Refreshing...'
                    : lang === 'es' ? 'Actualizar' : 'Refresh'}
                </button>

                {/* Partner Requests button */}
                <button
                  onClick={() => {
                    setView('partner-requests');
                    setApprovingId(null);
                    setRejectingId(null);
                    fetchPartnerRequests();
                  }}
                  className="relative h-10 px-4 rounded-full text-sm font-semibold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 transition-all inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {lang === 'es' ? 'Socios' : 'Partner Requests'}
                  {partnerRequestCount !== null && partnerRequestCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {partnerRequestCount > 9 ? '9+' : partnerRequestCount}
                    </span>
                  )}
                </button>

                {/* Ads management button */}
                <button
                  onClick={() => {
                    setView('ads');
                    setAdFormVisible(false);
                    setAdForm(emptyAdForm());
                    setAdLinkMode('event');
                  }}
                  className="h-10 px-4 rounded-full text-sm font-semibold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition-all inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Ads
                </button>

                {/* Utility dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowUtilityMenu(!showUtilityMenu)}
                    className="h-10 w-10 rounded-full border border-gray-200 text-gray-500 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all flex items-center justify-center"
                    aria-label="More actions"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                  {showUtilityMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowUtilityMenu(false)} />
                      <div className="absolute right-0 top-12 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
                        <button
                          onClick={() => { handleExportJSON(); setShowUtilityMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {lang === 'es' ? 'Exportar JSON' : 'Export JSON'}
                        </button>
                        <button
                          onClick={() => { setShowImport(!showImport); setShowUtilityMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {lang === 'es' ? 'Importar JSON' : 'Import JSON'}
                        </button>
                        <button
                          onClick={() => { handleSyncToCloud(); setShowUtilityMenu(false); }}
                          disabled={isSaving}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {lang === 'es' ? 'Sincronizar' : 'Sync to Cloud'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Logout - far right */}
                <button
                  onClick={handleLogout}
                  className="ml-auto h-10 px-4 rounded-full text-sm font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {lang === 'es' ? 'Salir' : 'Logout'}
                </button>
              </div>

              {/* ---- Import Section ---- */}
              {showImport && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                  <label className={labelCls}>
                    {lang === 'es' ? 'Pegar JSON de eventos' : 'Paste Events JSON'}
                  </label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-sm font-mono focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    placeholder='[{"id": "...", "title": "...", ...}]'
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleImportJSON} className="h-10" disabled={isSaving}>
                      {isSaving ? '...' : lang === 'es' ? 'Importar' : 'Import'}
                    </Button>
                    <button
                      onClick={() => { setShowImport(false); setImportText(''); }}
                      className="h-10 px-4 text-sm font-semibold text-gray-400 hover:text-gray-600"
                    >
                      {lang === 'es' ? 'Cancelar' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* ---- Search / Filter ---- */}
              <div className="relative">
                <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'es' ? 'Buscar eventos por título...' : 'Search events by title...'}
                  className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-2.5 rounded-xl text-sm font-medium focus:border-[#233dff] focus:bg-white outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* ---- Event Count ---- */}
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                {searchQuery
                  ? `${sortedEvents.length} ${lang === 'es' ? 'resultados' : 'results'}`
                  : `${events.length} ${lang === 'es' ? 'Eventos' : 'Events'}`}
              </div>

              {/* ---- RSVP ownership backlog ---- */}
              {events.filter((e) => rsvpModeUnset(e) && !eventHasPassedAdmin(e)).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-red-700">
                    {events.filter((e) => rsvpModeUnset(e) && !eventHasPassedAdmin(e)).length}{' '}
                    {events.filter((e) => rsvpModeUnset(e) && !eventHasPassedAdmin(e)).length === 1
                      ? (lang === 'es'
                          ? 'evento proximo sin responsable de registro'
                          : 'upcoming event has no RSVP owner set')
                      : (lang === 'es'
                          ? 'eventos proximos sin responsable de registro'
                          : 'upcoming events have no RSVP owner set')}
                  </p>
                  <p className="text-[11px] text-red-600 mt-1 leading-relaxed">
                    {lang === 'es'
                      ? 'Hasta que se definan, los eventos sin enlace recogen registros en la hoja de HMC. Editalos y elige quien recibe los registros.'
                      : 'Until they are set, an event with no link collects RSVPs into the HMC sheet. Open each one and choose who receives RSVPs.'}
                  </p>
                  <p className="text-[11px] text-red-700 font-semibold mt-1.5 leading-relaxed">
                    {events
                      .filter((e) => rsvpModeUnset(e) && !eventHasPassedAdmin(e))
                      .slice(0, 8)
                      .map((e) => e.title)
                      .join(' - ')}
                  </p>
                </div>
              )}

              {/* ---- Events List ---- */}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {isRefreshing && sortedEvents.length === 0 && (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                )}
                {sortedEvents.map((event) => {
                  const status = getEventStatus(event);
                  const progColor = PROGRAM_COLORS[event.program] || '#6b7280';

                  return (
                    <div
                      key={event.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#233dff]/40 hover:shadow-sm transition-all group"
                    >
                      {/* Top row: title + badges */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1a1a1a] truncate text-[15px] leading-tight">
                            {event.title}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {event.dateDisplay || event.date} {event.time ? `- ${event.time}` : ''} {event.city ? `- ${event.city}` : ''}
                          </div>
                        </div>
                        {/* Status badges */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {/* Time status */}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                          {/* Nobody has said who owns this event's RSVP yet. */}
                          {rsvpModeUnset(event) && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700"
                              title={event.websiteUrl
                                ? 'Falls back to sending people to the external link'
                                : 'Falls back to collecting the RSVP into the HMC sheet'}
                            >
                              {lang === 'es' ? 'SIN REGISTRO' : 'RSVP UNSET'}
                            </span>
                          )}
                          {/* Draft */}
                          {event.saveTheDate && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-yellow-100 text-yellow-700">
                              DRAFT
                            </span>
                          )}
                          {/* Promoted */}
                          {event.isPromoted && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700">
                              PROMOTED
                            </span>
                          )}
                          {/* Program pill */}
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ backgroundColor: progColor }}
                          >
                            {event.program.length > 20 ? event.program.slice(0, 20) + '...' : event.program}
                          </span>
                        </div>
                      </div>

                      {/* Quick actions row */}
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#233dff]/30 text-[#233dff] hover:bg-[#233dff] hover:text-white transition-all"
                        >
                          {lang === 'es' ? 'Editar' : 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDuplicateEvent(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-[#233dff]/30 hover:text-[#233dff] hover:bg-blue-50 transition-all"
                        >
                          {lang === 'es' ? 'Duplicar' : 'Duplicate'}
                        </button>
                        <button
                          onClick={() => handleCopyShareLink(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                        >
                          {copyFeedback === event.id
                            ? lang === 'es' ? 'Copiado!' : 'Copied!'
                            : lang === 'es' ? 'Copiar Link' : 'Copy Link'}
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all ml-auto"
                        >
                          {lang === 'es' ? 'Eliminar' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {sortedEvents.length === 0 && !isRefreshing && (
                  <div className="text-center py-12 text-gray-300">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium">
                      {searchQuery
                        ? lang === 'es' ? 'No se encontraron eventos' : 'No events found'
                        : lang === 'es' ? 'Sin eventos todavia' : 'No events yet'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== EDIT VIEW ===== */}
          {view === 'edit' && (
            <form onSubmit={handleSaveEvent} className="space-y-4">
              {/* Live preview card */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  {lang === 'es' ? 'Vista previa' : 'Preview'}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    {formData.flyerUrl && (
                      <img src={formData.flyerUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1a1a1a] truncate">
                        {formData.title || (lang === 'es' ? 'Título del evento' : 'Event title')}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formData.dateDisplay || formData.date || '--'} {formData.time ? `| ${formData.time}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formData.city || formData.address || (lang === 'es' ? 'Ubicación' : 'Location')}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {formData.program && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: PROGRAM_COLORS[formData.program] || '#6b7280' }}
                          >
                            {formData.program}
                          </span>
                        )}
                        {formData.saveTheDate && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">
                            DRAFT
                          </span>
                        )}
                        {formData.isPromoted && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                            PROMOTED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {formData.description && (
                    <p className="text-xs text-gray-500 mt-3 line-clamp-2">{formData.description}</p>
                  )}
                </div>
              </div>

              {/* Section: Basic Info */}
              <FormSection title={lang === 'es' ? 'Información Básica' : 'Basic Info'}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      {lang === 'es' ? 'Título' : 'Title'} *
                    </label>
                    <input
                      name="title"
                      value={formData.title}
                      onChange={handleFormChange}
                      required
                      className={inputCls}
                    />
                  </div>

                  {/* Title (Spanish) */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      Titulo en Espanol (optional)
                    </label>
                    <input
                      name="title_es"
                      value={formData.title_es || ''}
                      onChange={handleFormChange}
                      placeholder={lang === 'es' ? 'Título traducido' : 'Spanish title for ES toggle'}
                      className={inputCls}
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Fecha' : 'Date'} *
                    </label>
                    <input
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleFormChange}
                      required
                      className={inputCls}
                    />
                  </div>

                  {/* End date. Blank for a single-day event. A multi-day training used
                      to be stored as one date, so it disappeared from the listing on the
                      morning of day two and its schema said it had already finished. */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Fecha de fin' : 'End Date'}{' '}
                      <span className="text-gray-300">
                        {lang === 'es' ? '(solo eventos de varios dias)' : '(multi-day events only)'}
                      </span>
                    </label>
                    <input
                      name="endDate"
                      type="date"
                      min={formData.date || undefined}
                      value={formData.endDate || ''}
                      onChange={handleFormChange}
                      className={inputCls}
                    />
                    {formData.endDate && formData.date && formData.endDate < formData.date && (
                      <p className="text-xs mt-1.5 text-red-600">
                        {lang === 'es' ? 'La fecha de fin es anterior al inicio.' : 'End date is before the start date.'}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Hora' : 'Time'} *
                    </label>
                    <input
                      name="time"
                      value={formData.time}
                      onChange={handleFormChange}
                      required
                      placeholder="e.g., 10:00 AM - 12:00 PM"
                      className={inputCls}
                    />
                  </div>

                  {/* Date Display */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      {lang === 'es' ? 'Fecha Mostrada' : 'Date Display'}{' '}
                      <span className="text-gray-300">(auto-generated if empty)</span>
                    </label>
                    <input
                      name="dateDisplay"
                      value={formData.dateDisplay}
                      onChange={handleFormChange}
                      placeholder="e.g., Saturday, January 10, 2026"
                      className={inputCls}
                    />
                  </div>

                  {/* Program */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Programa' : 'Program'} *
                    </label>
                    <select
                      name="program"
                      value={formData.program}
                      onChange={handleFormChange}
                      required
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      {PROGRAM_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Event Format */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Formato' : 'Format'} *
                    </label>
                    <select
                      value={eventFormat}
                      onChange={(e) => {
                        const fmt = e.target.value as 'in-person' | 'in-person-tba' | 'virtual';
                        setEventFormat(fmt);
                        // Stored on the event, not inferred later from whether an address
                        // happens to be present. Inference is what made this setting revert.
                        setFormData((prev) => ({
                          ...prev,
                          isVirtual: fmt === 'virtual',
                          locationTBD: fmt === 'in-person-tba',
                        }));
                        if (fmt === 'in-person-tba') {
                          // Keep the city so the event still filters by area, but drop the
                          // placeholder address and the coordinates, which is what put a
                          // pin on the map for a venue nobody has chosen yet.
                          setFormData((prev) => ({ ...prev, address: '', lat: 0, lng: 0 }));
                        }
                        if (fmt === 'virtual') {
                          // location isn't directly editable, it's derived from city on save
                          // (see handleSaveEvent) and was carrying over the old in-person value
                          // since that fallback only fires when location is still empty.
                          setFormData((prev) => ({ ...prev, address: '', city: '', location: '', lat: 0, lng: 0 }));
                        }
                      }}
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      <option value="in-person">{lang === 'es' ? 'En Persona' : 'In-Person'}</option>
                      <option value="in-person-tba">
                        {lang === 'es' ? 'En Persona - lugar por anunciar' : 'In-Person - location TBA'}
                      </option>
                      <option value="virtual">{lang === 'es' ? 'Virtual' : 'Virtual'}</option>
                    </select>
                  </div>
                </div>
              </FormSection>

              {/* Section: Location */}
              {(eventFormat === 'in-person' || eventFormat === 'in-person-tba') && (
                <FormSection title={lang === 'es' ? 'Ubicación' : 'Location'}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* City */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Ciudad' : 'City'} *
                      </label>
                      <input
                        name="city"
                        value={formData.city}
                        onChange={handleFormChange}
                        required
                        className={inputCls}
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Dirección' : 'Address'} *
                      </label>
                      <input
                        name="address"
                        value={formData.address}
                        onChange={handleFormChange}
                        required={eventFormat === 'in-person'}
                        disabled={eventFormat === 'in-person-tba'}
                        className={inputCls}
                      />
                    </div>

                    {/* Latitude */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Latitud' : 'Latitude'} *
                      </label>
                      <input
                        name="lat"
                        type="number"
                        step="any"
                        value={formData.lat}
                        onChange={handleFormChange}
                        required={eventFormat === 'in-person'}
                        disabled={eventFormat === 'in-person-tba'}
                        className={inputCls}
                      />
                    </div>

                    {/* Longitude */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Longitud' : 'Longitude'} *
                      </label>
                      <input
                        name="lng"
                        type="number"
                        step="any"
                        value={formData.lng}
                        onChange={handleFormChange}
                        required={eventFormat === 'in-person'}
                        disabled={eventFormat === 'in-person-tba'}
                        className={inputCls}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={lookUpCoordinates}
                        disabled={geoStatus === 'looking'}
                        className="px-4 py-2 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:border-[#233dff] hover:text-[#233dff] disabled:opacity-50"
                      >
                        {geoStatus === 'looking'
                          ? (lang === 'es' ? 'Buscando...' : 'Looking up...')
                          : (lang === 'es' ? 'Buscar coordenadas desde la direccion' : 'Find coordinates from address')}
                      </button>
                      {(!formData.lat || !formData.lng) && geoStatus !== 'ok' && (
                        <p className="text-xs mt-1.5 text-amber-700">
                          {lang === 'es'
                            ? 'Sin coordenadas este evento no aparecera en el mapa.'
                            : 'Without coordinates this event will not appear on the map.'}
                        </p>
                      )}
                      {geoStatus === 'ok' && (
                        <p className="text-xs mt-1.5 text-green-700">
                          {lang === 'es' ? 'Coordenadas encontradas.' : 'Coordinates found. Check the pin looks right.'}
                        </p>
                      )}
                      {geoStatus === 'none' && (
                        <p className="text-xs mt-1.5 text-amber-700">
                          {lang === 'es' ? 'No se encontro esa direccion. Revisala o escribe las coordenadas.' : 'That address was not found. Check it, or enter coordinates by hand.'}
                        </p>
                      )}
                      {geoStatus === 'error' && (
                        <p className="text-xs mt-1.5 text-red-600">
                          {lang === 'es' ? 'La busqueda fallo. Escribe las coordenadas.' : 'Lookup failed. Enter coordinates by hand.'}
                        </p>
                      )}
                    </div>
                  </div>
                </FormSection>
              )}

              {/* Section: Details */}
              <FormSection title={lang === 'es' ? 'Detalles' : 'Details'}>
                <div className="space-y-4">
                  {/* Description */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Descripción' : 'Description'} *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      required
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  {/* Description (Spanish) */}
                  <div>
                    <label className={labelCls}>
                      Descripcion en Espanol (optional)
                    </label>
                    <textarea
                      name="description_es"
                      value={formData.description_es || ''}
                      onChange={handleFormChange}
                      rows={3}
                      placeholder={lang === 'es' ? 'Descripción traducida' : 'Spanish description for ES toggle'}
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              </FormSection>

              {/* Section: Media */}
              <FormSection title={lang === 'es' ? 'Medios' : 'Media'} defaultOpen={!!(formData.flyerUrl || formData.websiteUrl)}>
                <div className="space-y-4">
                  {/* Flyer Upload or URL */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Flyer del Evento' : 'Event Flyer'}{' '}
                      <span className="text-gray-300">(optional)</span>
                    </label>

                    <div className="flex items-center gap-3 mb-3">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-normal text-sm leading-[1.2] border border-gray-200 bg-white text-gray-600 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {lang === 'es' ? 'Subir Flyer' : 'Upload Flyer'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const img = new Image();
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              img.onload = async () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 800;
                                const MAX_HEIGHT = 1000;
                                let width = img.width;
                                let height = img.height;
                                if (width > MAX_WIDTH) { height = (height * MAX_WIDTH) / width; width = MAX_WIDTH; }
                                if (height > MAX_HEIGHT) { width = (width * MAX_HEIGHT) / height; height = MAX_HEIGHT; }
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx?.drawImage(img, 0, 0, width, height);
                                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                                // Upload to the portal to get back a permanent URL instead of storing base64 in the sheet
                                try {
                                  const res = await fetch(`${PORTAL_API_URL}/api/public/upload-flyer`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ eventId: formData.id || `flyer-${Date.now()}`, imageData: base64, mimeType: 'image/jpeg' }),
                                  });
                                  const data = await res.json();
                                  if (data.success && data.url) {
                                    setFormData((prev) => ({ ...prev, flyerUrl: data.url }));
                                  } else {
                                    // Fallback: store base64 directly if upload fails
                                    setFormData((prev) => ({ ...prev, flyerUrl: base64 }));
                                  }
                                } catch {
                                  setFormData((prev) => ({ ...prev, flyerUrl: base64 }));
                                }
                              };
                              img.src = ev.target?.result as string;
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {formData.flyerUrl && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, flyerUrl: '' }))}
                          className="text-red-500 text-xs font-semibold hover:underline"
                        >
                          {lang === 'es' ? 'Eliminar' : 'Remove'}
                        </button>
                      )}
                    </div>

                    {/* Flyer URL paste option */}
                    <input
                      type="url"
                      value={formData.flyerUrl?.startsWith('data:') ? '' : (formData.flyerUrl || '')}
                      onChange={(e) => setFormData((prev) => ({ ...prev, flyerUrl: e.target.value }))}
                      placeholder={lang === 'es' ? 'O sube a Google Drive/Canva y pega el enlace...' : 'Or upload to Google Drive, Canva, or Webflow and paste the public link...'}
                      className={inputCls}
                    />

                    {formData.flyerUrl && (
                      <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-50 mt-3">
                        <img
                          src={formData.flyerUrl}
                          alt="Flyer preview"
                          className="w-full max-h-64 object-contain"
                        />
                      </div>
                    )}
                  </div>

                </div>
              </FormSection>

              {/* Section: Registration. Replaces the old lone "external registration
                  link" field, where a blank meant HMC collects the RSVP. That default
                  was wrong for a listing carrying other organizations' events, and it
                  could not express an open invite at all. */}
              <FormSection
                title={lang === 'es' ? 'Registro' : 'Registration'}
                defaultOpen={!formData.rsvpMode || formData.rsvpMode !== 'hmc'}
              >
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Quien recibe los registros' : 'Who receives RSVPs'} *
                    </label>
                    <select
                      value={formData.rsvpMode || ''}
                      onChange={(e) => {
                        const mode = e.target.value as ClinicEvent['rsvpMode'];
                        setFormData((prev) => ({
                          ...prev,
                          rsvpMode: mode,
                          // Dropped rather than carried invisibly: a stale link on an
                          // event switched to HMC RSVP would still have won the button.
                          ...(mode === 'hmc' || mode === 'hmc-for-partner' || mode === 'none'
                            ? { rsvpContact: '' }
                            : {}),
                        }));
                      }}
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      <option value="" disabled>
                        {lang === 'es' ? '- Elegir -' : '- Choose -'}
                      </option>
                      <option value="hmc">
                        {lang === 'es' ? 'HMC recoge el registro' : 'HMC collects the RSVP'}
                      </option>
                      <option value="hmc-for-partner">
                        {lang === 'es'
                          ? 'HMC recoge en nombre de la organizacion'
                          : "HMC collects on the org's behalf"}
                      </option>
                      <option value="external">
                        {lang === 'es'
                          ? 'Registrarse con la organizacion'
                          : 'RSVP with the org'}
                      </option>
                      <option value="none">
                        {lang === 'es'
                          ? 'No se necesita registro - invitacion abierta'
                          : 'No RSVP needed - open invite'}
                      </option>
                    </select>
                    <p className="text-xs mt-1.5 text-gray-400 leading-relaxed">
                      {formData.rsvpMode === 'hmc'
                        ? (lang === 'es'
                            ? 'El formulario de HMC. Los registros llegan a la hoja de HMC y enviamos el correo de confirmacion.'
                            : "HMC's own form. Registrations land in the HMC sheet and we send the confirmation email.")
                        : formData.rsvpMode === 'hmc-for-partner'
                        ? (lang === 'es'
                            ? 'El formulario de HMC, pero el evento es de otra organizacion. Se lo decimos a la persona y el registro queda marcado como suyo.'
                            : "HMC's own form, but the event belongs to another organization. We say so on the form and the registration is recorded as theirs.")
                        : formData.rsvpMode === 'external'
                        ? (lang === 'es'
                            ? 'HMC no recibe nada. Enviamos a la persona al enlace o al contacto de la organizacion.'
                            : "HMC receives nothing. We send the person to the organization's link or contact.")
                        : formData.rsvpMode === 'none'
                        ? (lang === 'es'
                            ? 'Sin formulario y sin enlace. La pagina dice que la invitacion es abierta.'
                            : 'No form and no link. The page says the invite is open.')
                        : (lang === 'es'
                            ? 'Obligatorio. Nada se recoge por defecto.'
                            : 'Required. Nothing is collected by default.')}
                    </p>
                  </div>

                  {formData.rsvpMode !== 'hmc' && (
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Organizado por' : 'Hosted by'}
                        {formData.rsvpMode === 'hmc-for-partner' ? ' *' : ' '}
                        {formData.rsvpMode !== 'hmc-for-partner' && (
                          <span className="text-gray-300">(optional)</span>
                        )}
                      </label>
                      <input
                        name="hostOrg"
                        value={formData.hostOrg || ''}
                        onChange={handleFormChange}
                        placeholder={lang === 'es' ? 'ej. LASPN' : 'e.g. LASPN'}
                        className={inputCls}
                      />
                      <p className="text-xs mt-1.5 text-gray-400 leading-relaxed">
                        {lang === 'es'
                          ? 'Se muestra en la tarjeta y en el boton ("Registrarse con LASPN"), y nombra al organizador en los datos estructurados del evento.'
                          : 'Shown on the card and on the button ("RSVP with LASPN"), and names the organizer in the event\u2019s structured data.'}
                      </p>
                    </div>
                  )}

                  {formData.rsvpMode === 'external' && (
                    <>
                      <div>
                        <label className={labelCls}>
                          {lang === 'es' ? 'Enlace de registro de la organizacion' : "Organization's registration link"}
                        </label>
                        <input
                          name="websiteUrl"
                          value={formData.websiteUrl || ''}
                          onChange={handleFormChange}
                          placeholder="https://eventbrite.com/..."
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>
                          {lang === 'es' ? 'O contacto de registro' : 'Or registration contact'}
                        </label>
                        <textarea
                          name="rsvpContact"
                          value={formData.rsvpContact || ''}
                          onChange={handleFormChange}
                          rows={2}
                          placeholder={lang === 'es' ? 'ej. Angelise Williams, (310) 714-3684' : 'e.g. Angelise Williams, (310) 714-3684'}
                          className={inputCls}
                        />
                        <p className="text-xs mt-1.5 text-gray-400 leading-relaxed">
                          {lang === 'es'
                            ? 'Para una organizacion que toma registros por telefono o correo en vez de una pagina. Se necesita el enlace o el contacto.'
                            : 'For an organization that takes RSVPs by phone or email rather than a page. One of link or contact is required.'}
                        </p>
                      </div>
                    </>
                  )}

                  {/* An informational link is still worth carrying for an event nobody
                      registers for, so this stays available outside `external`. */}
                  {(formData.rsvpMode === 'hmc' || formData.rsvpMode === 'hmc-for-partner' || formData.rsvpMode === 'none') && (
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Enlace de mas informacion' : 'More info link'}{' '}
                        <span className="text-gray-300">(optional)</span>
                      </label>
                      <input
                        name="websiteUrl"
                        value={formData.websiteUrl || ''}
                        onChange={handleFormChange}
                        placeholder="https://..."
                        className={inputCls}
                      />
                      <p className="text-xs mt-1.5 text-gray-400 leading-relaxed">
                        {lang === 'es'
                          ? 'Aparece como "Mas Informacion". Ya no cambia quien recibe los registros.'
                          : 'Appears as "More Info". It no longer changes who receives RSVPs.'}
                      </p>
                    </div>
                  )}
                </div>
              </FormSection>

              {/* Section: Settings / Tags */}
              <FormSection title={lang === 'es' ? 'Configuracion' : 'Settings'} defaultOpen={!!(formData.saveTheDate || formData.isPromoted || formData.isSponsored)}>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="saveTheDate"
                      type="checkbox"
                      checked={formData.saveTheDate || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Proximamente (detalles por confirmar)' : 'Coming Soon (details TBD)'}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="isPromoted"
                      type="checkbox"
                      checked={formData.isPromoted || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Promocionado (mostrar al inicio)' : 'Promoted (show at top)'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {lang === 'es' ? '+ etiqueta "Recien Agregado"' : '+ "Just Added" tag'}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="isSponsored"
                      type="checkbox"
                      checked={formData.isSponsored || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Patrocinado' : 'Sponsored'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {lang === 'es' ? '+ etiqueta de patrocinio' : '+ sponsor badge'}
                    </span>
                  </label>
                </div>
              </FormSection>

              {/* Sessions / Agenda */}
              <FormSection title={lang === 'es' ? 'Agenda / Sesiones' : 'Agenda / Sessions'} defaultOpen={sessions.length > 0}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 italic">
                      {sessions.length === 0
                        ? lang === 'es' ? 'Sin sesiones. Usa esto para eventos con múltiples actividades.' : 'No sessions. Use this for events with multiple activities.'
                        : `${sessions.length} ${lang === 'es' ? 'sesiones' : 'sessions'}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSessions(prev => [...prev, { id: `s-${Date.now()}`, title: '', time: '', capacity: undefined, instructor: '', description: '' }])}
                      className="text-xs font-semibold text-[#233dff] hover:underline"
                    >
                      + {lang === 'es' ? 'Agregar Sesión' : 'Add Session'}
                    </button>
                  </div>
                  {sessions.map((session, idx) => (
                    <div key={session.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          {lang === 'es' ? 'Sesión' : 'Session'} {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSessions(prev => prev.filter(s => s.id !== session.id))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          {lang === 'es' ? 'Eliminar' : 'Remove'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          value={session.title}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Título (ej. Clase de Baile)' : 'Title (e.g. Dance Class)'}
                          className="col-span-2 bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.time}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, time: e.target.value } : s))}
                          placeholder="5:45 PM - 6:05 PM"
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.capacity || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, capacity: e.target.value ? Number(e.target.value) : undefined } : s))}
                          type="number"
                          placeholder={lang === 'es' ? 'Capacidad (opc.)' : 'Capacity (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.instructor || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, instructor: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Instructor (opc.)' : 'Instructor (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.location || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, location: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Ubicación (opc.)' : 'Room/area (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                      </div>
                      <textarea
                        value={session.description || ''}
                        onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, description: e.target.value } : s))}
                        rows={2}
                        placeholder={lang === 'es' ? 'Descripción (opc.)' : 'Description (opt.)'}
                        className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm focus:border-[#233dff] outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              </FormSection>

              {/* Form Actions */}
              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
                <Button type="submit" className="h-12 flex-1 justify-center" disabled={isSaving}>
                  {isSaving
                    ? '...'
                    : editingEvent
                    ? lang === 'es'
                      ? 'Guardar Cambios'
                      : 'Save Changes'
                    : lang === 'es'
                    ? 'Crear Evento'
                    : 'Create Event'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setView('main')}
                  className="h-12"
                  disabled={isSaving}
                >
                  {lang === 'es' ? 'Cancelar' : 'Cancel'}
                </Button>
              </div>
            </form>
          )}
          {/* ===== PARTNER REQUESTS VIEW ===== */}
          {view === 'partner-requests' && (
            <div className="space-y-4">
              {/* Toast */}
              {partnerToast && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-700">{partnerToast}</span>
                </div>
              )}

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                  {partnerRequests.length} {lang === 'es' ? 'solicitudes pendientes' : 'pending requests'}
                </div>
                <button
                  onClick={fetchPartnerRequests}
                  disabled={partnerRequestsLoading}
                  className="text-xs font-semibold text-[#233dff] hover:underline disabled:opacity-50"
                >
                  {partnerRequestsLoading ? (lang === 'es' ? 'Cargando...' : 'Loading...') : (lang === 'es' ? 'Actualizar' : 'Refresh')}
                </button>
              </div>

              {/* Loading state */}
              {partnerRequestsLoading && partnerRequests.length === 0 && (
                <div className="space-y-3">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              )}

              {/* Empty state */}
              {!partnerRequestsLoading && partnerRequests.length === 0 && (
                <div className="text-center py-16 text-gray-300">
                  <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-400">
                    {lang === 'es' ? 'Sin solicitudes pendientes' : 'No pending partner requests'}
                  </p>
                </div>
              )}

              {/* Request cards */}
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {partnerRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-amber-300 transition-all"
                  >
                    {/* Card header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1a1a1a] text-[15px] leading-tight truncate">
                            {req.eventTitle}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {req.organization} &middot; {req.name}
                          </div>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 shrink-0">
                          PENDING
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                        {req.proposedDate && (
                          <div><span className="font-semibold text-gray-700">Date:</span> {req.proposedDate}</div>
                        )}
                        {req.eventTime && (
                          <div><span className="font-semibold text-gray-700">Time:</span> {req.eventTime}</div>
                        )}
                        {req.location && (
                          <div className="col-span-2"><span className="font-semibold text-gray-700">Location:</span> {req.location}</div>
                        )}
                        {req.email && (
                          <div className="col-span-2"><span className="font-semibold text-gray-700">Email:</span> {req.email}</div>
                        )}
                        {req.submittedAt && (
                          <div className="col-span-2 text-gray-400">Submitted: {req.submittedAt}</div>
                        )}
                      </div>

                      {/* Description (collapsible) */}
                      {req.eventDescription && (
                        <div className="mt-2">
                          <p className={`text-xs text-gray-500 ${expandedDescriptions.has(req.id) ? '' : 'line-clamp-2'}`}>
                            {req.eventDescription}
                          </p>
                          {req.eventDescription.length > 100 && (
                            <button
                              onClick={() => setExpandedDescriptions((prev) => {
                                const next = new Set(prev);
                                if (next.has(req.id)) next.delete(req.id); else next.add(req.id);
                                return next;
                              })}
                              className="text-[11px] font-semibold text-[#233dff] hover:underline mt-0.5"
                            >
                              {expandedDescriptions.has(req.id) ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      {approvingId !== req.id && rejectingId !== req.id && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => {
                              setApprovingId(req.id);
                              setRejectingId(null);
                              // Pre-fill form from request data
                              // Try to parse proposedDate (e.g. "5/9/2026" or "2026-05-09") into YYYY-MM-DD
                              let isoDate = '';
                              if (req.proposedDate) {
                                const slash = req.proposedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                                if (slash) {
                                  isoDate = `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
                                } else if (/^\d{4}-\d{2}-\d{2}$/.test(req.proposedDate)) {
                                  isoDate = req.proposedDate;
                                }
                              }
                              setApproveFormData({
                                title: req.eventTitle,
                                date: isoDate,
                                dateDisplay: '',
                                time: req.eventTime,
                                location: req.location,
                                city: req.location,
                                address: req.location,
                                program: 'Partner Event',
                                description: req.eventDescription,
                              });
                            }}
                            className="flex-1 py-2 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-center"
                          >
                            {lang === 'es' ? 'Aprobar' : 'Approve'}
                          </button>
                          <button
                            onClick={() => { setRejectingId(req.id); setApprovingId(null); setRejectReason(''); }}
                            className="flex-1 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all text-center"
                          >
                            {lang === 'es' ? 'Rechazar' : 'Reject'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ---- Approve form (inline) ---- */}
                    {approvingId === req.id && (
                      <div className="border-t border-emerald-200 bg-emerald-50 p-4 space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">
                          {lang === 'es' ? 'Confirmar y Publicar' : 'Confirm & Publish'}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Title</label>
                            <input
                              value={approveFormData.title as string || ''}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, title: e.target.value }))}
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-emerald-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Date</label>
                            <input
                              type="date"
                              value={approveFormData.date as string || ''}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, date: e.target.value, dateDisplay: '' }))}
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-emerald-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Time</label>
                            <input
                              value={approveFormData.time as string || ''}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, time: e.target.value }))}
                              placeholder="10:00 AM - 12:00 PM"
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-emerald-500 outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Location</label>
                            <input
                              value={approveFormData.location as string || ''}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, location: e.target.value, city: e.target.value, address: e.target.value }))}
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-emerald-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Category</label>
                            <select
                              value={approveFormData.program as string || 'Partner Event'}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, program: e.target.value }))}
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-emerald-500 outline-none appearance-none"
                            >
                              {PROGRAM_OPTIONS.map((prog) => (
                                <option key={prog} value={prog}>{prog}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">Description</label>
                            <textarea
                              value={approveFormData.description as string || ''}
                              onChange={(e) => setApproveFormData((p) => ({ ...p, description: e.target.value }))}
                              rows={2}
                              className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm focus:border-emerald-500 outline-none resize-none"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleApprovePartnerRequest(req)}
                            disabled={partnerActionLoading || !approveFormData.title || !approveFormData.date}
                            className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50"
                          >
                            {partnerActionLoading ? (lang === 'es' ? 'Publicando...' : 'Publishing...') : (lang === 'es' ? 'Confirmar y Publicar' : 'Confirm & Publish')}
                          </button>
                          <button
                            onClick={() => { setApprovingId(null); setApproveFormData({}); }}
                            disabled={partnerActionLoading}
                            className="px-4 py-2.5 rounded-full text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
                          >
                            {lang === 'es' ? 'Cancelar' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ---- Reject form (inline) ---- */}
                    {rejectingId === req.id && (
                      <div className="border-t border-red-200 bg-red-50 p-4 space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-1">
                          {lang === 'es' ? 'Confirmar Rechazo' : 'Confirm Rejection'}
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">
                            {lang === 'es' ? 'Motivo (opcional)' : 'Reason (optional)'}
                          </label>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={2}
                            placeholder={lang === 'es' ? 'Ej. El evento no cumple con los requisitos...' : 'e.g. The event does not meet our current criteria...'}
                            className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm focus:border-red-400 outline-none resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectPartnerRequest(req)}
                            disabled={partnerActionLoading}
                            className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
                          >
                            {partnerActionLoading ? (lang === 'es' ? 'Enviando...' : 'Sending...') : (lang === 'es' ? 'Confirmar Rechazo' : 'Confirm Rejection')}
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            disabled={partnerActionLoading}
                            className="px-4 py-2.5 rounded-full text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
                          >
                            {lang === 'es' ? 'Cancelar' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ===== ADS VIEW ===== */}
          {view === 'ads' && (
            <div className="space-y-4">
              {/* Toast */}
              {adsToast && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-700">{adsToast}</span>
                </div>
              )}

              {/* Error */}
              {adsError && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-yellow-800">{adsError}</span>
                  <button onClick={() => setAdsError('')} className="text-yellow-600 hover:text-yellow-800 text-xs font-bold">Dismiss</button>
                </div>
              )}

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                  {ads.length} banners
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAds}
                    disabled={adsLoading}
                    className="text-xs font-semibold text-[#233dff] hover:underline disabled:opacity-50"
                  >
                    {adsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => { setAdForm(emptyAdForm()); setAdLinkMode('event'); setAdFormVisible(true); }}
                    className="h-8 px-3 rounded-full text-xs font-semibold bg-[#233dff] text-white hover:bg-[#1a2fd0] transition-all"
                  >
                    + Add Banner
                  </button>
                </div>
              </div>

              {/* Add / Edit form */}
              {adFormVisible && (
                <form onSubmit={handleSaveAd} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                    {adForm.id ? 'Edit Banner' : 'New Banner'}
                  </div>

                  {/* Helper text */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 leading-relaxed space-y-1">
                    <p><strong>Direct image URL required.</strong> The URL must point directly to a PNG, JPG, GIF, or WebP image file, not a webpage.</p>
                    <p><strong>Canva:</strong> Do NOT use "Share → Copy link" (that gives a canva.link URL which will not load). Instead: Share → Download → PNG, then upload the file to Google Drive.</p>
                    <p><strong>Google Drive:</strong> Upload your image, right-click → Share → Anyone with the link. Copy the file ID from the URL and use: <code>https://drive.google.com/uc?export=view&amp;id=FILE_ID</code></p>
                    <p><strong>Dropbox:</strong> Share link and change <code>dl=0</code> to <code>raw=1</code> at the end of the URL.</p>
                    <p><strong>Sizes:</strong> Desktop 728×90px · Mobile 320×50px</p>
                  </div>

                  {/* Desktop image URL */}
                  <div>
                    <label className={labelCls}>
                      DESKTOP IMAGE URL *
                      <span className="ml-2 font-normal normal-case text-gray-400">728 x 90 pixels (leaderboard)</span>
                    </label>
                    <input
                      required
                      type="url"
                      value={adForm.imageUrl}
                      onChange={e => setAdForm(f => ({ ...f, imageUrl: e.target.value }))}
                      placeholder="https://drive.google.com/uc?export=view&id=..."
                      className={inputCls}
                    />
                    {adForm.imageUrl && (adForm.imageUrl.includes('canva.link') || (adForm.imageUrl.includes('canva.com') && !adForm.imageUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i))) && (
                      <p className="text-[11px] text-amber-600 font-semibold mt-1">
                        Canva share links cannot be used as image URLs. Download your design as PNG/JPG and upload to Google Drive, then use the direct URL format above.
                      </p>
                    )}
                    {adForm.imageUrl && !adForm.imageUrl.includes('canva.link') && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">D</span>
                        <img
                          src={adForm.imageUrl}
                          alt="Desktop preview"
                          style={{ maxHeight: 45, maxWidth: 364, borderRadius: 4, border: '1px solid #e5e7eb' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Mobile image URL */}
                  <div>
                    <label className={labelCls}>
                      MOBILE IMAGE URL
                      <span className="ml-2 font-normal normal-case text-gray-400">320 x 50 pixels (optional, the desktop image will scale if not provided)</span>
                    </label>
                    <input
                      type="url"
                      value={adForm.mobileImageUrl}
                      onChange={e => setAdForm(f => ({ ...f, mobileImageUrl: e.target.value }))}
                      placeholder="https://..."
                      className={inputCls}
                    />
                    {adForm.mobileImageUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">M</span>
                        <img
                          src={adForm.mobileImageUrl}
                          alt="Mobile preview"
                          style={{ maxHeight: 25, maxWidth: 160, borderRadius: 4, border: '1px solid #e5e7eb' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Link URL, smart toggle */}
                  <div className="space-y-2">
                    <label className={labelCls}>Link URL</label>
                    {/* Mode radio */}
                    <div className="flex items-center gap-5 text-sm font-semibold text-gray-600">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="adLinkMode"
                          value="event"
                          checked={adLinkMode === 'event'}
                          onChange={() => {
                            setAdLinkMode('event');
                            setAdForm(f => ({ ...f, linkUrl: '' }));
                          }}
                          className="accent-[#233dff]"
                        />
                        Link to an Event
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="adLinkMode"
                          value="custom"
                          checked={adLinkMode === 'custom'}
                          onChange={() => setAdLinkMode('custom')}
                          className="accent-[#233dff]"
                        />
                        Custom URL
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="adLinkMode"
                          value="none"
                          checked={adLinkMode === 'none'}
                          onChange={() => {
                            setAdLinkMode('none');
                            setAdForm(f => ({ ...f, linkUrl: '' }));
                          }}
                          className="accent-[#233dff]"
                        />
                        No link
                      </label>
                    </div>

                    {adLinkMode === 'event' ? (
                      <div>
                        <select
                          value={adForm.linkUrl}
                          onChange={e => {
                            const selected = events.find(ev => `https://eventfinder.healthmatters.clinic?event=${encodeURIComponent(ev.id)}` === e.target.value);
                            setAdForm(f => ({
                              ...f,
                              linkUrl: e.target.value,
                              altText: f.altText || (selected ? selected.title : f.altText),
                            }));
                          }}
                          className={`${inputCls} appearance-none cursor-pointer`}
                        >
                          <option value="">Select an event...</option>
                          {[...events]
                            .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
                            .map(ev => {
                              const url = `https://eventfinder.healthmatters.clinic?event=${encodeURIComponent(ev.id)}`;
                              return (
                                <option key={ev.id} value={url}>
                                  {ev.title}, {ev.dateDisplay || ev.date}
                                </option>
                              );
                            })}
                        </select>
                        {adForm.linkUrl && (
                          <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">{adForm.linkUrl}</p>
                        )}
                      </div>
                    ) : adLinkMode === 'custom' ? (
                      <input
                        type="url"
                        value={adForm.linkUrl}
                        onChange={e => setAdForm(f => ({ ...f, linkUrl: e.target.value }))}
                        placeholder="https://..."
                        className={inputCls}
                      />
                    ) : (
                      <p className="text-xs text-gray-400">Banner will display without a clickable link.</p>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Alt Text *</label>
                    <input
                      required
                      value={adForm.altText}
                      onChange={e => setAdForm(f => ({ ...f, altText: e.target.value }))}
                      placeholder="Describe the banner for accessibility"
                      className={inputCls}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Order</label>
                      <input
                        type="number"
                        value={adForm.order}
                        onChange={e => setAdForm(f => ({ ...f, order: Number(e.target.value) }))}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adForm.active}
                          onChange={e => setAdForm(f => ({ ...f, active: e.target.checked }))}
                          className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff]"
                        />
                        <span className="text-sm font-semibold text-gray-700">Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={adSaving}
                      className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-[#233dff] text-white hover:bg-[#1a2fd0] transition-all disabled:opacity-50"
                    >
                      {adSaving ? 'Saving...' : (adForm.id ? 'Save Changes' : 'Create Banner')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdFormVisible(false); setAdForm(emptyAdForm()); setAdLinkMode('event'); }}
                      disabled={adSaving}
                      className="px-4 py-2.5 rounded-full text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Loading skeleton */}
              {adsLoading && ads.length === 0 && (
                <div className="space-y-3">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              )}

              {/* Empty state */}
              {!adsLoading && ads.length === 0 && !adFormVisible && (
                <div className="text-center py-12 text-gray-300">
                  <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-400">No banners yet. Add one above.</p>
                </div>
              )}

              {/* Ad cards */}
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {ads.map(ad => (
                  <div key={ad.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 hover:border-purple-300 transition-all">
                    {/* Thumbnail(s) */}
                    <div className="shrink-0 flex flex-col gap-1">
                      {/* Desktop thumbnail */}
                      <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                        {ad.imageUrl ? (
                          <img
                            src={ad.imageUrl}
                            alt={ad.altText}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                        <span className="absolute top-0.5 left-0.5 text-[8px] font-bold bg-gray-700/70 text-white px-1 rounded leading-tight">D</span>
                      </div>
                      {/* Mobile thumbnail, only shown if mobileImageUrl exists */}
                      {ad.mobileImageUrl && (
                        <div className="relative w-16 h-5 rounded overflow-hidden bg-purple-50 border border-purple-200 flex items-center justify-center">
                          <img
                            src={ad.mobileImageUrl}
                            alt={`${ad.altText} (mobile)`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <span className="absolute top-0 left-0.5 text-[8px] font-bold bg-purple-600/70 text-white px-1 rounded leading-tight">M</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{ad.altText || 'Untitled'}</div>
                      <div className="text-xs text-gray-400 truncate">{ad.linkUrl}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-semibold text-gray-400">Order: {ad.order}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ad.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                          {ad.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleAdActive(ad)}
                        title={ad.active ? 'Deactivate' : 'Activate'}
                        className="p-1.5 rounded-full text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ad.active ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setAdForm({ ...ad });
                          // Detect mode from existing linkUrl
                          const isEventLink = ad.linkUrl.startsWith('https://eventfinder.healthmatters.clinic?event=');
                          setAdLinkMode(!ad.linkUrl ? 'none' : isEventLink ? 'event' : 'custom');
                          setAdFormVisible(true);
                        }}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border border-[#233dff]/30 text-[#233dff] hover:bg-[#233dff] hover:text-white transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAd(ad.id)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Partner Submissions */}
              <div className="mt-6 pt-5 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                      Partner Submissions
                    </div>
                    {partnerAds.length > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">
                        {partnerAds.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={fetchPartnerAds}
                    disabled={partnerAdsLoading}
                    className="text-xs font-semibold text-[#233dff] hover:underline disabled:opacity-50"
                  >
                    {partnerAdsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {partnerAdsToast && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3 mb-3">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-700">{partnerAdsToast}</span>
                  </div>
                )}

                {partnerAdsError && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-yellow-800">{partnerAdsError}</span>
                    <button onClick={() => setPartnerAdsError('')} className="text-yellow-600 hover:text-yellow-800 text-xs font-bold">Dismiss</button>
                  </div>
                )}

                {partnerAdsLoading && partnerAds.length === 0 && (
                  <div className="space-y-2">
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                )}

                {!partnerAdsLoading && partnerAds.length === 0 && !partnerAdsError && (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-gray-400">No pending partner ad submissions.</p>
                  </div>
                )}

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {partnerAds.map(ad => (
                    <div key={ad.id} className="bg-white border border-amber-200 rounded-xl p-4 hover:border-amber-400 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-16 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                          {ad.imageUrl ? (
                            <img
                              src={ad.imageUrl}
                              alt={ad.altText}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{ad.altText || 'Untitled'}</div>
                          <div className="text-xs text-gray-500 font-medium">{ad.partnerName}</div>
                          {ad.linkUrl && <div className="text-xs text-gray-400 truncate">{ad.linkUrl}</div>}
                          {ad.notes && <div className="text-xs text-gray-400 italic mt-0.5 truncate">Note: {ad.notes}</div>}
                          {ad.submittedAt && (
                            <div className="text-[10px] text-gray-300 mt-0.5">
                              {new Date(ad.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleApprovePartnerAd(ad)}
                          className="flex-1 py-2 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-center"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectPartnerAd(ad)}
                          className="flex-1 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all text-center"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="bg-[#fafbff] border-t border-gray-200 px-5 py-3 text-center shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300">
            EventOps - Health Matters Clinic
          </div>
        </div>
      </div>
    </div>
  );
};
