
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { EVENTS, I18N } from './constants';
import { ClinicEvent, Language } from './types';
import { Button } from './components/Button';
import { RSVPModal } from './components/RSVPModal';

declare const L: any;

const PROGRAM_COLORS: { [key: string]: string } = {
  'Unstoppable Workshop': '#233dff',
  'Unstoppable Wellness Meetup': '#7c3aed',
  'Community Walk & Run': '#059669',
  'Community Fair': '#ea580c',
  'Community Wellness': '#db2777',
  'default': '#4b5563'
};

const isPast = (dateStr: string) => {
  const eventDate = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [selectedEvent, setSelectedEvent] = useState<ClinicEvent | null>(null);
  const [isRSVPOpen, setIsRSVPOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [filters, setFilters] = useState({ month: '', program: '', showPast: false });
  
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const listRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const t = I18N[lang];

  const filteredEvents = useMemo(() => {
    return EVENTS.filter(event => {
      const monthMatch = !filters.month || event.date.includes(`-${filters.month}-`);
      const programMatch = !filters.program || event.program === filters.program;
      
      const locQuery = locationSearch.toLowerCase();
      const locationMatch = !locationSearch || 
        event.city.toLowerCase().includes(locQuery) || 
        event.address.toLowerCase().includes(locQuery);
      
      const eventIsPast = isPast(event.date);
      const archivalMatch = filters.showPast ? eventIsPast : !eventIsPast;
      
      return monthMatch && programMatch && locationMatch && archivalMatch;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filters, locationSearch]);

  useEffect(() => {
    if (selectedEvent && listRefs.current[selectedEvent.id]) {
      listRefs.current[selectedEvent.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!mapRef.current && document.getElementById('map-container')) {
      mapRef.current = L.map('map-container', { zoomControl: false }).setView([33.9719, -118.2108], 10);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(mapRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    filteredEvents.forEach(event => {
      const isSelected = selectedEvent?.id === event.id;
      const color = PROGRAM_COLORS[event.program] || PROGRAM_COLORS['default'];
      
      const icon = L.divIcon({
        className: 'custom-pin',
        html: `
          <div style="transform: translate(-50%, -100%); position: relative; width: ${isSelected ? '44px' : '32px'}; height: ${isSelected ? '54px' : '40px'}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
            <svg viewBox="0 0 32 40" fill="${color}" stroke="black" stroke-width="1.5">
              <path d="M16 2C9.373 2 4 7.373 4 14c0 8 12 26 12 26s12-18 12-26c0-6.627-5.373-12-12-12z" />
              <circle cx="16" cy="14" r="5" fill="white" stroke="black" stroke-width="1" />
            </svg>
          </div>
        `,
        iconSize: [32, 40],
        iconAnchor: [0, 0]
      });

      const marker = L.marker([event.lat, event.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 }).addTo(mapRef.current!);
      marker.on('click', () => setSelectedEvent(event));
      markersRef.current[event.id] = marker;
    });

    if (filteredEvents.length > 0 && !selectedEvent) {
      const group = L.featureGroup(Object.values(markersRef.current));
      mapRef.current.fitBounds(group.getBounds().pad(0.2));
    }
  }, [filteredEvents, selectedEvent]);

  const handleSelectEvent = (e: ClinicEvent) => {
    setSelectedEvent(e);
    mapRef.current?.setView([e.lat, e.lng], 14);
  };

  const handleShare = async () => {
    if (!selectedEvent) return;
    const shareText = `Join us for ${selectedEvent.title} on ${selectedEvent.dateDisplay} @ ${selectedEvent.address}`;
    const shareUrl = "https://www.healthmatters.clinic/events";

    if (navigator.share) {
      try {
        await navigator.share({
          title: selectedEvent.title,
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

  return (
    <div className="flex flex-col h-screen bg-[#f5f3ef] font-['Inter'] selection:bg-[#233dff] selection:text-white">
      <header className="bg-white border-b border-black px-8 py-5 z-50 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-[#1a1a1a] tracking-tight leading-none mb-1">Event Finder</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.15em]">{t.app_subtitle}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-white border-[1px] border-black rounded-full overflow-hidden h-11">
            <button 
              onClick={() => setLang('en')} 
              className={`px-5 py-2 text-[11px] font-black transition-all border-r-[1px] border-black flex items-center gap-2 ${lang === 'en' ? 'bg-[#233dff] text-white' : 'text-gray-900 hover:bg-gray-50'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${lang === 'en' ? 'bg-white' : 'bg-black'}`} />
              EN
            </button>
            <button 
              onClick={() => setLang('es')} 
              className={`px-5 py-2 text-[11px] font-black transition-all flex items-center gap-2 ${lang === 'es' ? 'bg-[#233dff] text-white' : 'text-gray-900 hover:bg-gray-50'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${lang === 'es' ? 'bg-white' : 'bg-black'}`} />
              ES
            </button>
          </div>
          
          <Button variant="primary" className="h-11 px-7" onClick={() => window.open('https://www.healthmatters.clinic/donate')}>
            {t.donate_now}
          </Button>
          <Button variant="outline" className="h-11 px-7" onClick={() => window.open('https://www.healthmatters.clinic/programs')}>
            {t.explore_programs}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 relative bg-[#e5e7eb]">
          <div id="map-container" className="h-full w-full"></div>
          {selectedEvent && (
            <div className="absolute bottom-8 left-8 z-[40] bg-[#f5f3ef] rounded-3xl p-8 w-[400px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border-[1px] border-black/10 animate-in slide-in-from-bottom-8 duration-500">
              <button onClick={() => setSelectedEvent(null)} className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-200 transition-all">✕</button>
              
              <div className="flex items-center gap-2 mb-4">
                 <span className="inline-block bg-white border-[1px] border-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ color: PROGRAM_COLORS[selectedEvent.program] || PROGRAM_COLORS['default'] }}>
                  {selectedEvent.program}
                </span>
                {isPast(selectedEvent.date) && (
                   <span className="inline-block bg-gray-200 text-gray-600 border-[1px] border-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {t.past}
                  </span>
                )}
              </div>

              <h3 className="text-2xl font-black text-[#1a1a1a] mb-6 pr-6 leading-tight">{selectedEvent.title}</h3>
              
              <div className="space-y-6 mb-8">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">When</label>
                  <p className="text-base font-bold text-gray-900 leading-snug">{selectedEvent.dateDisplay}<br/>{selectedEvent.time}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Where</label>
                  <p className="text-sm font-semibold text-gray-700 leading-relaxed">{selectedEvent.address}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {!selectedEvent.saveTheDate && !isPast(selectedEvent.date) ? (
                  <Button onClick={() => setIsRSVPOpen(true)} className="w-full justify-center h-14 text-base">
                    {t.submit_btn}
                  </Button>
                ) : (
                  <div className="bg-gray-200 text-gray-500 rounded-full py-4 text-center text-xs font-black uppercase tracking-widest border-[1px] border-black">
                    {selectedEvent.saveTheDate ? 'Coming Soon' : 'Archived Event'}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="justify-center h-12" onClick={() => mapRef.current?.setView([selectedEvent.lat, selectedEvent.lng], 16)}>
                    View Map
                  </Button>
                  <Button variant="outline" className="justify-center h-12" onClick={handleShare}>
                    Share
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="w-[460px] bg-[#f5f3ef] border-l border-black flex flex-col z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.03)]">
          <div className="p-8 border-b border-black/10 space-y-5">
            <div className="relative group">
              <input 
                type="text"
                placeholder="Search location..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                className="w-full bg-white border-[1px] border-black px-5 py-4 rounded-2xl text-sm font-semibold focus:border-[#233dff] outline-none transition-all pl-12 shadow-sm"
              />
              <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#233dff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <select 
                value={filters.month} 
                onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
                className="w-full bg-white border-[1px] border-black px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest focus:border-[#233dff] outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">All Months</option>
                <option value="12">December</option>
                <option value="01">January</option>
                <option value="02">February</option>
                <option value="03">March</option>
              </select>
              <select 
                value={filters.program} 
                onChange={e => setFilters(f => ({ ...f, program: e.target.value }))}
                className="w-full bg-white border-[1px] border-black px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest focus:border-[#233dff] outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">All Programs</option>
                <option value="Unstoppable Wellness Meetup">Meetups</option>
                <option value="Unstoppable Workshop">Workshops</option>
                <option value="Community Walk & Run">Walk & Run</option>
                <option value="Community Fair">Community Fairs</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setFilters(f => ({ ...f, showPast: false }))}
                className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border-[1px] border-black flex items-center justify-center gap-2 ${!filters.showPast ? 'bg-[#233dff] text-white shadow-md' : 'bg-white text-gray-400 hover:bg-gray-100 shadow-sm'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!filters.showPast ? 'bg-white' : 'bg-gray-300'}`} />
                {t.upcoming}
              </button>
              <button 
                onClick={() => setFilters(f => ({ ...f, showPast: true }))}
                className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border-[1px] border-black flex items-center justify-center gap-2 ${filters.showPast ? 'bg-[#233dff] text-white shadow-md' : 'bg-white text-gray-400 hover:bg-gray-100 shadow-sm'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${filters.showPast ? 'bg-white' : 'bg-gray-300'}`} />
                {t.past}
              </button>
            </div>
          </div>

          <div className="p-4 px-8 border-b border-black/10 flex justify-between items-center bg-[#f5f3ef]">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t.showing_events(filteredEvents.length)}</p>
            {(filters.month || filters.program || locationSearch) && (
              <button onClick={() => { setFilters({ month: '', program: '', showPast: false }); setLocationSearch(''); }} className="text-[10px] font-black text-[#233dff] uppercase tracking-widest hover:underline">
                {t.clear_filters}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-5 bg-[#f5f3ef]">
            {filteredEvents.length > 0 ? filteredEvents.map(event => (
              <div 
                key={event.id}
                ref={el => { listRefs.current[event.id] = el; }}
                onClick={() => handleSelectEvent(event)}
                className={`group relative p-7 rounded-3xl border-[1px] border-black transition-all cursor-pointer ${selectedEvent?.id === event.id ? 'bg-white shadow-[0_15px_40px_rgba(35,61,255,0.12)] -translate-y-1' : 'bg-white hover:border-[#233dff] shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[event.program] || PROGRAM_COLORS['default'] }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: PROGRAM_COLORS[event.program] || PROGRAM_COLORS['default'] }}>{event.dateDisplay}</span>
                  </div>
                  {event.saveTheDate && <span className="bg-yellow-400 text-black border-[1px] border-black px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shadow-sm">SOON</span>}
                </div>
                
                <h4 className={`text-xl font-bold leading-tight mb-4 transition-colors ${selectedEvent?.id === event.id ? 'text-[#233dff]' : 'text-[#1a1a1a]'}`}>
                  {event.title}
                </h4>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 text-xs text-gray-600 font-bold">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {event.city}
                  </div>
                </div>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-16 opacity-30">
                <p className="text-base font-black text-gray-600 uppercase tracking-widest">{t.no_events}</p>
              </div>
            )}
          </div>

          <footer className="p-6 bg-white border-t border-black text-center">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
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
    </div>
  );
};

export default App;
