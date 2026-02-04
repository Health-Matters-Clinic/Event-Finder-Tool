import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { I18N } from '../constants';
import { GOOGLE_APPS_SCRIPT_URL } from '../config';
import { Language, ClinicEvent, RSVPPayload } from '../types';
import { translateEventTitle } from '../utils/translation';

interface RSVPModalProps {
  event: ClinicEvent | null;
  lang: Language;
  onClose: () => void;
  setLang: (l: Language) => void;
}

type SubmitState = 'idle' | 'submitting' | 'preregistered' | 'checking_in' | 'checked_in' | 'error';

export const RSVPModal: React.FC<RSVPModalProps> = ({ event, lang, onClose, setLang }) => {
  const [state, setState] = useState<SubmitState>('idle');
  const [needs, setNeeds] = useState<string[]>([]);
  const [contactMethod, setContactMethod] = useState<'text' | 'email' | 'none'>('text');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [checkinToken, setCheckinToken] = useState<string>('');

  // Minor exception (allows same guardian email/phone to preregister multiple minors)
  const [isMinor, setIsMinor] = useState<boolean>(false);

  const t = I18N[lang];

  const isToday = useMemo(() => {
    if (!event) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(event.date + 'T00:00:00');
    return d.getTime() === today.getTime();
  }, [event]);

  if (!event) return null;

  const displayTitle = translateEventTitle(event.title, lang);

  const toggleNeed = (val: string) => {
    setNeeds((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  };

  const postJson = async (payload: any) => {
    // Send as URL-encoded form data to avoid CORS
    const formData = new URLSearchParams();
    formData.append('payload', JSON.stringify(payload));

    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        body: formData,
        redirect: 'follow',
      });

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: true };
      }
    } catch (err) {
      // If CORS fails, try no-cors mode (data still gets sent)
      await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData,
      });
      return { success: true };
    }
  };

  const handlePreRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setState('submitting');

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const minorName = String(formData.get('minor_name') || '').trim();
    const smsConsent = !!formData.get('sms_consent');

    // Require either email or phone
    if (!email && !phone) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Por favor incluye un correo electronico o numero de telefono.'
          : 'Please include an email or phone number.'
      );
      return;
    }

    // Minor exception requires a minor name (so dedupe can distinguish)
    if (isMinor && !minorName) {
      setState('error');
      setErrorMsg(
        lang === 'es' ? 'Por favor incluye el nombre del menor.' : "Please include the minor's name."
      );
      return;
    }

    const payload: RSVPPayload = {
      action: 'preregister',
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.dateDisplay,
      name,
      email: email || undefined,
      phone: phone || undefined,
      contact_method: contactMethod,
      sms_consent: smsConsent,
      isMinor,
      minorName: isMinor ? minorName : undefined,
      needs,
      lang,
      source: isToday ? 'Live Event (Pre-register)' : 'Planning Ahead (Pre-register)',
    };

    try {
      const data = await postJson(payload);
      setCheckinToken(String(data.checkinToken || ''));
      setState('preregistered');
    } catch (err: any) {
      setState('error');
      setErrorMsg(err?.message || 'Submission failed');
    }
  };

  const handleCheckIn = async () => {
    if (!checkinToken) return;
    setErrorMsg('');
    setState('checking_in');

    try {
      const data = await postJson({
        action: 'checkin',
        checkinToken,
      });
      setState('checked_in');
      // Optional: auto-close after success
      setTimeout(onClose, 1800);
      return data;
    } catch (err: any) {
      setState('error');
      setErrorMsg(err?.message || 'Check-in failed');
    }
  };

  const getCalendarLink = (type: 'google' | 'outlook' | 'apple') => {
    const title = encodeURIComponent(displayTitle);
    const details = encodeURIComponent(event.description);
    const loc = encodeURIComponent(event.address);
    const d = event.date.replace(/-/g, '');
    const start = `${d}T120000Z`;
    const end = `${d}T140000Z`;

    if (type === 'google') {
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${loc}`;
    }
    if (type === 'outlook') {
      return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${event.date}T12:00:00&enddt=${event.date}T14:00:00&body=${details}&location=${loc}`;
    }
    return `data:text/calendar;charset=utf8,BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${start}
DTEND:${end}
SUMMARY:${decodeURIComponent(title)}
DESCRIPTION:${decodeURIComponent(details)}
LOCATION:${decodeURIComponent(loc)}
END:VEVENT
END:VCALENDAR`;
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'Registro del evento' : 'Event registration'}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#233dff] text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight truncate">{displayTitle}</div>
            <div className="text-[11px] opacity-80">{event.dateDisplay} • {event.time}</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all shrink-0"
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Status */}
          {state === 'error' && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm font-semibold text-red-800">
              {errorMsg || (lang === 'es' ? 'Algo salio mal.' : 'Something went wrong.')}
            </div>
          )}

          {state === 'preregistered' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-3xl mb-1">✓</div>
              <div className="text-base font-bold text-green-900">
                {lang === 'es' ? '¡Registro confirmado!' : "You're registered!"}
              </div>
              <p className="text-xs text-green-700 mt-1">
                {lang === 'es'
                  ? 'Revisa tu correo para los detalles.'
                  : 'Check your email for details.'}
              </p>
              <Button variant="outline" className="h-8 text-xs mt-3" onClick={onClose}>
                {lang === 'es' ? 'Cerrar' : 'Close'}
              </Button>
            </div>
          )}

          {/* Form */}
          {state !== 'preregistered' && state !== 'checked_in' && (
            <form onSubmit={handlePreRegister} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Nombre' : 'Name'} *
                  </label>
                  <input
                    name="name"
                    required
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={lang === 'es' ? 'Tu nombre completo' : 'Your full name'}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Correo' : 'Email'}
                  </label>
                  <input
                    name="email"
                    type="email"
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Telefono' : 'Phone'}
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-500 -mt-1">
                {lang === 'es'
                  ? '* Se requiere correo o telefono'
                  : '* Email or phone required'}
              </p>

              {/* Minor exception */}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                  className="w-4 h-4 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                />
                {lang === 'es' ? 'Registrando a un menor' : 'Registering a minor'}
              </label>

              {isMinor && (
                <input
                  name="minor_name"
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal -mt-1"
                  placeholder={lang === 'es' ? 'Nombre del menor *' : "Minor's name *"}
                />
              )}

              {/* Contact preference */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {lang === 'es' ? 'Contacto:' : 'Contact:'}
                </span>
                {(['text', 'email', 'none'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setContactMethod(method)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      contactMethod === method
                        ? 'bg-[#233dff] text-white border-[#233dff]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#233dff]'
                    }`}
                  >
                    {method === 'text' ? (lang === 'es' ? 'SMS' : 'Text') : method === 'none' ? (lang === 'es' ? 'Ninguno' : 'None') : 'Email'}
                  </button>
                ))}
              </div>

              {/* Consent */}
              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  name="sms_consent"
                  className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                />
                <span>
                  {lang === 'es'
                    ? 'Acepto recibir recordatorios y actualizaciones de Health Matters Clinic.'
                    : 'I consent to receive reminders and updates from Health Matters Clinic.'}
                </span>
              </label>

              {/* Needs */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {lang === 'es' ? 'Necesidades:' : 'Needs:'}
                </span>
                {['Screening', 'Resources', 'Mental Health', 'Insurance', 'Housing'].map((n) => {
                  const active = needs.includes(n);
                  return (
                    <button
                      type="button"
                      key={n}
                      onClick={() => toggleNeed(n)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? 'bg-[#233dff] text-white border-[#233dff]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#233dff]'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  className="h-9 justify-center flex-1"
                  type="submit"
                  disabled={state === 'submitting'}
                >
                  {state === 'submitting' ? '...' : 'RSVP'}
                </Button>
                <Button
                  variant="outline"
                  className="h-9 justify-center text-xs"
                  type="button"
                  onClick={() => window.open(getCalendarLink('google'), '_blank')}
                >
                  + {lang === 'es' ? 'Calendario' : 'Calendar'}
                </Button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
