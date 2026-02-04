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
    location: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = {
      action: 'partner_request',
      ...formData,
      submittedAt: new Date().toISOString(),
      lang,
    };

    try {
      // Use iframe form submission to bypass CORS
      await new Promise<void>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.name = 'partner-submit-frame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GOOGLE_APPS_SCRIPT_URL;
        form.target = 'partner-submit-frame';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify(payload);
        form.appendChild(input);

        document.body.appendChild(form);

        iframe.onload = () => {
          setTimeout(() => {
            document.body.removeChild(form);
            document.body.removeChild(iframe);
          }, 100);
          resolve();
        };

        form.submit();
      });

      setSubmitted(true);
    } catch {
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
              <Button onClick={onClose} variant="outline" className="mt-3 h-8 text-xs">
                {lang === 'es' ? 'Cerrar' : 'Close'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    {t.partner_name} *
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
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
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
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
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
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
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
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
                  className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
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
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
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
                    className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>
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
