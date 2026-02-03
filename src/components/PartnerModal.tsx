import React, { useState } from 'react';
import { Button } from './Button';
import { Language, PartnerEventRequest } from '../types';
import { I18N } from '../constants';

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Store the request in localStorage for now (can be sent to API later)
    const requests = JSON.parse(localStorage.getItem('partnerEventRequests') || '[]');
    const newRequest: PartnerEventRequest = {
      ...formData,
      submittedAt: new Date().toISOString(),
    };
    requests.push(newRequest);
    localStorage.setItem('partnerEventRequests', JSON.stringify(requests));

    // Simulate a short delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white rounded-2xl border border-gray-200 shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
              {lang === 'es' ? 'Solicitud de Socio' : 'Partner Request'}
            </div>
            <div className="text-xl font-semibold text-[#1a1a1a] leading-tight mt-1">
              {t.partner_modal_title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-all"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
          {submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">{t.partner_success}</p>
              <Button onClick={onClose} className="mt-6">
                {lang === 'es' ? 'Cerrar' : 'Close'}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6">{t.partner_modal_intro}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {t.partner_name} *
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {t.partner_email} *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {t.partner_org} *
                  </label>
                  <input
                    name="organization"
                    value={formData.organization}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {t.partner_event_title} *
                  </label>
                  <input
                    name="eventTitle"
                    value={formData.eventTitle}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {t.partner_event_desc} *
                  </label>
                  <textarea
                    name="eventDescription"
                    value={formData.eventDescription}
                    onChange={handleChange}
                    required
                    rows={3}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                      {t.partner_proposed_date} *
                    </label>
                    <input
                      name="proposedDate"
                      type="date"
                      value={formData.proposedDate}
                      onChange={handleChange}
                      required
                      className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                      {t.partner_location} *
                    </label>
                    <input
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      required
                      className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full justify-center h-12 mt-4" disabled={loading}>
                  {loading ? (lang === 'es' ? 'Enviando...' : 'Submitting...') : t.partner_submit}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
