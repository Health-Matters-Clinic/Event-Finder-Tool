import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EVENTS, I18N } from './constants';
import { VOLUNTEER_PORTAL_API_URL, STORAGE_KEYS } from './config';
import { ClinicEvent, Language } from './types';
import { Button } from './components/Button';
import { RSVPModal } from './components/RSVPModal';
import { AdminModal } from './components/AdminModal';
import { translateEventTitle, translateProgram } from './utils/translation';

declare const L: any;

const PROGRAM_COLORS: { [key: string]: string } = {
  'Unstoppable Workshop': '#233dff',
  'Unstoppable Wellness Meetup': '#7c3aed',
  'Community Walk & Run': '#059669',
  'Community Fair': '#ea580c',
  'Community Wellness': '#db2777',
  default: '#4b5563',
};

const DEFAULT_CENTER: [number, number] = [33.9719, -118.2108];

const isPast = (dateStr: string) => {
  const eventDate = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [events, setEvents] = useState<ClinicEvent[]>(EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<ClinicEvent | null>(null);
  const [isRSVPOpen, setIsRSVPOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [filters, setFilters] = useState({ month: '', program: '', showPast: false });
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');

  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<Record<string, any>>({});
  const heatLayerRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const t = I18N[lang];

  // Load events from localStorage or API on mount
  useEffect(() => {
    const loadEvents = async () => {
      // First, try to load from localStorage
      const storedEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (storedEvents) {
        try {
          const parsed = JSON.parse(storedEvents);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvents(parsed);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse stored events:', e);
        }
      }

      // Then, try to fetch from volunteer portal API
      try {
        const response = await fetch(`${VOLUNTEER_PORTAL_API_URL}/events`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setEvents(data);
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(data));
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch events from API:', e);
      }

      // Fall back to hardcoded events
      setEvents(EVENTS);
    };

    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        const monthMatch = !filters.month || event.date.includes(`-${filters.month}-`);
        const programMatch = !filters.program || event.program === filters.program;

        const locQuery = locationSearch.toLowerCase();
        const locationMatch =
          !locationSearch ||
          event.city.toLowerCase().includes(locQuery) ||
          event.address.toLowerCase().includes(locQuery);

        const eventIsPast = isPast(event.date);
        const archivalMatch = filters.showPast ? eventIsPast : !eventIsPast;

        return monthMatch && programMatch && locationMatch && archivalMatch;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        iconAnchor: [0, 0],
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
    const shareText = `${translateEventTitle(selectedEvent.title, lang)} - ${selectedEvent.dateDisplay} @ ${selectedEvent.address}`;
    const shareUrl = 'https://www.healthmatters.clinic/events';

    if (navigator.share) {
      try {
        await navigator.share({
          title: translateEventTitle(selectedEvent.title, lang),
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.warn('Navigator share cancelled or failed', err);
      }
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      alert(t.toast_copied);
    }
  };

  const handleEventsUpdate = (newEvents: ClinicEvent[]) => {
    setEvents(newEvents);
  };

  const programLabel = (program: string) => translateProgram(program, lang);

  return (
    <div className="flex flex-col h-screen bg-[#f5f3ef] font-['Inter'] selection:bg-[#233dff] selection:text-white">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 sm:py-5 z-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-[#1a1a1a] tracking-tight leading-none mb-1">
            Event Finder
          </h1>
          <p className="text-xs text-gray-500 font-semibold tracking-[0.02em]">{t.app_subtitle}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="flex bg-white border-2 border-gray-200 rounded-full overflow-hidden h-11 shadow-sm">
            <button
              onClick={() => setLang('en')}
              className={`px-5 py-2 text-[11px] font-semibold transition-all border-r border-gray-200 flex items-center gap-2 ${
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
              className={`px-5 py-2 text-[11px] font-semibold transition-all flex items-center gap-2 ${
                lang === 'es' ? 'bg-[#233dff] text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${lang === 'es' ? 'bg-white' : 'bg-black'}`}
              />
              ES
            </button>
          </div>

          <Button
            variant="primary"
            className="h-11 px-7"
            onClick={() => window.open('https://www.healthmatters.clinic/donate')}
          >
            {t.donate_now}
          </Button>
          <Button
            variant="outline"
            className="h-11 px-7"
            onClick={() => window.open('https://www.healthmatters.clinic/programs')}
          >
            {t.explore_programs}
          </Button>
          <Button variant="outline" className="h-11 px-7" onClick={() => setIsAdminOpen(true)}>
            Admin
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
            <div className="absolute bottom-4 left-4 right-4 md:bottom-8 md:left-8 md:right-auto z-[40] bg-white rounded-2xl p-6 sm:p-7 md:w-[360px] shadow-[0_12px_40px_rgba(0,0,0,0.16)] border border-gray-200 animate-in slide-in-from-bottom-8 duration-500 max-h-[44vh] md:max-h-none overflow-auto">
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-200 transition-all"
              >
                X
              </button>

              <div className="flex items-center gap-2 mb-4">
                <span
                  className="inline-block bg-[#f0f4ff] border border-[#233dff]/20 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: PROGRAM_COLORS[selectedEvent.program] || PROGRAM_COLORS.default }}
                >
                  {programLabel(selectedEvent.program)}
                </span>
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
              </div>

              <div className="flex flex-col gap-3">
                {!selectedEvent.saveTheDate && !isPast(selectedEvent.date) ? (
                  <Button onClick={() => setIsRSVPOpen(true)} className="w-full justify-center h-12 text-sm">
                    {t.submit_btn}
                  </Button>
                ) : (
                  <div className="bg-gray-100 text-gray-500 rounded-full py-3 text-center text-xs font-semibold uppercase tracking-widest border-2 border-gray-200">
                    {selectedEvent.saveTheDate
                      ? lang === 'es'
                        ? 'Proximamente'
                        : 'Coming Soon'
                      : lang === 'es'
                      ? 'Evento archivado'
                      : 'Archived Event'}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="justify-center h-11"
                    onClick={() => mapRef.current?.setView([selectedEvent.lat, selectedEvent.lng], 16)}
                  >
                    {lang === 'es' ? 'Ver mapa' : 'View Map'}
                  </Button>
                  <Button variant="outline" className="justify-center h-11" onClick={handleShare}>
                    {lang === 'es' ? 'Compartir' : 'Share'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside
          className={`w-full md:w-[420px] bg-white border-l md:border-l border-t md:border-t-0 border-gray-200 flex flex-col z-30 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] h-[52vh] md:h-auto ${
            mobileView === 'list' ? 'flex' : 'hidden'
          } md:flex`}
        >
          <div className="p-4 sm:p-6 border-b border-gray-200 space-y-4 sm:space-y-5">
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

            <div className="grid grid-cols-2 gap-3">
              <select
                value={filters.month}
                onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
                className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
              >
                <option value="">{lang === 'es' ? 'Todos los meses' : 'All Months'}</option>
                <option value="12">{lang === 'es' ? 'Diciembre' : 'December'}</option>
                <option value="01">{lang === 'es' ? 'Enero' : 'January'}</option>
                <option value="02">{lang === 'es' ? 'Febrero' : 'February'}</option>
                <option value="03">{lang === 'es' ? 'Marzo' : 'March'}</option>
              </select>
              <select
                value={filters.program}
                onChange={(e) => setFilters((f) => ({ ...f, program: e.target.value }))}
                className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none appearance-none cursor-pointer"
              >
                <option value="">{lang === 'es' ? 'Todos los programas' : 'All Programs'}</option>
                <option value="Unstoppable Wellness Meetup">
                  {programLabel('Unstoppable Wellness Meetup')}
                </option>
                <option value="Unstoppable Workshop">{programLabel('Unstoppable Workshop')}</option>
                <option value="Community Walk & Run">{programLabel('Community Walk & Run')}</option>
                <option value="Community Fair">{programLabel('Community Fair')}</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilters((f) => ({ ...f, showPast: false }))}
                className={`flex-1 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] transition-all border-2 border-gray-200 flex items-center justify-center gap-2 ${
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
                className={`flex-1 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] transition-all border-2 border-gray-200 flex items-center justify-center gap-2 ${
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
                    {event.saveTheDate && (
                      <span className="bg-[#fff3cd] text-[#856404] border border-[#ffe69c] px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider">
                        {lang === 'es' ? 'PRONTO' : 'SOON'}
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
    </div>
  );
};

export default App;
