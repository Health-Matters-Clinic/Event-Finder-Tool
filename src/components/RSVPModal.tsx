import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { I18N, GOOGLE_APPS_SCRIPT_URL } from '../constants';
import { Language, ClinicEvent, RSVPPayload } from '../types';

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
    today.setHours(0,0,0,0);
    const d = new Date(event.date + "T00:00:00");
    return d.getTime() === today.getTime();
  }, [event]);

  if (!event) return null;

  const toggleNeed = (val: string) => {
    setNeeds(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const postJson = async (payload: any) => {
    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false || data.ok === false) {
      const msg = data.error || data.details || 'Request failed';
      throw new Error(msg);
    }
    return data;
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
      setErrorMsg(lang === 'es'
        ? 'Por favor incluye un correo electrónico o número de teléfono.'
        : 'Please include an email or phone number.');
      return;
    }

    // Minor exception requires a minor name (so dedupe can distinguish)
    if (isMinor && !minorName) {
      setState('error');
      setErrorMsg(lang === 'es'
        ? 'Por favor incluye el nombre del menor.'
        : 'Please include the minor\'s name.');
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
      source: isToday ? 'Live Event (Pre-register)' : 'Planning Ahead (Pre-register)'
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
        checkinToken
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
    const title = encodeURIComponent(event.title);
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'Registro del evento' : 'Event registration'}
    >
      <div
        className="w-full max-w-xl bg-[#f5f3ef] rounded-3xl border border-black shadow-[0_30px_80px_rgba(0,0,0,0.25)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-black p-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
              {lang === 'es' ? 'Registro' : 'Registration'}
            </div>
            <div className="text-xl font-black text-[#1a1a1a] leading-tight mt-1">
              {event.title}
            </div>
            <div className="text-sm font-bold text-gray-600 mt-2">
              {event.dateDisplay} • {event.time}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-200 transition-all"
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Language toggle (optional in modal) */}
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
              {lang === 'es' ? 'Idioma' : 'Language'}
            </div>
            <div className="flex bg-white border border-black rounded-full overflow-hidden h-10">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-4 text-[11px] font-black border-r border-black ${lang === 'en' ? 'bg-[#233dff] text-white' : 'text-gray-900 hover:bg-gray-50'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('es')}
                className={`px-4 text-[11px] font-black ${lang === 'es' ? 'bg-[#233dff] text-white' : 'text-gray-900 hover:bg-gray-50'}`}
              >
                ES
              </button>
            </div>
          </div>

          {/* Status */}
          {state === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm font-semibold text-red-800">
              {errorMsg || (lang === 'es' ? 'Algo salió mal.' : 'Something went wrong.')}
            </div>
          )}

          {state === 'preregistered' && (
            <div className="bg-white border border-black rounded-2xl p-5 space-y-3">
              <div className="text-base font-black text-[#1a1a1a]">
                {lang === 'es' ? '¡Listo! Estás pre-registrado.' : 'You’re pre-registered.'}
              </div>
              <div className="text-sm font-semibold text-gray-700 leading-relaxed">
                {lang === 'es'
                  ? 'Cuando llegues al evento, usa el botón de Check-in. El check-in se habilita el día del evento.'
                  : 'When you arrive onsite, use the Check-in button. Check-in opens on the event day.'}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="h-12 justify-center"
                  onClick={handleCheckIn}
                  disabled={state === 'checking_in'}
                >
                  {state === 'checking_in'
                    ? (lang === 'es' ? 'Registrando…' : 'Checking in…')
                    : (lang === 'es' ? 'Check-in al llegar' : 'Check in when you arrive')}
                </Button>

                <Button
                  variant="outline"
                  className="h-12 justify-center"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(checkinToken);
                      alert(lang === 'es' ? 'Token copiado.' : 'Token copied.');
                    } catch {}
                  }}
                >
                  {lang === 'es' ? 'Copiar token' : 'Copy token'}
                </Button>
              </div>
            </div>
          )}

          {state === 'checked_in' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm font-semibold text-green-900">
              {lang === 'es' ? '✅ Check-in completado. ¡Bienvenido!' : '✅ Check-in complete. Welcome!'}
            </div>
          )}

          {/* Form */}
          {state !== 'preregistered' && state !== 'checked_in' && (
            <form onSubmit={handlePreRegister} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Nombre' : 'Name'}
                  </label>
                  <input
                    name="name"
                    required
                    className="w-full bg-white border border-black px-4 py-3 rounded-2xl text-base font-semibold focus:border-[#233dff] outline-none transition-all"
                    placeholder={lang === 'es' ? 'Tu nombre' : 'Your name'}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Correo electrónico (opcional)' : 'Email (optional)'}
                  </label>
                  <input
                    name="email"
                    type="email"
                    className="w-full bg-white border border-black px-4 py-3 rounded-2xl text-base font-semibold focus:border-[#233dff] outline-none transition-all"
                    placeholder="name@email.com"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Teléfono (opcional)' : 'Phone (optional)'}
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    className="w-full bg-white border border-black px-4 py-3 rounded-2xl text-base font-semibold focus:border-[#233dff] outline-none transition-all"
                    placeholder={lang === 'es' ? 'Ej: 3235550123' : 'Ex: 3235550123'}
                  />
                </div>
              </div>

              {/* Minor exception */}
              <div className="bg-white border border-black rounded-2xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-black text-[#1a1a1a]">
                      {lang === 'es' ? 'Estoy registrando a un menor' : "I'm registering a minor"}
                    </div>
                    <div className="text-xs font-semibold text-gray-600 mt-1">
                      {lang === 'es'
                        ? 'Esto permite registrar más de una persona con el mismo correo/teléfono.'
                        : 'This allows more than one preregistration under the same email/phone.'}
                    </div>
                  </div>
                </label>

                {isMinor && (
                  <div className="mt-4">
                    <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                      {lang === 'es' ? 'Nombre del menor' : "Minor's name"}
                    </label>
                    <input
                      name="minor_name"
                      className="w-full bg-[#fbfbfd] border border-black px-4 py-3 rounded-2xl text-base font-semibold focus:border-[#233dff] outline-none transition-all"
                      placeholder={lang === 'es' ? 'Nombre y apellido' : 'First and last name'}
                    />
                  </div>
                )}
              </div>

              {/* Contact method (collection only) */}
              <div className="bg-white border border-black rounded-2xl p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
                  {lang === 'es' ? 'Preferencia de contacto' : 'Contact preference'}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button type="button"
                    onClick={() => setContactMethod('text')}
                    className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] border border-black ${contactMethod === 'text' ? 'bg-[#233dff] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {lang === 'es' ? 'SMS' : 'Text'}
                  </button>
                  <button type="button"
                    onClick={() => setContactMethod('email')}
                    className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] border border-black ${contactMethod === 'email' ? 'bg-[#233dff] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Email
                  </button>
                  <button type="button"
                    onClick={() => setContactMethod('none')}
                    className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] border border-black ${contactMethod === 'none' ? 'bg-[#233dff] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {lang === 'es' ? 'Ninguno' : 'None'}
                  </button>
                </div>

                <label className="flex items-center gap-3 mt-4 text-sm font-semibold text-gray-700">
                  <input type="checkbox" name="sms_consent" className="h-4 w-4" />
                  {lang === 'es'
                    ? 'Acepto recibir mensajes de texto (si proporcioné un teléfono).'
                    : 'I consent to SMS (if I provided a phone).'}
                </label>

                <div className="text-xs font-semibold text-gray-500 mt-3 leading-relaxed">
                  {lang === 'es'
                    ? 'Nota: los recordatorios por email/SMS se configuran por separado (Flodesk/Twilio).'
                    : 'Note: email/SMS reminders are configured separately (Flodesk/Twilio).'}
                </div>
              </div>

              {/* Needs (keep your existing list labels, translated via I18N if present) */}
              <div className="bg-white border border-black rounded-2xl p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
                  {lang === 'es' ? 'Necesidades (opcional)' : 'Needs (optional)'}
                </div>

                <div className="flex flex-wrap gap-2">
                  {['Health Screening', 'Resources', 'Mental Health', 'Insurance', 'Housing'].map((n) => {
                    const active = needs.includes(n);
                    return (
                      <button
                        type="button"
                        key={n}
                        onClick={() => toggleNeed(n)}
                        className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.18em] border border-black transition-all
                          ${active ? 'bg-[#233dff] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="h-12 justify-center"
                  type="submit"
                  disabled={state === 'submitting'}
                >
                  {state === 'submitting'
                    ? (lang === 'es' ? 'Enviando…' : 'Submitting…')
                    : (lang === 'es' ? 'Pre-registrarme' : 'Pre-register')}
                </Button>

                <Button
                  variant="outline"
                  className="h-12 justify-center"
                  type="button"
                  onClick={() => window.open(getCalendarLink('google'), '_blank')}
                >
                  {lang === 'es' ? 'Agregar al calendario' : 'Add to calendar'}
                </Button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="bg-white border-t border-black p-5 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
            {lang === 'es' ? 'Health Matters Clinic' : 'Health Matters Clinic'}
          </div>
        </div>
      </div>
    </div>
  );
};
