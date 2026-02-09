import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EVENTS, I18N } from './constants';
import { GOOGLE_APPS_SCRIPT_URL, STORAGE_KEYS } from './config';
import { ClinicEvent, Language } from './types';
import { Button } from './components/Button';
import { RSVPModal } from './components/RSVPModal';
import { AdminModal } from './components/AdminModal';
import { PartnerModal } from './components/PartnerModal';
import { translateEventTitle, translateProgram } from './utils/translation';

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

const isPast = (dateStr: string) => {
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
      // Show cached events immediately so users don't see a blank screen
      try {
        const cached = localStorage.getItem(STORAGE_KEYS.EVENTS_CACHE);
        if (cached) {
          const cachedEvents = JSON.parse(cached);
          if (Array.isArray(cachedEvents) && cachedEvents.length > 0 && isMounted) {
            setEvents(cachedEvents);
          }
        }
      } catch {
        // Ignore parse errors from corrupt cache
      }

      // Fetch fresh data from Google Apps Script in the background
      try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getEvents`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.events) && data.events.length > 0) {
            if (isMounted) {
              setEvents(data.events);
              localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(data.events));
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch events from backend:', e);
      }

      // Fall back to hardcoded events only if backend failed AND no cache was loaded
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

      const foundEvent = events.find(e => {
        // Match by ID (exact or slugified)
        const idSlug = toSlug(e.id);
        if (e.id.toLowerCase() === slugLower || idSlug === slugLower) return true;

        // Match by title slug (unique enough for most events)
        const titleSlug = toSlug(e.title);
        if (titleSlug === slugLower) return true;

        // Match by title+date combo slug (e.g. "community-walk-run-2026-03-14")
        // This handles share URLs that combine title + date for uniqueness
        const eventDate = e.date?.includes('T') ? e.date.split('T')[0] : e.date;
        if (eventDate) {
          const comboSlug = toSlug(`${e.title}-${eventDate}`);
          if (comboSlug === slugLower) return true;
        }

        return false;
      });

      if (foundEvent) {
        // If it's a past event, temporarily enable showPast filter so it appears in the list
        if (isPast(foundEvent.date)) {
          setFilters(f => ({ ...f, showPast: true }));
        }
        setSelectedEvent(foundEvent);
        // Check if URL also has rsvp=true parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('rsvp') === 'true') {
          setIsRSVPOpen(true);
        }
      }
      setPendingEventSlug(null);
    }
  }, [pendingEventSlug, events]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        // Handle both YYYY-MM-DD and ISO date strings
        const dateOnly = event.date.includes('T') ? event.date.split('T')[0] : event.date;
        const monthMatch = !filters.month || dateOnly.includes(`-${filters.month}-`);
        const programMatch = !filters.program || event.program === filters.program;

        const locQuery = locationSearch.toLowerCase();
        const locationMatch =
          !locationSearch ||
          event.city.toLowerCase().includes(locQuery) ||
          event.address.toLowerCase().includes(locQuery);

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
        const dateA = a.date.includes('T') ? a.date.split('T')[0] : a.date;
        const dateB = b.date.includes('T') ? b.date.split('T')[0] : b.date;
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

    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    filteredEvents.forEach((event) => {
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
      const group = L.featureGroup(Object.values(markersRef.current));
      mapRef.current.fitBounds(group.getBounds().pad(0.2));
    }
  }, [filteredEvents, selectedEvent]);

  useEffect(() => {
    if (!mapRef.current) return;

    const points = filteredEvents.map(
      (event) =>
        [event.lat, event.lng, selectedEvent?.id === event.id ? 0.9 : 0.5] as [
          number,
          number,
          number
        ]
    );

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
  }, [filteredEvents, selectedEvent]);

  const handleSelectEvent = (event: ClinicEvent) => {
    setSelectedEvent(event);
    mapRef.current?.setView([event.lat, event.lng], 14);
    if (window.innerWidth < 768) {
      setMobileView('map');
    }
  };

  const handleShare = async () => {
    if (!selectedEvent) return;
    const eventTitle = translateEventTitle(selectedEvent.title, lang);
    const shareText = `${eventTitle} - ${selectedEvent.dateDisplay} @ ${selectedEvent.address}`;

    // Create event-specific share URL using hash-based deep linking
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    let eventSlug: string;
    if (selectedEvent.id.startsWith('event-')) {
      // Unique timestamp-based ID — use directly
      eventSlug = selectedEvent.id;
    } else {
      // Date-based or other ID — combine title + date for a unique, readable slug
      const eventDate = selectedEvent.date?.includes('T') ? selectedEvent.date.split('T')[0] : selectedEvent.date;
      eventSlug = slugify(`${selectedEvent.title}-${eventDate || selectedEvent.id}`);
    }
    const shareUrl = `https://www.healthmatters.clinic/resources/eventfinder?event=${eventSlug}`;

    // Try native share first (Safari, iOS, Android - shows AirDrop, email, copy, etc.)
    if (navigator.share) {
      try {
        await navigator.share({
          title: eventTitle,
          text: shareText,
          url: shareUrl,
        });
        return; // Success, don't fall through
      } catch (err: any) {
        // User cancelled - don't fall through to email
        if (err.name === 'AbortError') {
          return;
        }
        // Other error - fall through to email
        console.warn('Share failed:', err);
      }
    }

    // Fallback for desktop browsers: open email
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(eventTitle)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;
    window.location.href = mailtoUrl;
  };

  const handleEventsUpdate = (newEvents: ClinicEvent[]) => {
    setEvents(newEvents);
  };

  const programLabel = (program: string) => translateProgram(program, lang);

  return (
    <div className="flex flex-col h-screen bg-[#f5f3ef] font-['Inter'] selection:bg-[#233dff] selection:text-white">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 z-[200] relative flex items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <HMCLogo />
          <div className="hidden sm:block">
            <h1 className="text-xl font-bold text-[#1a1a1a] tracking-tight leading-none">
              Event Finder
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-[0.02em]">{t.app_subtitle}</p>
          </div>
        </div>

        {/* Right: Compact buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Toggle */}
          <div className="flex bg-white border-[1.5px] border-black rounded-full overflow-hidden h-9">
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 text-[10px] font-semibold transition-all border-r border-black flex items-center gap-1.5 ${
                lang === 'en' ? 'bg-[#233dff] text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${lang === 'en' ? 'bg-white' : 'bg-black'}`}
              />
              EN
            </button>
            <button
              onClick={() => setLang('es')}
              className={`px-3 py-1.5 text-[10px] font-semibold transition-all flex items-center gap-1.5 ${
                lang === 'es' ? 'bg-[#233dff] text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${lang === 'es' ? 'bg-white' : 'bg-black'}`}
              />
              ES
            </button>
          </div>

          {/* Partner Events Button */}
          <Button
            variant="outline"
            className="h-9 px-4 text-[10px]"
            onClick={() => setIsPartnerOpen(true)}
          >
            {t.partner_events}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setMobileView('map')}
            className={`flex-1 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] border-2 border-gray-200 transition-all flex items-center justify-center gap-2 ${
              mobileView === 'map'
                ? 'bg-[#233dff] text-white border-[#233dff] shadow-md'
                : 'bg-white text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mobileView === 'map' ? 'bg-white' : 'bg-gray-400'
              }`}
            />
            {lang === 'es' ? 'Mapa' : 'Map'}
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`flex-1 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] border-2 border-gray-200 transition-all flex items-center justify-center gap-2 ${
              mobileView === 'list'
                ? 'bg-[#233dff] text-white border-[#233dff] shadow-md'
                : 'bg-white text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mobileView === 'list' ? 'bg-white' : 'bg-gray-400'
              }`}
            />
            {lang === 'es' ? 'Lista' : 'List'}
          </button>
        </div>

        <div
          className={`flex-1 relative bg-[#e8e6e0] h-[48vh] md:h-auto ${
            mobileView === 'map' ? 'block' : 'hidden'
          } md:block`}
        >
          <div ref={mapContainerRef} id="map-container" className="h-full w-full" />
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
                  className="inline-block bg-[#f0f4ff] border border-[#233dff]/20 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: PROGRAM_COLORS[selectedEvent.program] || PROGRAM_COLORS.default }}
                >
                  {programLabel(selectedEvent.program)}
                </span>
                {selectedEvent.isPromoted && (
                  <span className="inline-block bg-[#233dff] text-white border border-[#233dff] px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest">
                    {lang === 'es' ? 'NUEVO' : 'JUST ADDED'}
                  </span>
                )}
                {selectedEvent.isSponsored && (
                  <span className="inline-block bg-[#f0f4ff] text-[#233dff] border border-[#233dff]/30 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest">
                    {lang === 'es' ? 'PATROCINADO' : 'SPONSORED'}
                  </span>
                )}
                {isPast(selectedEvent.date) && (
                  <span className="inline-block bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest">
                    {t.past}
                  </span>
                )}
              </div>

              <h3 className="text-2xl font-semibold text-[#1a1a1a] mb-6 pr-6 leading-tight">
                {translateEventTitle(selectedEvent.title, lang)}
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
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Cuando' : 'When'}
                  </label>
                  <p className="text-base font-bold text-gray-900 leading-snug">
                    {selectedEvent.dateDisplay}
                    <br />
                    {selectedEvent.time}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Donde' : 'Where'}
                  </label>
                  <p className="text-sm font-semibold text-gray-700 leading-relaxed">
                    {selectedEvent.address}
                  </p>
                </div>
                {selectedEvent.websiteUrl && (
                  <a
                    href={selectedEvent.websiteUrl.startsWith('http') ? selectedEvent.websiteUrl : `https://${selectedEvent.websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[#233dff] hover:underline inline-flex items-center gap-1.5"
                  >
                    {lang === 'es' ? 'Mas Informacion' : 'More Info'} ↗
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {!selectedEvent.saveTheDate && !isPast(selectedEvent.date) ? (
                  <Button onClick={() => setIsRSVPOpen(true)} className="w-full justify-center h-12 text-sm">
                    {t.submit_btn}
                  </Button>
                ) : (
                  <div className="bg-gray-100 text-gray-500 rounded-full py-3 text-center text-xs font-semibold uppercase tracking-widest border-2 border-gray-200">
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
                      const d = selectedEvent.date.replace(/-/g, '');
                      const ics = [
                        'BEGIN:VCALENDAR',
                        'VERSION:2.0',
                        'BEGIN:VEVENT',
                        `DTSTART:${d}T120000`,
                        `DTEND:${d}T140000`,
                        `SUMMARY:${selectedEvent.title}`,
                        `LOCATION:${selectedEvent.address}`,
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
                    {lang === 'es' ? 'Compartir' : 'Share'}
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
          className={`w-full md:w-[420px] bg-white border-l md:border-l border-t md:border-t-0 border-gray-200 flex flex-col z-30 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] flex-1 overflow-hidden ${
            mobileView === 'list' ? 'flex' : 'hidden'
          } md:flex`}
        >
          <div className="border-b border-gray-200">
            {/* Filter Header - Always visible */}
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
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
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all pl-11"
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
                    className="w-full bg-white border-2 border-gray-200 px-3 py-3 rounded-xl text-[11px] font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
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
                    className="w-full bg-white border-2 border-gray-200 px-3 py-3 rounded-xl text-[11px] font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
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
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] transition-all border-2 border-gray-200 flex items-center justify-center gap-2 ${
                      !filters.showPast
                        ? 'bg-[#233dff] text-white border-[#233dff] shadow-md'
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
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] transition-all border-2 border-gray-200 flex items-center justify-center gap-2 ${
                      filters.showPast
                        ? 'bg-[#233dff] text-white border-[#233dff] shadow-md'
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.2em]">
              {t.showing_events(filteredEvents.length)}
            </p>
            {(filters.month || filters.program || locationSearch) && (
              <button
                onClick={() => {
                  setFilters({ month: '', program: '', showPast: false });
                  setLocationSearch('');
                }}
                className="text-[10px] font-semibold text-[#233dff] uppercase tracking-widest hover:underline"
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
                  className={`group relative p-4 rounded-xl border-2 border-gray-200 transition-all cursor-pointer ${
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
                        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
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
                    {translateEventTitle(event.title, lang)}
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
                <p className="text-base font-semibold text-gray-500 uppercase tracking-widest">
                  {t.no_events}
                </p>
              </div>
            )}
          </div>

          <footer className="p-6 bg-white border-t border-gray-200 text-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-[0.2em]">
              &copy; {new Date().getFullYear()} {t.copyright}
              <span className="mx-2">|</span>
              <button
                onClick={() => setIsAdminOpen(true)}
                className="text-gray-400 hover:text-[#233dff] transition-colors"
              >
                Admin
              </button>
            </p>
          </footer>
        </aside>
      </main>

      {isRSVPOpen && (
        <RSVPModal
          event={selectedEvent}
          lang={lang}
          setLang={setLang}
          onClose={() => setIsRSVPOpen(false)}
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

    </div>
  );
};

export default App;
