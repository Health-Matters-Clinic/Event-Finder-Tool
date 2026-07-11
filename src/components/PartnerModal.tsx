import React, { useState } from 'react';
import { Button } from './Button';
import { Language } from '../types';
import { I18N } from '../constants';
import { GOOGLE_APPS_SCRIPT_URL } from '../config';

interface PartnerModalProps {
  lang: Language;
  onClose: () => void;
}

export const PartnerModal: React.FC<PartnerModalProps> = ({ lang, onClose }) => {
  const t = I18N[lang];
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    eventTitle: '',
    eventDescription: '',
    proposedDate: '',
    eventTime: '',
    location: '',
    flyerUrl: '',
  });
  const [notifyOnRsvp, setNotifyOnRsvp] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      action: 'partner_request',
      name: formData.name,
      email: formData.email,
      organization: formData.organization,
      eventTitle: formData.eventTitle,
      eventDescription: formData.eventDescription,
      proposedDate: formData.proposedDate,
      eventTime: formData.eventTime,
      location: formData.location,
      flyerUrl: formData.flyerUrl || '',
      ...(notifyOnRsvp && notificationEmail ? { notificationEmail } : {}),
      lang,
      timestamp: new Date().toISOString(),
    });

    try {
      // GAS always throws a CORS error even on success — use no-cors to bypass.
      // The browser sends the request without reading the response, so GAS receives
      // and processes it normally. Show success optimistically after fetch resolves.
      await fetch(`${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'no-cors',
      });
      // Can't read the response body with no-cors — optimistically show success
      setSubmitted(true);
    } catch {
      // no-cors can still fail on genuine network errors (offline, DNS failure)
      setError(lang === 'es' ? 'Error al enviar. Intente de nuevo.' : 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#233dff] text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="text-sm font-bold">{t.partner_modal_title}</div>
          <button
            onClick={onClose}
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs font-semibold text-red-800 mb-3">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-sm font-semibold text-gray-900">{t.partner_success}</p>
              <Button onClick={onClose} variant="outline" className="mt-3 h-8">
                {lang === 'es' ? 'Cerrar' : 'Close'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {t.partner_name} *
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {t.partner_email} *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {t.partner_org} *
                </label>
                <input
                  name="organization"
                  value={formData.organization}
                  onChange={handleChange}
                  required
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {t.partner_event_title} *
                </label>
                <input
                  name="eventTitle"
                  value={formData.eventTitle}
                  onChange={handleChange}
                  required
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {t.partner_event_desc} *
                </label>
                <textarea
                  name="eventDescription"
                  value={formData.eventDescription}
                  onChange={handleChange}
                  required
                  rows={2}
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {t.partner_proposed_date} *
                  </label>
                  <input
                    name="proposedDate"
                    type="date"
                    value={formData.proposedDate}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {lang === 'es' ? 'Hora del Evento' : 'Event Time'} *
                  </label>
                  <input
                    name="eventTime"
                    type="text"
                    value={formData.eventTime}
                    onChange={handleChange}
                    required
                    placeholder={lang === 'es' ? 'ej. 10am - 2pm' : 'e.g. 10am - 2pm'}
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {t.partner_location} *
                </label>
                <input
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required
                  placeholder={lang === 'es' ? 'Direccion completa del evento' : 'Full event address'}
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                />
                <p className="text-[9px] text-gray-400 mt-1">
                  {lang === 'es' ? 'Incluya calle, ciudad, estado y codigo postal' : 'Include street, city, state, and ZIP code'}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {lang === 'es' ? 'Enlace del Flyer' : 'Flyer Link'}
                </label>
                <input
                  name="flyerUrl"
                  type="url"
                  value={formData.flyerUrl}
                  onChange={handleChange}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                />
                <p className="text-[9px] text-gray-400 mt-1">
                  {lang === 'es'
                    ? 'Suba su flyer a Google Drive, Dropbox o Canva y pegue el enlace publico. Las notificaciones de RSVP estan disponibles con una cuenta de socio HMC.'
                    : 'Upload your flyer to Google Drive, Dropbox, or Canva and paste the public link. RSVP notifications are available with a free HMC Partner account.'}
                </p>
              </div>

              {/* RSVP Notifications */}
              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyOnRsvp}
                    onChange={(e) => setNotifyOnRsvp(e.target.checked)}
                    className="w-4 h-4 rounded border-2 border-gray-300 accent-[#233dff] cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    {lang === 'es'
                      ? 'Recibir notificaciones cuando alguien confirme asistencia a tu evento'
                      : 'Get notified when someone RSVPs to your event'}
                  </span>
                </label>

                {notifyOnRsvp && (
                  <div className="mt-2.5 space-y-2">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                        {lang === 'es' ? 'Email de notificacion' : 'Notification email'}
                      </label>
                      <input
                        type="email"
                        value={notificationEmail}
                        onChange={(e) => setNotificationEmail(e.target.value)}
                        placeholder="you@organization.org"
                        className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] focus:outline-none focus:ring-2 focus:ring-[#233dff]/30 transition-all placeholder:text-gray-400 placeholder:font-normal"
                      />
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-[10px] leading-relaxed text-blue-800">
                      {lang === 'es' ? (
                        <>
                          Para recibir notificaciones de RSVP necesitas una cuenta gratuita de socio HMC.{' '}
                          <a
                            href="https://partner.healthmatters.clinic"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline hover:text-blue-900"
                          >
                            Crea una cuenta en partner.healthmatters.clinic &rarr;
                          </a>{' '}
                          Ya eres socio? Ingresa el correo de tu cuenta de socio arriba.
                        </>
                      ) : (
                        <>
                          To receive RSVP notifications, you need a free HMC Partner account.{' '}
                          <a
                            href="https://partner.healthmatters.clinic"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline hover:text-blue-900"
                          >
                            Create an account at partner.healthmatters.clinic &rarr;
                          </a>{' '}
                          Already a partner? Enter your partner account email above.
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full justify-center h-9 mt-1" disabled={loading}>
                {loading ? '...' : t.partner_submit}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
