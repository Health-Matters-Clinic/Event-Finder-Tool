import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { EVENTS, I18N } from './constants';
import { GOOGLE_APPS_SCRIPT_URL, STORAGE_KEYS } from './config';
import { ClinicEvent, Language } from './types';
import { Button } from './components/Button';
import { translateEventTitle, translateProgram } from './utils/translation';

const RSVPModal = lazy(() => import('./components/RSVPModal').then(m => ({ default: m.RSVPModal })));
const AdminModal = lazy(() => import('./components/AdminModal').then(m => ({ default: m.AdminModal })));
const PartnerModal = lazy(() => import('./components/PartnerModal').then(m => ({ default: m.PartnerModal })));

// HMC Logo Component with hover animation
const HMC_LOGO_URL = 'https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png';

const HMCLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <a
    href="https://www.healthmatters.clinic"
    target="_blank"
    rel="noopener noreferrer"
    className={`group flex items-center justify-center transition-transform duration-300 hover:scale-110 ${className}`}
    title="Health Matters Clinic"
  >
    <img
      src={HMC_LOGO_URL}
      alt="Health Matters Clinic"
      className="h-10 w-10 object-contain transition-all duration-300 group-hover:drop-shadow-[0_4px_8px_rgba(35,61,255,0.3)]"
    />
  </a>
);

declare const L: any;

const PROGRAM_COLORS: { [key: string]: string } = {
  'Unstoppable Workshop': '#233dff',
  'Unstoppable Wellness Meetup': '#7c3aed',
  'Community Walk & Run': '#059669',
  'Community Fair': '#ea580c',
  'Community Wellness': '#db2777',
  'Partner Event': '#0891b2',
  'Volunteer': '#f59e0b',
  default: '#4b5563',
};

const DEFAULT_CENTER: [number, number] = [33.9719, -118.2108];

// Sanitize raw event data from Google Sheets or cache before putting it in state.
// Drops records missing required fields; coerces optional fields to safe types.
const sanitizeEvent = (e: any): ClinicEvent | null => {
  if (!e || typeof e !== 'object') return null;
  if (!e.id || !e.date || typeof e.date !== 'string') return null;
  return {
    ...e,
    id: String(e.id),
    title: e.title ? String(e.title) : 'Untitled Event',
    date: String(e.date),
    dateDisplay: e.dateDisplay ? String(e.dateDisplay) : String(e.date),
    time: e.time ? String(e.time) : '',
    location: e.location ? String(e.location) : '',
    city: e.city ? String(e.city) : '',
    address: e.address ? String(e.address) : '',
    program: e.program ? String(e.program) : 'Community Wellness',
    description: e.description ? String(e.description) : '',
    lat: typeof e.lat === 'number' ? e.lat : parseFloat(e.lat) || DEFAULT_CENTER[0],
    lng: typeof e.lng === 'number' ? e.lng : parseFloat(e.lng) || DEFAULT_CENTER[1],
    flyerUrl: e.flyerUrl ? String(e.flyerUrl) : '',
    websiteUrl: e.websiteUrl ? String(e.websiteUrl) : '',
    sessions: Array.isArray(e.sessions) ? e.sessions : [],
  };
};

const sanitizeEvents = (raw: any[]): ClinicEvent[] =>
  raw.map(sanitizeEvent).filter((e): e is ClinicEvent => e !== null);

const isPast = (dateStr: string) => {
  if (!dateStr) return false;
  // Handle both YYYY-MM-DD and ISO date strings (2026-06-05T05:00:00.000Z)
  let dateOnly = dateStr;
  if (dateStr.includes('T')) {
    dateOnly = dateStr.split('T')[0];
  }
  const eventDate = new Date(`${dateOnly}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [events, setEvents] = useState<ClinicEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ClinicEvent | null>(null);
  const [isRSVPOpen, setIsRSVPOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [filters, setFilters] = useState({ month: '', program: '', showPast: false });
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [pendingEventSlug, setPendingEventSlug] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<Record<string, any>>({});
  const heatLayerRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const t = I18N[lang];

  // Check URL parameters for deep linking
  useEffect(() => {
    const getEventParam = () => {
      // 1. Check own query string: ?event=slug (direct access)
      const urlParams = new URLSearchParams(window.location.search);
      const queryEvent = urlParams.get('event');
      if (queryEvent) return queryEvent;

      // 2. Check own hash: #event=slug
      const hash = window.location.hash;
      if (hash.startsWith('#event=')) return hash.slice(7);

      // 3. Check parent window (same-origin iframe)
      try {
        if (window.parent !== window) {
          const parentParams = new URLSearchParams(window.parent.location.search);
          const parentEvent = parentParams.get('event');
          if (parentEvent) return parentEvent;
        }
      } catch {
        // Cross-origin parent — can't access directly, fall through
      }

      // 4. Check document.referrer (cross-origin iframe — parent URL with query params)
      if (document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);
          const referrerEvent = referrerUrl.searchParams.get('event');
          if (referrerEvent) return referrerEvent;
        } catch {
          // Invalid referrer URL, ignore
        }
      }

      return null;
    };

    const eventParam = getEventParam();
    if (eventParam) {
      setPendingEventSlug(eventParam);
    }

    // Capture referral code (ambassador tracking) from any URL source
    const getRefParam = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const refParam = urlParams.get('ref');
      if (refParam) return refParam;

      try {
        if (window.parent !== window) {
          const parentRef = new URLSearchParams(window.parent.location.search).get('ref');
          if (parentRef) return parentRef;
        }
      } catch { /* cross-origin */ }

      if (document.referrer) {
        try {
          const referrerRef = new URL(document.referrer).searchParams.get('ref');
          if (referrerRef) return referrerRef;
        } catch { /* invalid referrer */ }
      }

      return null;
    };

    const refParam = getRefParam();
    if (refParam) setReferralCode(refParam);

    // Listen for postMessage from parent (Webflow can send event param)
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'selectEvent' && e.data?.eventSlug) {
        setPendingEventSlug(e.data.eventSlug);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Load events from Google Sheets backend on mount
  useEffect(() => {
    let isMounted = true;

    const loadEvents = async () => {
      // Show cached events immediately — but only if cache is < 5 minutes old
      const CACHE_TTL_MS = 5 * 60 * 1000;
      try {
        const cached = localStorage.getItem(STORAGE_KEYS.EVENTS_CACHE);
        const cachedAt = parseInt(localStorage.getItem(STORAGE_KEYS.EVENTS_CACHE + '_ts') || '0', 10);
        if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
          const cachedEvents = sanitizeEvents(JSON.parse(cached));
          if (cachedEvents.length > 0 && isMounted) {
            setEvents(cachedEvents);
          }
        } else if (cached) {
          // Cache expired — clear it so fresh data loads without flicker
          localStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE);
          localStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE + '_ts');
        }
      } catch {
        // Corrupt cache — clear it so it doesn't crash again
        localStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE);
        localStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE + '_ts');
      }

      const applyEvents = (events: ClinicEvent[]) => {
        const cleanEvents = sanitizeEvents(events);
        if (isMounted && cleanEvents.length > 0) {
          setEvents(cleanEvents);
          const cacheEvents = cleanEvents.map((e) => ({
            ...e,
            flyerUrl: (e.flyerUrl && e.flyerUrl.startsWith('data:') && e.flyerUrl.length > 5000) ? '' : (e.flyerUrl || ''),
          }));
          try {
            localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(cacheEvents));
            localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE + '_ts', String(Date.now()));
          } catch { /* quota exceeded */ }
          return true;
        }
        return false;
      };

      // Primary: portal API (Cloud Run + Firestore — always warm, no cold-start)
      // Returns a plain array; merges Firestore events + cached GAS events server-side
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${PORTAL_API_URL}/api/public/events`, { signal: controller.signal });
        clearTimeout(tid);
        if (response.ok) {
          const events = await response.json();
          if (Array.isArray(events) && events.length > 0) {
            if (applyEvents(events)) return;
          }
        }
      } catch (e: any) {
        console.warn('Portal events fetch failed:', e.name === 'AbortError' ? 'timed out' : e.message);
      }

      // Fallback: direct GAS call (only reached if portal is completely unreachable)
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getEvents`, { signal: controller.signal });
        clearTimeout(tid);
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.events) && data.events.length > 0) {
            applyEvents(data.events);
            return;
          }
        }
      } catch (e: any) {
        console.warn('GAS events fetch failed:', e.name === 'AbortError' ? 'timed out' : e.message);
      }

      // If backend failed and no cache, fall back to hardcoded events (includes critical Unstoppable Season events)
      if (isMounted) {
        setEvents(prev => prev.length > 0 ? prev : EVENTS);
      }
    };

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle deep link after events are loaded
  useEffect(() => {
    if (pendingEventSlug && events.length > 0) {
      // Find event by slug (id) or by title (url-friendly)
      const slugLower = pendingEventSlug.toLowerCase();

      // Helper to create URL-safe slug from any string
      const toSlug = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      // First pass: exact match by ID, title slug, date, or combo slug
      let foundEvent = events.find(e => {
        const idSlug = toSlug(e.id);
        if (e.id.toLowerCase() === slugLower || idSlug === slugLower) return true;
        const titleSlug = toSlug(e.title);
        if (titleSlug === slugLower) return true;
        const eventDate = e.date && e.date.includes('T') ? e.date.split('T')[0] : (e.date || null);
        if (eventDate === slugLower) return true;
        if (eventDate) {
          const comboSlug = toSlug(`${e.title}-${eventDate}`);
          if (comboSlug === slugLower) return true;
        }
        return false;
      });

      // Second pass: Unstoppable Season keyword matching — prefer future events
      // These short slugs have been publicly shared and must keep working.
      if (!foundEvent) {
        const keywordMatch = (e: ClinicEvent) => {
          const titleLower = e.title.toLowerCase();
          if (slugLower === 'unstoppable-move') {
            if (e.id === 'event-1772063101013') return true;
            if (titleLower.includes('unstoppable') && (titleLower.includes('walk') || titleLower.includes('run') || titleLower.includes('move')) && !titleLower.includes('workshop')) return true;
          }
          if (slugLower === 'unstoppable-heal') {
            if (e.id === 'event-1772064063990') return true;
            if (titleLower.includes('unstoppable') && titleLower.includes('meetup') && !titleLower.includes('workshop')) return true;
          }
          if (slugLower === 'unstoppable-transform') {
            if (e.id === 'event-1773943614235') return true;
            if (titleLower.includes('unstoppable') && (titleLower.includes('transform') || titleLower.includes('virtual') || titleLower.includes('experience')) && !titleLower.includes('workshop') && !titleLower.includes('meetup') && !titleLower.includes('walk') && !titleLower.includes('run')) return true;
          }
          return false;
        };
        // Prefer upcoming events over past ones
        const futureMatches = events.filter(e => keywordMatch(e) && !isPast(e.date));
        const pastMatches = events.filter(e => keywordMatch(e) && isPast(e.date));
        foundEvent = futureMatches.length > 0 ? futureMatches[0] : pastMatches[pastMatches.length - 1] || null;
      }

      if (foundEvent) {
        // If it's a past event, temporarily enable showPast filter so it appears in the list
        if (isPast(foundEvent.date)) {
          setFilters(f => ({ ...f, showPast: true }));
        }
        setSelectedEvent(foundEvent);
        // Check if URL also has rsvp=true parameter — check both own URL and parent/referrer
        const urlParams = new URLSearchParams(window.location.search);
        let hasRsvp = urlParams.get('rsvp') === 'true';
        if (!hasRsvp) {
          try {
            if (window.parent !== window) {
              hasRsvp = new URLSearchParams(window.parent.location.search).get('rsvp') === 'true';
            }
          } catch { /* cross-origin */ }
        }
        if (!hasRsvp && document.referrer) {
          try { hasRsvp = new URL(document.referrer).searchParams.get('rsvp') === 'true'; } catch {}
        }
        if (hasRsvp && !foundEvent.websiteUrl) {
          // Only auto-open HMC's RSVP modal for events without their own registration page
          setIsRSVPOpen(true);
        }
        setPendingEventSlug(null);
      }
      // Don't clear pendingEventSlug if event not found — fresh data may still be loading
    }
  }, [pendingEventSlug, events]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (!event.date) return false;
        // Handle both YYYY-MM-DD and ISO date strings
        const dateOnly = event.date.includes('T') ? event.date.split('T')[0] : event.date;
        const monthMatch = !filters.month || dateOnly.includes(`-${filters.month}-`);
        const programMatch = !filters.program || event.program === filters.program;

        const locQuery = locationSearch.toLowerCase();
        const locationMatch =
          !locationSearch ||
          (event.city && event.city.toLowerCase().includes(locQuery)) ||
          (event.address && event.address.toLowerCase().includes(locQuery));

        const eventIsPast = isPast(dateOnly);
        const archivalMatch = filters.showPast ? eventIsPast : !eventIsPast;

        return monthMatch && programMatch && locationMatch && archivalMatch;
      })
      .sort((a, b) => {
        // Promoted events always come first
        if (a.isPromoted && !b.isPromoted) return -1;
        if (!a.isPromoted && b.isPromoted) return 1;

        // Then sponsored events
        if (a.isSponsored && !b.isSponsored) return -1;
        if (!a.isSponsored && b.isSponsored) return 1;

        // Then sort by date (handle ISO date strings)
        const dateA = a.date && a.date.includes('T') ? a.date.split('T')[0] : (a.date || '');
        const dateB = b.date && b.date.includes('T') ? b.date.split('T')[0] : (b.date || '');
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });
  }, [events, filters, locationSearch]);

  useEffect(() => {
    if (selectedEvent && listRefs.current[selectedEvent.id]) {
      listRefs.current[selectedEvent.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView(
        DEFAULT_CENTER,
        10
      );
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    Object.values(markersRef.current).forEach((marker: any) => marker.remove());
    markersRef.current = {};

    filteredEvents.forEach((event) => {
      // Skip virtual events (no address) — they have no map pin
      if (!event.address) return;
      const isSelected = selectedEvent?.id === event.id;
      const color = PROGRAM_COLORS[event.program] || PROGRAM_COLORS.default;

      const icon = L.divIcon({
        className: 'custom-pin',
        html: `
          <div style="transform: translate(-50%, -100%); position: relative; width: ${
            isSelected ? '44px' : '32px'
          }; height: ${isSelected ? '54px' : '40px'}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
            <svg viewBox="0 0 32 40" fill="${color}" stroke="black" stroke-width="1.5">
              <path d="M16 2C9.373 2 4 7.373 4 14c0 8 12 26 12 26s12-18 12-26c0-6.627-5.373-12-12-12z" />
              <circle cx="16" cy="14" r="5" fill="white" stroke="black" stroke-width="1" />
            </svg>
          </div>
        `,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
      });

      const marker = L.marker([event.lat, event.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : 0,
      }).addTo(mapRef.current!);
      marker.on('click', () => {
        setSelectedEvent(event);
        if (window.innerWidth < 768) {
          setMobileView('map');
        }
      });
      markersRef.current[event.id] = marker;
    });

    if (filteredEvents.length > 0 && !selectedEvent) {
      try {
        const group = L.featureGroup(Object.values(markersRef.current));
        mapRef.current.fitBounds(group.getBounds().pad(0.2));
      } catch (e) {
        console.warn('fitBounds deferred:', e);
      }
    }
  }, [filteredEvents, selectedEvent]);

  useEffect(() => {
    if (!mapRef.current) return;

    const points = filteredEvents
      .filter((event) => event.address)
      .map(
        (event) =>
          [event.lat, event.lng, selectedEvent?.id === event.id ? 0.9 : 0.5] as [
            number,
            number,
            number
          ]
      );

    try {
      if (!heatLayerRef.current) {
        heatLayerRef.current = L.heatLayer(points, {
          radius: 28,
          blur: 22,
          maxZoom: 14,
          minOpacity: 0.25,
          gradient: {
            0.2: '#60a5fa',
            0.5: '#818cf8',
            0.8: '#f97316',
          },
        }).addTo(mapRef.current);
      } else {
        heatLayerRef.current.setLatLngs(points);
      }
    } catch (e) {
      console.warn('Heatmap render deferred:', e);
    }
  }, [filteredEvents, selectedEvent]);

  const handleSelectEvent = (event: ClinicEvent) => {
    setSelectedEvent(event);
    mapRef.current?.setView([event.lat, event.lng], 14);
    if (window.innerWidth < 768) {
      setMobileView('map');
    }
  };

  const [shareConfirm, setShareConfirm] = useState('');

  const handleShare = async () => {
    if (!selectedEvent) return;
    const eventTitle = translateEventTitle(selectedEvent.title, lang, selectedEvent);
    const shareText = `${eventTitle} - ${selectedEvent.dateDisplay}${selectedEvent.address ? ` @ ${selectedEvent.address}` : ''}`;

    // Create event-specific share URL — always use event ID for reliable deep linking
    const shareUrl = `https://www.healthmatters.clinic/resources/eventfinder?event=${encodeURIComponent(selectedEvent.id)}&rsvp=true${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''}`;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(eventTitle)}&body=${encodeURIComponent(`${shareText}\n\nRSVP here: ${shareUrl}`)}`;

    // Detect if we're in an iframe (cross-origin blocks navigator.share and location.href)
    const inIframe = window.self !== window.top;

    // 1. Try native share (Safari share sheet, Android share) — only works outside iframes
    if (navigator.share && !inIframe) {
      try {
        await navigator.share({ title: eventTitle, text: shareText, url: shareUrl });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('Native share failed:', err);
      }
    }

    // 2. Try clipboard copy (works in most contexts with user gesture)
    const copyText = shareUrl;
    let copied = false;
    try {
      await navigator.clipboard.writeText(copyText);
      copied = true;
    } catch {
      // Clipboard API blocked — use execCommand fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = copyText;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* both methods failed */ }
    }
    if (copied) {
      setShareConfirm(lang === 'es' ? 'Enlace copiado!' : 'Link copied!');
      setTimeout(() => setShareConfirm(''), 2500);
      return;
    }

    // 3. If copy failed, try mailto as fallback
    if (inIframe) {
      try { window.open(mailtoUrl, '_blank'); return; } catch {}
    }

    // 3. Normal (not in iframe) email fallback
    window.location.href = mailtoUrl;
  };

  const handleEventsUpdate = (newEvents: ClinicEvent[]) => {
    setEvents(newEvents);
  };

  const programLabel = (program: string) => translateProgram(program, lang);

  // SEO: Inject JSON-LD structured data for Google rich results
  useEffect(() => {
    const upcoming = events.filter(e => !isPast(e.date));
    const jsonLd = upcoming.map(e => ({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.title,
      startDate: e.date,
      endDate: e.date,
      eventAttendanceMode: e.address ? 'https://schema.org/OfflineEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: e.address ? {
        '@type': 'Place',
        name: e.location || e.city,
        address: { '@type': 'PostalAddress', streetAddress: e.address, addressLocality: e.city, addressRegion: 'CA', addressCountry: 'US' },
        ...(e.lat && e.lng ? { geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lng } } : {}),
      } : { '@type': 'VirtualLocation', url: 'https://www.healthmatters.clinic/resources/eventfinder' },
      description: e.description || `${e.title} — free community health event by Health Matters Clinic`,
      organizer: { '@type': 'Organization', name: 'Health Matters Clinic', url: 'https://www.healthmatters.clinic' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: `https://www.healthmatters.clinic/resources/eventfinder?event=${e.id}&rsvp=true` },
      image: e.flyerUrl || 'https://cdn.prod.website-files.com/67359e6040140078962e8a54/6912e29e5710650a4f45f53f_Untitled%20(256%20x%20256%20px).png',
    }));

    // Remove old script tags
    document.querySelectorAll('script[data-event-jsonld]').forEach(el => el.remove());

    if (jsonLd.length > 0) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-event-jsonld', 'true');
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.querySelectorAll('script[data-event-jsonld]').forEach(el => el.remove());
    };
  }, [events]);

  return (
    <div className="flex flex-col bg-[#f5f3ef] font-['Inter'] selection:bg-[#233dff] selection:text-white" style={{ height: '100%' }}>
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 z-[200] relative flex items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <HMCLogo />
          <div className="hidden sm:block">
            <h1 className="text-xl font-medium text-[#1a1a1a] tracking-normal leading-none">
              Event Finder
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-[0.02em]">{t.app_subtitle}</p>
          </div>
        </div>

        {/* Right: Compact buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Toggle */}
          <div className="flex bg-white border-[1.5px] border-black rounded-full overflow-hidden" style={{ minHeight: 44 }}>
            <button
              onClick={() => setLang('en')}
              aria-label="Switch to English"
              aria-pressed={lang === 'en'}
              className={`px-4 py-2.5 text-[11px] font-semibold transition-all border-r border-black flex items-center gap-1.5 ${
                lang === 'en' ? 'bg-[#233dff] text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${lang === 'en' ? 'bg-white' : 'bg-black'}`}
                aria-hidden="true"
              />
              EN
            </button>
            <button
              onClick={() => setLang('es')}
              aria-label="Switch to Spanish"
              aria-pressed={lang === 'es'}
              className={`px-4 py-2.5 text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                lang === 'es' ? 'bg-[#233dff] text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${lang === 'es' ? 'bg-white' : 'bg-black'}`}
                aria-hidden="true"
              />
              ES
            </button>
          </div>

          {/* Partner Events Button */}
          <Button
            variant="outline"
            className="h-9 px-4"
            onClick={() => setIsPartnerOpen(true)}
          >
            {t.partner_events}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative flex-col md:flex-row min-h-0">
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setMobileView('map')}
            aria-pressed={mobileView === 'map'}
            aria-label={lang === 'es' ? 'Ver mapa' : 'Show map view'}
            className={`flex-1 py-3 rounded-full text-[11px] font-semibold uppercase tracking-wide border-[1.5px] border-solid border-gray-200 transition-all flex items-center justify-center gap-2 min-h-[44px] ${
              mobileView === 'map'
                ? 'bg-[#233dff] text-white border-solid border-[#233dff] shadow-md'
                : 'bg-white text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mobileView === 'map' ? 'bg-white' : 'bg-gray-400'
              }`}
              aria-hidden="true"
            />
            {lang === 'es' ? 'Mapa' : 'Map'}
          </button>
          <button
            onClick={() => setMobileView('list')}
            aria-pressed={mobileView === 'list'}
            aria-label={lang === 'es' ? 'Ver lista' : 'Show list view'}
            className={`flex-1 py-3 rounded-full text-[11px] font-semibold uppercase tracking-wide border-[1.5px] border-solid border-gray-200 transition-all flex items-center justify-center gap-2 min-h-[44px] ${
              mobileView === 'list'
                ? 'bg-[#233dff] text-white border-solid border-[#233dff] shadow-md'
                : 'bg-white text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mobileView === 'list' ? 'bg-white' : 'bg-gray-400'
              }`}
              aria-hidden="true"
            />
            {lang === 'es' ? 'Lista' : 'List'}
          </button>
        </div>

        <div
          className={`flex-1 relative bg-[#e8e6e0] min-h-0 h-[50vh] md:h-auto ${
            mobileView === 'map' ? 'block' : 'hidden'
          } md:block`}
        >
          <div ref={mapContainerRef} id="map-container" className="absolute inset-0" />
          {selectedEvent && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
              onClick={() => setSelectedEvent(null)}
            >
              <div
                className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-200 transition-all"
              >
                X
              </button>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span
                  className="inline-block bg-[#f0f4ff] border border-[#233dff]/20 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: PROGRAM_COLORS[selectedEvent.program] || PROGRAM_COLORS.default }}
                >
                  {programLabel(selectedEvent.program)}
                </span>
                {selectedEvent.isPromoted && (
                  <span className="inline-block bg-[#233dff] text-white border border-[#233dff] px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                    {lang === 'es' ? 'NUEVO' : 'JUST ADDED'}
                  </span>
                )}
                {selectedEvent.isSponsored && (
                  <span className="inline-block bg-[#f0f4ff] text-[#233dff] border border-[#233dff]/30 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                    {lang === 'es' ? 'PATROCINADO' : 'SPONSORED'}
                  </span>
                )}
                {selectedEvent.date && isPast(selectedEvent.date) && (
                  <span className="inline-block bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                    {t.past}
                  </span>
                )}
              </div>

              <h3 className="text-2xl font-semibold text-[#1a1a1a] mb-6 pr-6 leading-tight">
                {translateEventTitle(selectedEvent.title, lang, selectedEvent)}
              </h3>

              <div className="space-y-6 mb-8">
                {/* Flyer Image */}
                {selectedEvent.flyerUrl && (
                  <div>
                    <img
                      src={selectedEvent.flyerUrl}
                      alt={`${selectedEvent.title} flyer`}
                      className="w-full rounded-xl border border-gray-200 shadow-sm"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    {lang === 'es' ? 'Cuando' : 'When'}
                  </label>
                  <p className="text-base font-bold text-gray-900 leading-snug">
                    {selectedEvent.dateDisplay}
                    <br />
                    {selectedEvent.time}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    {lang === 'es' ? 'Donde' : 'Where'}
                  </label>
                  <p className="text-sm font-semibold text-gray-700 leading-relaxed">
                    {selectedEvent.address || (lang === 'es' ? 'Evento Virtual' : 'Virtual Event')}
                  </p>
                </div>
                {selectedEvent.sessions && selectedEvent.sessions.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
                      {lang === 'es' ? 'Agenda' : 'Agenda'}
                    </label>
                    <div className="space-y-2">
                      {selectedEvent.sessions.map(session => (
                        <div key={session.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{session.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {session.time}{session.instructor ? ` · ${session.instructor}` : ''}{session.location ? ` · ${session.location}` : ''}
                              </p>
                              {session.description && <p className="text-xs text-gray-400 mt-1">{session.description}</p>}
                            </div>
                            {session.capacity != null && (
                              <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${
                                (session.rsvpCount || 0) >= session.capacity ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                              }`}>
                                {(session.rsvpCount || 0) >= session.capacity
                                  ? (lang === 'es' ? 'Lleno' : 'Full')
                                  : `${session.capacity - (session.rsvpCount || 0)} ${lang === 'es' ? 'disponibles' : 'spots'}`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedEvent.websiteUrl && (
                  <a
                    href={selectedEvent.websiteUrl.startsWith('http') ? selectedEvent.websiteUrl : `https://${selectedEvent.websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[#233dff] hover:underline inline-flex items-center gap-1.5"
                  >
                    {lang === 'es' ? 'Mas Informacion' : 'More Info'}
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {!selectedEvent.saveTheDate && !isPast(selectedEvent.date) ? (
                  selectedEvent.websiteUrl ? (
                  <a
                    href={selectedEvent.websiteUrl.startsWith('http') ? selectedEvent.websiteUrl : `https://${selectedEvent.websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="w-full justify-center h-12">
                      {lang === 'es' ? 'Registrarse' : 'Register'}
                    </Button>
                  </a>
                  ) : (
                  <Button onClick={() => setIsRSVPOpen(true)} className="w-full justify-center h-12">
                    {t.submit_btn}
                  </Button>
                  )
                ) : (
                  <div className="bg-gray-100 text-gray-500 rounded-full py-3 text-center text-base font-normal border border-gray-200">
                    {selectedEvent.saveTheDate
                      ? lang === 'es' ? 'Proximamente' : 'Coming Soon'
                      : lang === 'es' ? 'Evento archivado' : 'Archived Event'}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="justify-center h-11"
                    onClick={() => {
                      const d = (selectedEvent.date || '').replace(/-/g, '');
                      // Parse actual event time (e.g., "8:00 AM", "5:45 PM - 7:30 PM", "10:15 AM - 11:45 AM")
                      const parseTime = (timeStr: string): string => {
                        if (!timeStr || timeStr === 'TBD') return '120000';
                        const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
                        if (!match) return '120000';
                        let hours = parseInt(match[1]);
                        const mins = match[2] ? match[2] : '00';
                        const ampm = (match[3] || '').toUpperCase();
                        if (ampm === 'PM' && hours < 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        return `${String(hours).padStart(2,'0')}${mins}00`;
                      };
                      const timeStr = selectedEvent.time || '';
                      const parts = timeStr.split(/[-–]/);
                      const startTime = parseTime(parts[0]?.trim() || '');
                      const endTime = parts[1] ? parseTime(parts[1].trim()) :
                        // Default to 2 hours after start if no end time
                        String(Math.min(23, parseInt(startTime.substring(0,2)) + 2)).padStart(2,'0') + startTime.substring(2);
                      const ics = [
                        'BEGIN:VCALENDAR',
                        'VERSION:2.0',
                        'BEGIN:VEVENT',
                        `DTSTART:${d}T${startTime}`,
                        `DTEND:${d}T${endTime}`,
                        `SUMMARY:${selectedEvent.title}`,
                        `DESCRIPTION:${selectedEvent.description || ''}`,
                        `LOCATION:${selectedEvent.address || 'Virtual Event'}`,
                        `UID:${selectedEvent.id}@healthmatters.clinic`,
                        'END:VEVENT',
                        'END:VCALENDAR'
                      ].join('\r\n');
                      const blob = new Blob([ics], { type: 'text/calendar' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = `${selectedEvent.title.replace(/[^a-z0-9]/gi, '-')}.ics`;
                      link.click();
                    }}
                  >
                    {lang === 'es' ? 'Calendario' : 'Calendar'}
                  </Button>
                  <Button variant="outline" className="justify-center h-11" onClick={handleShare}>
                    {shareConfirm || (lang === 'es' ? 'Compartir' : 'Share')}
                  </Button>
                </div>

                {/* Mobile: View List button */}
                <Button
                  variant="outline"
                  className="md:hidden justify-center h-11 mt-1"
                  onClick={() => {
                    setSelectedEvent(null);
                    setMobileView('list');
                  }}
                >
                  {lang === 'es' ? 'Ver Lista' : 'View List'}
                </Button>
              </div>
            </div>
            </div>
          )}
        </div>

        <aside
          className={`w-full md:w-[420px] bg-white border-l md:border-l border-t md:border-t-0 border-gray-200 flex flex-col z-30 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] flex-1 min-h-0 overflow-hidden ${
            mobileView === 'list' ? 'flex' : 'hidden'
          } md:flex`}
        >
          <div className="border-b border-gray-200">
            {/* Filter Header - Always visible */}
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                {t.filters}
                {(filters.month || filters.program || locationSearch) && (
                  <span className="bg-[#233dff] text-white text-[8px] px-2 py-0.5 rounded-full">
                    {[filters.month, filters.program, locationSearch].filter(Boolean).length}
                  </span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  filtersCollapsed ? '' : 'rotate-180'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Collapsible Filter Content */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                filtersCollapsed ? 'max-h-0' : 'max-h-[500px]'
              }`}
            >
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4">
                {/* Location Search */}
                <div className="relative group">
                  <input
                    type="text"
                    placeholder={lang === 'es' ? 'Buscar ubicacion...' : 'Search location...'}
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full bg-white border-[1.5px] border-solid border-gray-200 px-4 py-3 rounded-xl text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all pl-11"
                  />
                  <svg
                    className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#233dff] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                {/* Month & Program Filters */}
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={filters.month}
                    onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
                    className="w-full bg-white border-[1.5px] border-solid border-gray-200 px-3 py-3 rounded-xl text-[11px] font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
                  >
                    <option value="">{lang === 'es' ? 'Todos' : 'All Months'}</option>
                    <option value="01">{lang === 'es' ? 'Enero' : 'January'}</option>
                    <option value="02">{lang === 'es' ? 'Febrero' : 'February'}</option>
                    <option value="03">{lang === 'es' ? 'Marzo' : 'March'}</option>
                    <option value="04">{lang === 'es' ? 'Abril' : 'April'}</option>
                    <option value="05">{lang === 'es' ? 'Mayo' : 'May'}</option>
                    <option value="06">{lang === 'es' ? 'Junio' : 'June'}</option>
                    <option value="07">{lang === 'es' ? 'Julio' : 'July'}</option>
                    <option value="08">{lang === 'es' ? 'Agosto' : 'August'}</option>
                    <option value="09">{lang === 'es' ? 'Septiembre' : 'September'}</option>
                    <option value="10">{lang === 'es' ? 'Octubre' : 'October'}</option>
                    <option value="11">{lang === 'es' ? 'Noviembre' : 'November'}</option>
                    <option value="12">{lang === 'es' ? 'Diciembre' : 'December'}</option>
                  </select>
                  <select
                    value={filters.program}
                    onChange={(e) => setFilters((f) => ({ ...f, program: e.target.value }))}
                    className="w-full bg-white border-[1.5px] border-solid border-gray-200 px-3 py-3 rounded-xl text-[11px] font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
                  >
                    <option value="">{lang === 'es' ? 'Todos' : 'All Types'}</option>
                    <option value="Unstoppable Wellness Meetup">
                      {programLabel('Unstoppable Wellness Meetup')}
                    </option>
                    <option value="Unstoppable Workshop">{programLabel('Unstoppable Workshop')}</option>
                    <option value="Community Walk & Run">{programLabel('Community Walk & Run')}</option>
                    <option value="Community Fair">{programLabel('Community Fair')}</option>
                    <option value="Community Wellness">{programLabel('Community Wellness')}</option>
                    <option value="Partner Event">{programLabel('Partner Event')}</option>
                    <option value="Volunteer">{programLabel('Volunteer')}</option>
                  </select>
                </div>

                {/* Upcoming/Past Toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilters((f) => ({ ...f, showPast: false }))}
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all border-[1.5px] border-solid border-gray-200 flex items-center justify-center gap-2 ${
                      !filters.showPast
                        ? 'bg-[#233dff] text-white border-solid border-[#233dff] shadow-md'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${!filters.showPast ? 'bg-white' : 'bg-gray-300'}`}
                    />
                    {t.upcoming}
                  </button>
                  <button
                    onClick={() => setFilters((f) => ({ ...f, showPast: true }))}
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all border-[1.5px] border-solid border-gray-200 flex items-center justify-center gap-2 ${
                      filters.showPast
                        ? 'bg-[#233dff] text-white border-solid border-[#233dff] shadow-md'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${filters.showPast ? 'bg-white' : 'bg-gray-300'}`}
                    />
                    {t.past}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 px-6 border-b border-gray-200 flex justify-between items-center bg-white">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t.showing_events(filteredEvents.length)}
            </p>
            {(filters.month || filters.program || locationSearch) && (
              <button
                onClick={() => {
                  setFilters({ month: '', program: '', showPast: false });
                  setLocationSearch('');
                }}
                className="text-[10px] font-semibold text-[#233dff] uppercase tracking-wide hover:underline"
              >
                {t.clear_filters}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-4 space-y-3 bg-white">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <div
                  key={event.id}
                  ref={(el) => {
                    listRefs.current[event.id] = el;
                  }}
                  onClick={() => handleSelectEvent(event)}
                  className={`group relative p-4 rounded-xl border-[1.5px] border-solid border-gray-200 transition-all cursor-pointer ${
                    selectedEvent?.id === event.id
                      ? 'bg-[#f0f4ff] border-[#233dff] shadow-[0_4px_12px_rgba(35,61,255,0.15)]'
                      : 'bg-white hover:border-[#233dff] hover:shadow-[0_4px_12px_rgba(35,61,255,0.12)]'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: PROGRAM_COLORS[event.program] || PROGRAM_COLORS.default,
                        }}
                      />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: PROGRAM_COLORS[event.program] || PROGRAM_COLORS.default }}
                      >
                        {event.dateDisplay}
                      </span>
                    </div>
                    {event.isPromoted && (
                      <span className="bg-[#233dff] text-white border border-[#233dff] px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider">
                        {lang === 'es' ? 'NUEVO' : 'JUST ADDED'}
                      </span>
                    )}
                    {event.isSponsored && (
                      <span className="bg-[#f0f4ff] text-[#233dff] border border-[#233dff]/30 px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider">
                        {lang === 'es' ? 'PATROCINADO' : 'SPONSORED'}
                      </span>
                    )}
                    {event.saveTheDate && !event.isPromoted && (
                      <span className="bg-[#fff3cd] text-[#856404] border border-[#ffe69c] px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider">
                        {lang === 'es' ? 'POR CONFIRMAR' : 'DETAILS TBD'}
                      </span>
                    )}
                  </div>

                  <h4
                    className={`text-[15px] font-semibold leading-snug mb-2 transition-colors ${
                      selectedEvent?.id === event.id ? 'text-[#233dff]' : 'text-[#1a1a1a]'
                    }`}
                  >
                    {translateEventTitle(event.title, lang, event)}
                  </h4>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 text-xs text-gray-500 font-semibold">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {event.city}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-16 opacity-30">
                <p className="text-base font-semibold text-gray-500 uppercase tracking-wide">
                  {t.no_events}
                </p>
              </div>
            )}
          </div>

          <footer className="p-6 bg-white border-t border-gray-200 text-center shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              &copy; {new Date().getFullYear()} {t.copyright}
              <span className="mx-2">|</span>
              <button
                onClick={() => setIsAdminOpen(true)}
                className="text-gray-400 hover:text-[#233dff] transition-colors"
              >
                ADMIN
              </button>
            </p>
          </footer>
        </aside>
      </main>

      <Suspense fallback={null}>
        {isRSVPOpen && (
          <RSVPModal
            event={selectedEvent}
            lang={lang}
            setLang={setLang}
            onClose={() => setIsRSVPOpen(false)}
            referralCode={referralCode}
          />
        )}

        {isAdminOpen && (
          <AdminModal
            lang={lang}
            events={events}
            onClose={() => setIsAdminOpen(false)}
            onEventsUpdate={handleEventsUpdate}
          />
        )}

        {isPartnerOpen && (
          <PartnerModal
            lang={lang}
            onClose={() => setIsPartnerOpen(false)}
          />
        )}
      </Suspense>

    </div>
  );
};

export default App;
