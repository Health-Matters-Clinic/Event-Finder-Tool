import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { I18N } from '../constants';
import { GOOGLE_APPS_SCRIPT_URL, PORTAL_API_URL, RECAPTCHA_SITE_KEY } from '../config';
import { Language, ClinicEvent, RSVPPayload } from '../types';
import { translateEventTitle } from '../utils/translation';

interface RSVPModalProps {
  event: ClinicEvent | null;
  lang: Language;
  onClose: () => void;
  setLang: (l: Language) => void;
  referralCode?: string | null;
}

type SubmitState = 'idle' | 'submitting' | 'preregistered' | 'checking_in' | 'checked_in' | 'error';

export const RSVPModal: React.FC<RSVPModalProps> = ({ event, lang, onClose, setLang, referralCode }) => {
  const [state, setState] = useState<SubmitState>('idle');
  const [needs, setNeeds] = useState<string[]>([]);
  const [contactMethods, setContactMethods] = useState<Set<string>>(new Set([]));
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(0);

  const [checkinToken, setCheckinToken] = useState<string>('');
  const [submittedEmail, setSubmittedEmail] = useState<string>('');
  const [tshirtSize, setTshirtSize] = useState<string>('');

  // Minor exception (allows same guardian email/phone to preregister multiple minors)
  const [isMinor, setIsMinor] = useState<boolean>(false);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [waitlistedSessions, setWaitlistedSessions] = useState<Record<string, { position: number; token: string }>>({});
  const [waitlistLoading, setWaitlistLoading] = useState<string | null>(null);

  const t = I18N[lang];

  const UNSTOPPABLE_EVENT_IDS = ['event-1773943614235', 'event-1772063101013', 'event-1772064063990'];
  const isUnstoppableEvent = useMemo(() => {
    if (!event) return false;
    return UNSTOPPABLE_EVENT_IDS.includes(event.id) || event.title.toLowerCase().includes('unstoppable');
  }, [event]);

  const isEarlyRegistrant = useMemo(() => {
    // Registrations before May 2, 2026 qualify for on-site tee pickup
    return new Date() < new Date('2026-05-02T00:00:00');
  }, []);

  const isToday = useMemo(() => {
    if (!event) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(event.date + 'T00:00:00');
    return d.getTime() === today.getTime();
  }, [event]);

  if (!event) return null;

  const displayTitle = translateEventTitle(event.title, lang, event);

  // Analytics: RSVP modal opened
  React.useEffect(() => {
    try {
      const gtag = (window as any).gtag;
      if (gtag) gtag('event', 'rsvp_modal_open', { event_id: event.id, event_title: event.title });
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNeed = (val: string) => {
    setNeeds((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  };

  const getRecaptchaToken = async (): Promise<string> => {
    try {
      const grecaptcha = (window as any).grecaptcha;
      if (!grecaptcha) return '';
      return await new Promise<string>((resolve) => {
        grecaptcha.ready(() => {
          grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'rsvp' }).then(resolve).catch(() => resolve(''));
        });
      });
    } catch {
      return '';
    }
  };

  const postJson = async (payload: any): Promise<{ success: boolean; checkinToken?: string }> => {
    const recaptchaToken = await getRecaptchaToken();

    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, Array.isArray(value) ? value.join(',') : String(value));
      }
    });
    if (recaptchaToken) params.append('recaptchaToken', recaptchaToken);

    // Fire-and-forget portal dual-write (Firestore + volunteer matching) — does not block submission
    if (payload.action === 'preregister' || !payload.action) {
      fetch(`${PORTAL_API_URL}/api/public/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: payload.eventId,
          eventTitle: payload.eventTitle,
          eventDate: payload.eventDate,
          name: payload.name,
          email: payload.email || '',
          phone: payload.phone || '',
          needs: Array.isArray(payload.needs) ? payload.needs.join(', ') : (payload.needs || ''),
          source: payload.source || 'Event Finder',
          lang: payload.lang,
          referralCode: payload.referralCode,
          sessionIds: payload.sessionIds,
          tshirtSize: payload.tshirtSize,
          earlyRegistrant: payload.earlyRegistrant,
          isMinor: payload.isMinor,
          minorName: payload.minorName,
          contactPreference: payload.contact_method,
          sms_consent: payload.sms_consent,
          guests: payload.guests,
        }),
      }).catch(() => {}); // never block on portal failure
    }

    // Primary write: Google Apps Script — writes to Sheet + sends confirmation email
    try {
      const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      let checkinToken: string | undefined;
      try { checkinToken = (await response.json()).checkinToken; } catch {}
      return { success: true, checkinToken };
    } catch {
      // GAS unreachable — portal already wrote to Firestore above, so treat as success
      return { success: true };
    }
  };

  const handleJoinWaitlist = async (sessionId: string, sessionTitle: string) => {
    if (!event) return;
    // Get name/email/phone from the form if it exists
    const form = document.querySelector('form') as HTMLFormElement | null;
    const firstName = form ? String(new FormData(form).get('firstName') || '').trim() : '';
    const lastName = form ? String(new FormData(form).get('lastName') || '').trim() : '';
    const name = [firstName, lastName].filter(Boolean).join(' ');
    const email = form ? String(new FormData(form).get('email') || '').trim() : '';
    const phone = form ? String(new FormData(form).get('phone') || '').trim() : '';

    if (!name) {
      setErrorMsg(lang === 'es' ? 'Por favor ingresa tu nombre primero' : 'Please enter your name first');
      return;
    }
    if (!email && !phone) {
      setErrorMsg(lang === 'es' ? 'Necesitamos tu email o teléfono para notificarte' : 'We need your email or phone to notify you');
      return;
    }

    setWaitlistLoading(sessionId);
    setErrorMsg('');
    try {
      const params = new URLSearchParams({
        action: 'joinWaitlist',
        eventId: event.id,
        eventTitle: event.title,
        sessionId,
        sessionTitle,
        name, email, phone,
        contact_method: email ? 'email' : 'text',
        lang,
      });
      const resp = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`);
      const data = await resp.json();
      if (data.success) {
        setWaitlistedSessions(prev => ({ ...prev, [sessionId]: { position: data.position, token: data.token } }));
      } else {
        setErrorMsg(data.error || 'Failed to join waitlist');
      }
    } catch {
      setErrorMsg(lang === 'es' ? 'Error al unirse a la lista de espera' : 'Failed to join waitlist');
    } finally {
      setWaitlistLoading(null);
    }
  };

  const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handlePreRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setState('submitting');

    const formData = new FormData(e.currentTarget);
    const firstName = String(formData.get('firstName') || '').trim();
    const lastName = String(formData.get('lastName') || '').trim();
    const name = `${firstName} ${lastName}`.trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const minorName = String(formData.get('minor_name') || '').trim();
    const smsConsent = !!formData.get('sms_consent');

    const wantsText = contactMethods.has('text');
    const wantsEmail = contactMethods.has('email');

    // Validate phone format if provided or required
    if (phone && !phoneRegex.test(phone)) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Por favor ingresa un número de teléfono válido (10 dígitos).'
          : 'Please enter a valid phone number (10 digits).'
      );
      return;
    }

    // Validate email format if provided or required
    if (email && !emailRegex.test(email)) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Por favor ingresa un correo electrónico válido.'
          : 'Please enter a valid email address.'
      );
      return;
    }

    // Text selected → phone required
    if (wantsText && !phone) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Se requiere número de teléfono para recibir mensajes de texto.'
          : 'Phone number is required for text reminders.'
      );
      return;
    }

    // Email selected → both email AND phone required
    if (wantsEmail && !email) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Se requiere correo electrónico para recibir confirmación por email.'
          : 'Email address is required for email confirmation.'
      );
      return;
    }
    if (wantsEmail && !phone) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'También se requiere número de teléfono cuando seleccionas confirmación por email.'
          : 'Phone number is also required when email confirmation is selected.'
      );
      return;
    }

    // SMS consent required when text contact selected
    if (wantsText && !smsConsent) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Por favor marca la casilla de consentimiento SMS para recibir recordatorios de texto.'
          : 'Please check the SMS consent box to receive text reminders.'
      );
      return;
    }

    // Email required — it's the only way to deliver the check-in link
    if (!email) {
      setState('error');
      setErrorMsg(
        lang === 'es'
          ? 'Se requiere correo electrónico para enviarte tu enlace de check-in.'
          : 'Email is required so we can send your check-in link.'
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
      eventDateISO: event.date,
      eventTime: event.time,
      eventAddress: event.address || undefined,
      eventCity: event.city ? `${event.city}, CA` : undefined,
      name,
      email: email || undefined,
      phone: phone || undefined,
      contact_method: (contactMethods.size === 0 ? 'none' : Array.from(contactMethods)[0]) as 'text' | 'email' | 'none',
      sms_consent: smsConsent,
      isMinor,
      minorName: isMinor ? minorName : undefined,
      needs,
      lang,
      source: isToday ? 'Live Event (Pre-register)' : 'Planning Ahead (Pre-register)',
      referralCode: referralCode || undefined,
      sessionIds: selectedSessions.length > 0 ? selectedSessions : undefined,
      tshirtSize: isUnstoppableEvent && tshirtSize ? tshirtSize : undefined,
      earlyRegistrant: isUnstoppableEvent && isEarlyRegistrant ? true : undefined,
      guests: guestCount > 0 ? guestCount : undefined,
      accessibilityNeeds: accessibilityNeeds.trim() || undefined,
    };

    // Analytics: RSVP form submitted
    try {
      const gtag = (window as any).gtag;
      if (gtag) gtag('event', 'rsvp_submit', { event_id: event.id, event_title: event.title });
    } catch {}

    try {
      const data = await postJson(payload);

      // Analytics: RSVP confirmed
      try {
        const gtag = (window as any).gtag;
        if (gtag) gtag('event', 'rsvp_confirmed', { event_id: event.id, event_title: event.title });
      } catch {}

      setCheckinToken(String(data.checkinToken || ''));
      setSubmittedEmail(email);
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

  const downloadICS = () => {
    const dateStr = event.date || ''; // YYYY-MM-DD
    const parseTimeMinutes = (timeStr: string): number => {
      // Returns total minutes from midnight (local PT time)
      if (!timeStr || timeStr === 'TBD') return 12 * 60;
      const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
      if (!match) return 12 * 60;
      let hours = parseInt(match[1]);
      const mins = match[2] ? parseInt(match[2]) : 0;
      const ampm = (match[3] || '').toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return hours * 60 + mins;
    };

    const toUtcICS = (localDateStr: string, localMinutes: number): string => {
      // PDT = UTC-7; convert local PT minutes to UTC by adding 7 hours (420 minutes)
      const PDT_OFFSET_MINUTES = 7 * 60;
      const utcMinutes = localMinutes + PDT_OFFSET_MINUTES;
      const [year, month, day] = localDateStr.split('-').map(Number);
      // Build a date to handle day rollover
      const base = new Date(Date.UTC(year, month - 1, day, 0, utcMinutes));
      const y = base.getUTCFullYear();
      const mo = String(base.getUTCMonth() + 1).padStart(2, '0');
      const d = String(base.getUTCDate()).padStart(2, '0');
      const h = String(base.getUTCHours()).padStart(2, '0');
      const mi = String(base.getUTCMinutes()).padStart(2, '0');
      return `${y}${mo}${d}T${h}${mi}00Z`;
    };

    const parts = (event.time || '').split(/[-–]/);
    const startMins = parseTimeMinutes(parts[0]?.trim() || '');
    const endMins = parts[1]
      ? parseTimeMinutes(parts[1].trim())
      : startMins + 120;

    const start = toUtcICS(dateStr, startMins);
    const end = toUtcICS(dateStr, endMins);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Health Matters Clinic//Event Finder//EN',
      'BEGIN:VEVENT',
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${displayTitle}`,
      `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${event.address || ''}`,
      `UID:${event.id}@healthmatters.clinic`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
      window.open('data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent));
    } else {
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${displayTitle.replace(/[^a-z0-9]/gi, '-')}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
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
            {referralCode && (
              <p className="text-[10px] text-gray-400 mt-1">
                {lang === 'es' ? 'Referido por' : 'Referred by'} {referralCode}
              </p>
            )}
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
              <div className="text-2xl mb-1">✓</div>
              <div className="text-base font-bold text-green-900">
                {lang === 'es' ? '¡Registro confirmado!' : "You're registered!"}
              </div>
              <p className="text-xs text-green-700 mt-1">
                {lang === 'es'
                  ? submittedEmail
                    ? 'Revisa tu correo — te enviamos tu confirmación con una invitación de calendario adjunta.'
                    : 'Todo listo. Te contactaremos por texto con los detalles del evento.'
                  : submittedEmail
                  ? 'Check your email — we sent your confirmation with a calendar invite attached.'
                  : "You're all set! We'll reach out by text with event details."}
              </p>
              <div className="flex gap-2 mt-3 justify-center">
                <Button variant="outline" className="h-8" onClick={downloadICS}>
                  {lang === 'es' ? 'Guardar en Calendario' : 'Save to Calendar'}
                </Button>
                <Button variant="outline" className="h-8" onClick={onClose}>
                  {lang === 'es' ? 'Cerrar' : 'Close'}
                </Button>
              </div>
            </div>
          )}

          {/* Form */}
          {state !== 'preregistered' && state !== 'checked_in' && (
            <form onSubmit={handlePreRegister} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rsvp-firstName" className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Nombre' : 'First Name'} *
                  </label>
                  <input
                    id="rsvp-firstName"
                    name="firstName"
                    required
                    autoComplete="given-name"
                    style={{ fontSize: '16px' }}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={lang === 'es' ? 'Nombre' : 'First'}
                  />
                </div>
                <div>
                  <label htmlFor="rsvp-lastName" className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Apellido' : 'Last Name'} *
                  </label>
                  <input
                    id="rsvp-lastName"
                    name="lastName"
                    required
                    autoComplete="family-name"
                    style={{ fontSize: '16px' }}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={lang === 'es' ? 'Apellido' : 'Last'}
                  />
                </div>

                <div>
                  <label htmlFor="rsvp-email" className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Correo' : 'Email'}
                    {contactMethods.has('email') && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    id="rsvp-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    style={{ fontSize: '16px' }}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="rsvp-phone" className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Teléfono' : 'Phone'}
                    {(contactMethods.has('text') || contactMethods.has('email')) && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    id="rsvp-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    style={{ fontSize: '16px' }}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-500 -mt-1">
                {lang === 'es'
                  ? contactMethods.has('email')
                    ? '* Seleccionaste Email: se requieren correo y teléfono'
                    : contactMethods.has('text')
                    ? '* Seleccionaste Texto: se requiere teléfono'
                    : '* Se requiere correo o teléfono'
                  : contactMethods.has('email')
                  ? '* Email selected: email and phone both required'
                  : contactMethods.has('text')
                  ? '* Text selected: phone required'
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
                  required
                  aria-label={lang === 'es' ? 'Nombre del menor' : "Minor's name"}
                  style={{ fontSize: '16px' }}
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal -mt-1"
                  placeholder={lang === 'es' ? 'Nombre del menor *' : "Minor's name *"}
                />
              )}

              {/* Contact preference — can pick both */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {lang === 'es' ? 'Contacto:' : 'Contact:'}
                </span>
                {(['text', 'email'] as const).map((method) => {
                  const active = contactMethods.has(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setContactMethods(prev => {
                          const next = new Set(prev);
                          if (active) { next.delete(method); } else { next.add(method); }
                          return next;
                        });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        active
                          ? 'bg-[#233dff] text-white border-[#233dff]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#233dff]'
                      }`}
                    >
                      {method === 'text' ? (lang === 'es' ? 'SMS' : 'Text') : 'Email'}
                    </button>
                  );
                })}
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

              {/* T-shirt size — Unstoppable events, early registrants only (before May 2) */}
              {isUnstoppableEvent && isEarlyRegistrant && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Talla de camiseta (gratis para los primeros registrados)' : 'T-Shirt Size (free for early registrants)'}
                  </label>
                  <select
                    value={tshirtSize}
                    onChange={(e) => setTshirtSize(e.target.value)}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all text-gray-700"
                  >
                    <option value="">{lang === 'es' ? 'Seleccionar talla' : 'Select size'}</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="2XL">2XL</option>
                    <option value="3XL">3XL</option>
                  </select>
                  {isEarlyRegistrant && (
                    <p className="text-[10px] text-[#233dff] font-semibold mt-1">
                      {lang === 'es'
                        ? 'Registrado antes del 2 de mayo — elegible para recoger camiseta en el evento'
                        : 'Registered before May 2 — eligible for on-site tee pickup'}
                    </p>
                  )}
                </div>
              )}

              {/* Needs — optional, used only to help HMC staff support you */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {lang === 'es' ? 'Estoy aquí para (opcional):' : "I'm here for (optional):"}
                </span>
                {([
                  ['Screening',     'Evaluación'],
                  ['Resources',     'Recursos'],
                  ['Mental Health', 'Salud Mental'],
                  ['Insurance',     'Seguro'],
                  ['Housing',       'Vivienda'],
                  ['Volunteer',     'Voluntario'],
                ] as [string, string][]).map(([en, es]) => {
                  const value = en; // always store English value for backend consistency
                  const label = lang === 'es' ? es : en;
                  const active = needs.includes(value);
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => toggleNeed(value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? 'bg-[#233dff] text-white border-[#233dff]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#233dff]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {needs.length > 0 && (
                <p className="text-[9px] text-gray-400 -mt-1 leading-relaxed">
                  {lang === 'es'
                    ? 'Esta información es confidencial y solo se comparte con el personal de Health Matters Clinic para apoyarte en el evento.'
                    : 'This information is confidential and shared only with Health Matters Clinic staff to support you at the event.'}
                </p>
              )}

              {/* Guests */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 shrink-0">
                  {lang === 'es' ? 'Personas adicionales:' : 'Bringing guests:'}
                </span>
                <select
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  className="bg-white border-2 border-gray-200 px-2 py-1 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none transition-all text-gray-700"
                >
                  {[0,1,2,3,4,5,6,7,8,9].map(n => (
                    <option key={n} value={n}>{n === 0 ? (lang === 'es' ? 'Solo yo' : 'Just me') : `+${n}`}</option>
                  ))}
                </select>
              </div>

              {/* Accessibility needs */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {lang === 'es' ? 'Necesidades de accesibilidad (opcional):' : 'Accessibility needs (optional):'}
                </label>
                <input
                  type="text"
                  value={accessibilityNeeds}
                  onChange={(e) => setAccessibilityNeeds(e.target.value)}
                  placeholder={lang === 'es' ? 'p. ej. silla de ruedas, intérprete de ASL...' : 'e.g. wheelchair access, ASL interpreter...'}
                  style={{ fontSize: '16px' }}
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:text-sm"
                />
                {accessibilityNeeds.trim() && (
                  <p className="text-[9px] text-[#233dff] font-semibold mt-1">
                    {lang === 'es'
                      ? 'Tu solicitud se enviará al coordinador del evento.'
                      : 'Your request will be sent to the event coordinator.'}
                  </p>
                )}
              </div>

              {/* Session picker */}
              {event?.sessions && Array.isArray(event.sessions) && event.sessions.length > 0 && (
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    {lang === 'es' ? 'Selecciona actividades' : 'Select activities'}
                    <span className="text-gray-300 normal-case"> ({lang === 'es' ? 'opcional' : 'optional'})</span>
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {event.sessions.map(session => {
                      const isFull = session.capacity ? (session.rsvpCount || 0) >= session.capacity : false;
                      const isSelected = selectedSessions.includes(session.id);
                      const isWaitlisted = waitlistedSessions[session.id];
                      const isWaitlistLoading = waitlistLoading === session.id;
                      const spotsLeft = session.capacity ? session.capacity - (session.rsvpCount || 0) : null;

                      if (isWaitlisted) {
                        return (
                          <div key={session.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border-2 border-amber-300 bg-amber-50">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800">{session.title}</p>
                              <p className="text-[10px] text-gray-500">{session.time}{session.instructor ? ` · ${session.instructor}` : ''}</p>
                            </div>
                            <span className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              {lang === 'es' ? `Lista #${isWaitlisted.position}` : `Waitlist #${isWaitlisted.position}`}
                            </span>
                          </div>
                        );
                      }

                      if (isFull) {
                        return (
                          <div key={session.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border-2 border-gray-200 bg-gray-50">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800">{session.title}</p>
                              <p className="text-[10px] text-gray-500">{session.time}{session.instructor ? ` · ${session.instructor}` : ''}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                                {lang === 'es' ? 'Lleno' : 'Full'}
                              </span>
                              <button
                                type="button"
                                disabled={isWaitlistLoading}
                                onClick={() => handleJoinWaitlist(session.id, session.title)}
                                className="text-[9px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-50"
                              >
                                {isWaitlistLoading
                                  ? (lang === 'es' ? 'Uniendo...' : 'Joining...')
                                  : (lang === 'es' ? 'Lista de espera' : 'Join Waitlist')}
                                {session.waitlistCount ? ` (${session.waitlistCount})` : ''}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <label key={session.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected ? 'border-[#233dff] bg-[#f0f4ff]' : 'border-gray-200 hover:border-[#233dff]'
                        }`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedSessions(prev => [...prev, session.id]);
                              else setSelectedSessions(prev => prev.filter(id => id !== session.id));
                            }}
                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800">{session.title}</p>
                            <p className="text-[10px] text-gray-500">{session.time}{session.instructor ? ` · ${session.instructor}` : ''}</p>
                          </div>
                          {spotsLeft != null && (
                            <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">
                              {spotsLeft} {lang === 'es' ? 'disponibles' : 'spots'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  className="h-9 justify-center"
                  type="button"
                  onClick={downloadICS}
                >
                  {lang === 'es' ? 'Guardar en Calendario' : 'Save to Calendar'}
                </Button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
