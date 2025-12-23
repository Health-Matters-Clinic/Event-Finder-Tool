
import React, { useState } from 'react';
import { Button } from './Button';
import { I18N, GOOGLE_APPS_SCRIPT_URL } from '../constants';
import { Language, ClinicEvent, RSVPPayload } from '../types';

interface RSVPModalProps {
  event: ClinicEvent | null;
  lang: Language;
  onClose: () => void;
  setLang: (l: Language) => void;
}

export const RSVPModal: React.FC<RSVPModalProps> = ({ event, lang, onClose, setLang }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [needs, setNeeds] = useState<string[]>([]);
  const [contactMethod, setContactMethod] = useState<'text' | 'email' | 'none'>('text');
  
  const t = I18N[lang];

  if (!event) return null;

  const isToday = () => {
    const today = new Date().toISOString().split('T')[0];
    return event.date === today;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');

    const formData = new FormData(e.currentTarget);
    const payload: RSVPPayload = {
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.dateDisplay,
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      contact_method: contactMethod,
      sms_consent: !!formData.get('sms_consent'),
      needs,
      lang,
      source: isToday() ? 'Live Event Check-In' : 'Planning Ahead RSVP'
    };

    try {
      await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setStatus('success');
      setTimeout(onClose, 2500);
    } catch (error) {
      console.error('Submission error:', error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const toggleNeed = (val: string) => {
    setNeeds(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const getCalendarLink = (type: 'google' | 'outlook' | 'apple') => {
    const title = encodeURIComponent(event.title);
    const details = encodeURIComponent(event.description);
    const loc = encodeURIComponent(event.address);
    const d = event.date.replace(/-/g, '');
    const start = `${d}T120000Z`;
    const end = `${d}T140000Z`;

    if (type === 'google') return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${loc}&dates=${start}/${end}`;
    if (type === 'outlook') return `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&body=${details}&location=${loc}&startdt=${event.date}T12:00:00&enddt=${event.date}T14:00:00`;
    return `data:text/calendar;charset=utf8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ASUMMARY:${title}%0ADESCRIPTION:${details}%0ALOCATION:${loc}%0ADTSTART:${start}%0ADTEND:${end}%0AEND:VEVENT%0AEND:VCALENDAR`;
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#f5f3ef] rounded-[2.5rem] border-[1px] border-black w-full max-w-xl my-auto p-10 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-8 right-8 w-10 h-10 rounded-full border-[1px] border-black flex items-center justify-center text-xl font-bold hover:bg-black hover:text-white transition-all">✕</button>

        <div className="mb-10">
          <h2 className="text-3xl font-black text-[#1a1a1a] leading-tight mb-2">
            {isToday() ? t.qc_title : t.rsvp_title}
          </h2>
          <p className="text-sm font-bold text-[#233dff] uppercase tracking-widest">{event.dateDisplay}</p>
          <p className="mt-4 text-sm font-medium text-gray-600 leading-relaxed">
            {isToday() ? t.qc_intro : t.rsvp_intro}
          </p>
        </div>

        {status === 'success' && (
          <div className="mb-8 p-5 bg-white border-[1px] border-black rounded-3xl text-green-700 text-sm font-black flex items-center gap-3 animate-bounce">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            {t.success_rsvp}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-10">
          {!isToday() && status !== 'success' && (
            <div className="p-6 bg-white border-[1px] border-black rounded-3xl space-y-4 shadow-sm">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{t.add_to_calendar}</label>
              <div className="flex flex-wrap gap-2">
                <a href={getCalendarLink('google')} target="_blank" className="flex-1 min-w-[100px] text-center px-4 py-3 rounded-full border-[1px] border-black text-[9px] font-black uppercase tracking-widest hover:bg-[#233dff] hover:text-white transition-all flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-black group-hover:bg-white" />
                  {t.google_cal}
                </a>
                <a href={getCalendarLink('outlook')} target="_blank" className="flex-1 min-w-[100px] text-center px-4 py-3 rounded-full border-[1px] border-black text-[9px] font-black uppercase tracking-widest hover:bg-[#233dff] hover:text-white transition-all flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-black" />
                  {t.outlook_cal}
                </a>
                <a href={getCalendarLink('apple')} download="event.ics" className="flex-1 min-w-[100px] text-center px-4 py-3 rounded-full border-[1px] border-black text-[9px] font-black uppercase tracking-widest hover:bg-[#233dff] hover:text-white transition-all flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-black" />
                  {t.apple_cal}
                </a>
              </div>
            </div>
          )}

          <section>
            <label className="block text-[11px] font-black uppercase tracking-[0.25em] text-[#1a1a1a] mb-6">{t.q_needs_label}</label>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: 'screening', label: t.needs_screening },
                { id: 'resources', label: t.needs_resources },
                { id: 'both', label: t.needs_both },
                { id: 'goodies', label: t.needs_goodies },
                { id: 'checkin', label: t.needs_checkin },
              ].map(item => (
                <button 
                  key={item.id}
                  type="button"
                  onClick={() => toggleNeed(item.id)}
                  className={`flex gap-4 items-center p-5 rounded-full border-[1px] border-black transition-all text-left group ${needs.includes(item.id) ? 'bg-[#233dff] text-white' : 'bg-white text-gray-900 hover:bg-gray-100 shadow-sm'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${needs.includes(item.id) ? 'bg-white' : 'bg-black'}`} />
                  <span className="text-sm font-bold leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-[#1a1a1a] mb-6">{t.q_contact_label}</label>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                {[
                  { id: 'text', label: t.contact_text },
                  { id: 'email', label: t.contact_email }
                ].map(opt => (
                  <button 
                    key={opt.id} 
                    type="button"
                    onClick={() => setContactMethod(opt.id as any)}
                    className={`flex-1 px-4 py-4 rounded-full border-[1px] border-black text-center text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 ${contactMethod === opt.id ? 'bg-[#233dff] text-white' : 'bg-white text-gray-900 hover:bg-gray-100 shadow-sm'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${contactMethod === opt.id ? 'bg-white' : 'bg-black'}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
              <button 
                type="button"
                onClick={() => setContactMethod('none')}
                className={`w-full px-4 py-4 rounded-full border-[1px] border-black text-center text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 ${contactMethod === 'none' ? 'bg-[#233dff] text-white' : 'bg-white text-gray-900 hover:bg-gray-100 shadow-sm'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${contactMethod === 'none' ? 'bg-white' : 'bg-black'}`} />
                {t.contact_none}
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">{t.q_name_label}</label>
              <input required name="name" type="text" className="w-full px-5 py-4 bg-white border-[1px] border-black rounded-2xl focus:ring-1 focus:ring-[#233dff] outline-none text-sm font-bold shadow-sm" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">{t.q_phone_label}</label>
                <input required name="phone" type="tel" className="w-full px-5 py-4 bg-white border-[1px] border-black rounded-2xl focus:ring-1 focus:ring-[#233dff] outline-none text-sm font-bold shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">{t.q_email_label}</label>
                <input required={!isToday()} name="email" type="email" className="w-full px-5 py-4 bg-white border-[1px] border-black rounded-2xl focus:ring-1 focus:ring-[#233dff] outline-none text-sm font-bold shadow-sm" />
              </div>
            </div>
          </section>

          <section className="bg-white/50 p-6 rounded-3xl border-[1px] border-black/10">
            <label className="flex gap-4 items-start cursor-pointer group">
              <input name="sms_consent" type="checkbox" className="mt-1 w-5 h-5 accent-[#233dff]" />
              <span className="text-[11px] font-bold text-gray-500 leading-relaxed italic group-hover:text-black transition-colors">{t.sms_consent}</span>
            </label>
            <p className="mt-6 text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider leading-relaxed">{t.qc_disclaimer}</p>
          </section>

          <Button type="submit" disabled={loading} className="w-full justify-center h-16 text-lg">
            {loading ? 'Submitting...' : t.submit_btn}
          </Button>
        </form>
      </div>
    </div>
  );
};
