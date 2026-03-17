import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { ClinicEvent, Language } from '../types';
import { STORAGE_KEYS, GOOGLE_APPS_SCRIPT_URL, PORTAL_API_URL, hashPasscode } from '../config';

interface AdminModalProps {
  lang: Language;
  events: ClinicEvent[];
  onClose: () => void;
  onEventsUpdate: (events: ClinicEvent[]) => void;
}

type AdminView = 'passcode' | 'main' | 'edit' | 'reset-request' | 'reset-confirm';

const PROGRAM_OPTIONS = [
  'Unstoppable Workshop',
  'Unstoppable Wellness Meetup',
  'Community Walk & Run',
  'Community Fair',
  'Community Wellness',
  'Partner Event',
  'Volunteer',
];

// Get default date (2 weeks from now)
const getDefaultDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().split('T')[0];
};

const emptyEvent: ClinicEvent = {
  id: '',
  title: '',
  date: getDefaultDate(),
  dateDisplay: '',
  time: '',
  location: '',
  city: '',
  address: '',
  program: 'Community Wellness',
  lat: 33.9719,
  lng: -118.2108,
  description: '',
  saveTheDate: false,
  isPromoted: false,
  isSponsored: false,
};

export const AdminModal: React.FC<AdminModalProps> = ({
  lang,
  events,
  onClose,
  onEventsUpdate,
}) => {
  const [view, setView] = useState<AdminView>('passcode');
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [passcodeLoading, setPasscodeLoading] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [editingEvent, setEditingEvent] = useState<ClinicEvent | null>(null);
  const [formData, setFormData] = useState<ClinicEvent>(emptyEvent);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Trust session auth within the same browser session — passcode was already verified
  useEffect(() => {
    const auth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
    if (auth === 'true') {
      setView('main');
    }
  }, []);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setPasscodeError(lang === 'es' ? 'Ingresa un codigo' : 'Enter a passcode');
      return;
    }
    setPasscodeLoading(true);
    setPasscodeError('');
    try {
      const hash = await hashPasscode(passcode);
      const url = `${GOOGLE_APPS_SCRIPT_URL}?action=verifyPasscode&hash=${encodeURIComponent(hash)}`;
      const res = await fetch(url);
      const data = await res.json();
      // Only accept a clean {success:true} response — reject if it has unrelated fields (e.g. "events")
      // which indicates the Apps Script deployment is stale and fell through to getEvents
      if (data.success === true && !('events' in data)) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        setView('main');
      } else if (data.needsSetup) {
        setPasscodeError(lang === 'es' ? 'No hay codigo configurado. Usa "Restablecer Codigo" para crear uno.' : 'No passcode set. Use "Reset Passcode" to create one.');
      } else if (data.success === true && 'events' in data) {
        // Stale Apps Script deployment — fell through to getEvents instead of verifyPasscode
        setPasscodeError(lang === 'es' ? 'Error del servidor — contacta al admin' : 'Server auth not configured. Redeploy the Apps Script.');
      } else {
        setPasscodeError(lang === 'es' ? 'Codigo incorrecto' : 'Incorrect passcode');
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error. Try again.');
    } finally {
      setPasscodeLoading(false);
    }
  };

  const handleRequestReset = async () => {
    setPasscodeLoading(true);
    setResetMessage('');
    setPasscodeError('');
    try {
      const url = `${GOOGLE_APPS_SCRIPT_URL}?action=requestPasscodeReset`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setView('reset-confirm');
        setResetMessage(lang === 'es' ? 'Codigo enviado al correo del admin.' : 'Reset code sent to admin email.');
      } else {
        setPasscodeError(data.error || 'Failed to send reset code');
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error');
    } finally {
      setPasscodeLoading(false);
    }
  };

  const handleResetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !newPasscode.trim()) {
      setPasscodeError(lang === 'es' ? 'Completa todos los campos' : 'Fill in all fields');
      return;
    }
    if (newPasscode.length < 4) {
      setPasscodeError(lang === 'es' ? 'El codigo debe tener al menos 4 caracteres' : 'Passcode must be at least 4 characters');
      return;
    }
    setPasscodeLoading(true);
    setPasscodeError('');
    try {
      const codeHash = await hashPasscode(resetCode);
      const newHash = await hashPasscode(newPasscode);
      const url = `${GOOGLE_APPS_SCRIPT_URL}?action=resetPasscode&codeHash=${encodeURIComponent(codeHash)}&newHash=${encodeURIComponent(newHash)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        setView('main');
        setPasscode('');
        setResetCode('');
        setNewPasscode('');
      } else {
        setPasscodeError(data.error || (lang === 'es' ? 'Codigo invalido' : 'Invalid code'));
      }
    } catch {
      setPasscodeError(lang === 'es' ? 'Error de conexion' : 'Connection error');
    } finally {
      setPasscodeLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newId = `event-${Date.now()}`;
    setFormData({ ...emptyEvent, id: newId, date: getDefaultDate(), createdAt: new Date().toISOString() });
    setEditingEvent(null);
    setView('edit');
  };

  const handleEditEvent = (event: ClinicEvent) => {
    setFormData({ ...event });
    setEditingEvent(event);
    setView('edit');
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm(lang === 'es' ? 'Eliminar este evento?' : 'Delete this event?')) {
      setIsSaving(true);
      setSaveError('');

      try {
        // Delete from backend via portal proxy
        const delRes = await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteEvent', id: eventId }),
        });
        const delResult = await delRes.json();
        if (!delResult.success) throw new Error(delResult.error || 'Delete failed');

        // Update local state
        const updated = events.filter((e) => e.id !== eventId);
        onEventsUpdate(updated);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to delete event:', error);
        setSaveError(lang === 'es' ? 'Error al eliminar' : 'Failed to delete');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');

    // Generate dateDisplay from date if not provided
    let eventToSave = { ...formData };
    if (eventToSave.date && !eventToSave.dateDisplay) {
      const d = new Date(eventToSave.date + 'T00:00:00');
      eventToSave.dateDisplay = d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Set location from city if not provided
    if (!eventToSave.location && eventToSave.city) {
      eventToSave.location = eventToSave.city;
    }

    // Save to backend — now uses GET so we can verify success
    try {
      await saveEventToBackend(eventToSave);
    } catch (error) {
      console.error('Backend save failed:', error);
      setSaveError(lang === 'es' ? 'Error al guardar' : `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSaving(false);
      return;
    }

    // Update local state after confirmed backend save
    let updated: ClinicEvent[];
    if (editingEvent) {
      updated = events.map((e) => (e.id === editingEvent.id ? eventToSave : e));
    } else {
      updated = [...events, eventToSave];
    }

    onEventsUpdate(updated);
    localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(updated));
    setView('main');
    setIsSaving(false);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(events, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper to save a single event to backend via portal proxy
  // (Browser can't POST directly to Apps Script — 302 redirect drops the body)
  const saveEventToBackend = async (event: ClinicEvent) => {
    const res = await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveEvent', event }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Save failed');
  };

  const handleImportJSON = async () => {
    try {
      const imported = JSON.parse(importText);
      if (Array.isArray(imported)) {
        setIsSaving(true);

        // Save events to backend one at a time
        try {
          for (const event of imported) {
            await saveEventToBackend(event);
          }
        } catch (e) {
          console.warn('Failed to sync to backend:', e);
        }

        onEventsUpdate(imported);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(imported));
        setShowImport(false);
        setImportText('');
        setIsSaving(false);
        alert(lang === 'es' ? 'Eventos importados con exito!' : 'Events imported successfully!');
      } else {
        alert(lang === 'es' ? 'Formato JSON invalido' : 'Invalid JSON format');
      }
    } catch (err) {
      setIsSaving(false);
      alert(lang === 'es' ? 'Error al parsear JSON' : 'Error parsing JSON');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
    setView('passcode');
    setPasscode('');
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'Panel de administrador' : 'Admin panel'}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-gray-200 shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
              {lang === 'es' ? 'Panel de Admin' : 'Admin Panel'}
            </div>
            <div className="text-xl font-semibold text-[#1a1a1a] leading-tight mt-1">
              {view === 'passcode' || view === 'reset-request' || view === 'reset-confirm'
                ? lang === 'es'
                  ? view === 'reset-confirm' ? 'Restablecer Codigo' : 'Autenticacion'
                  : view === 'reset-confirm' ? 'Reset Passcode' : 'Authentication'
                : view === 'edit'
                ? editingEvent
                  ? lang === 'es'
                    ? 'Editar Evento'
                    : 'Edit Event'
                  : lang === 'es'
                  ? 'Nuevo Evento'
                  : 'New Event'
                : lang === 'es'
                ? 'Gestionar Eventos'
                : 'Manage Events'}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-all"
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
          {/* Status Messages */}
          {isSaving && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm font-semibold text-blue-700">
                {lang === 'es' ? 'Guardando...' : 'Saving...'}
              </span>
            </div>
          )}
          {saveError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <span className="text-sm font-semibold text-yellow-800">{saveError}</span>
            </div>
          )}

          {/* Passcode View */}
          {view === 'passcode' && (
            <form onSubmit={handlePasscodeSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                  {lang === 'es' ? 'Codigo de Acceso' : 'Passcode'}
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  placeholder={lang === 'es' ? 'Ingresa el codigo' : 'Enter passcode'}
                  autoFocus
                  required
                  minLength={4}
                  disabled={passcodeLoading}
                />
                {passcodeError && (
                  <p className="text-red-500 text-sm font-semibold mt-2">{passcodeError}</p>
                )}
              </div>
              <Button type="submit" className="w-full justify-center h-12" disabled={passcodeLoading || !passcode.trim()}>
                {passcodeLoading
                  ? lang === 'es' ? 'Verificando...' : 'Verifying...'
                  : lang === 'es' ? 'Ingresar' : 'Enter'}
              </Button>
              <button
                type="button"
                onClick={handleRequestReset}
                disabled={passcodeLoading}
                className="w-full text-center text-sm font-semibold text-[#233dff] hover:underline disabled:opacity-50"
              >
                {passcodeLoading
                  ? lang === 'es' ? 'Enviando...' : 'Sending...'
                  : lang === 'es' ? 'Restablecer Codigo' : 'Reset Passcode'}
              </button>
            </form>
          )}

          {/* Reset Confirm View — enter code from email + new passcode */}
          {view === 'reset-confirm' && (
            <form onSubmit={handleResetPasscode} className="space-y-6">
              {resetMessage && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-700">{resetMessage}</p>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                  {lang === 'es' ? 'Codigo de Verificacion' : 'Verification Code'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-2xl font-bold tracking-[0.3em] text-center focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  disabled={passcodeLoading}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                  {lang === 'es' ? 'Nuevo Codigo de Acceso' : 'New Passcode'}
                </label>
                <input
                  type="password"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  placeholder={lang === 'es' ? 'Minimo 4 caracteres' : 'Minimum 4 characters'}
                  disabled={passcodeLoading}
                />
              </div>
              {passcodeError && (
                <p className="text-red-500 text-sm font-semibold">{passcodeError}</p>
              )}
              <Button type="submit" className="w-full justify-center h-12" disabled={passcodeLoading}>
                {passcodeLoading
                  ? lang === 'es' ? 'Guardando...' : 'Saving...'
                  : lang === 'es' ? 'Establecer Codigo' : 'Set Passcode'}
              </Button>
              <button
                type="button"
                onClick={() => { setView('passcode'); setPasscodeError(''); setResetMessage(''); }}
                className="w-full text-center text-sm font-semibold text-gray-400 hover:text-gray-600"
              >
                {lang === 'es' ? 'Volver' : 'Back to Login'}
              </button>
            </form>
          )}

          {/* Main Admin View */}
          {view === 'main' && (
            <div className="space-y-6">
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleCreateNew} className="h-11" disabled={isSaving}>
                  {lang === 'es' ? 'Crear Evento' : 'Create Event'}
                </Button>
                <Button variant="outline" onClick={handleExportJSON} className="h-11">
                  {lang === 'es' ? 'Exportar JSON' : 'Export JSON'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowImport(!showImport)}
                  className="h-11"
                >
                  {lang === 'es' ? 'Importar JSON' : 'Import JSON'}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setIsSaving(true);
                    setSaveError('');
                    try {
                      // Save each event one at a time
                      for (const event of events) {
                        await saveEventToBackend(event);
                      }
                      alert(lang === 'es' ? 'Sincronizado!' : 'Synced to cloud!');
                    } catch (e) {
                      setSaveError(lang === 'es' ? 'Error al sincronizar' : 'Sync failed');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="h-11"
                  disabled={isSaving}
                >
                  {isSaving ? '...' : lang === 'es' ? 'Sincronizar' : 'Sync to Cloud'}
                </Button>
                <Button variant="outline" onClick={handleLogout} className="h-11 ml-auto">
                  {lang === 'es' ? 'Cerrar Sesion' : 'Logout'}
                </Button>
              </div>

              {/* Import Section */}
              {showImport && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Pegar JSON de eventos' : 'Paste Events JSON'}
                  </label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-sm font-mono focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    placeholder='[{"id": "...", "title": "...", ...}]'
                  />
                  <Button onClick={handleImportJSON} className="h-10" disabled={isSaving}>
                    {isSaving ? '...' : lang === 'es' ? 'Importar' : 'Import'}
                  </Button>
                </div>
              )}

              {/* Events List */}
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                  {lang === 'es' ? `${events.length} Eventos` : `${events.length} Events`}
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-[#233dff] transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[#1a1a1a] truncate">{event.title}</div>
                        <div className="text-sm text-gray-500">
                          {event.dateDisplay} - {event.city}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="px-4 py-2 rounded-full text-base font-normal leading-[1.2] border border-[#233dff] text-[#233dff] hover:bg-[#f0f4ff] transition-all inline-flex items-center gap-2"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#233dff]"></span>
                          {lang === 'es' ? 'Editar' : 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="px-4 py-2 rounded-full text-base font-normal leading-[1.2] border border-red-500 text-red-500 hover:bg-red-50 transition-all inline-flex items-center gap-2"
                        >
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                          {lang === 'es' ? 'Eliminar' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Edit View */}
          {view === 'edit' && (
            <form onSubmit={handleSaveEvent} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Title */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Titulo' : 'Title'} *
                  </label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Title (Spanish) */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    Titulo en Espanol (optional)
                  </label>
                  <input
                    name="title_es"
                    value={formData.title_es || ''}
                    onChange={handleFormChange}
                    placeholder={lang === 'es' ? 'Titulo traducido' : 'Spanish title for ES toggle'}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Fecha' : 'Date'} *
                  </label>
                  <input
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Hora' : 'Time'} *
                  </label>
                  <input
                    name="time"
                    value={formData.time}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g., 10:00 AM - 12:00 PM"
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Date Display */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Fecha Mostrada' : 'Date Display'}{' '}
                    <span className="text-gray-300">(auto-generated if empty)</span>
                  </label>
                  <input
                    name="dateDisplay"
                    value={formData.dateDisplay}
                    onChange={handleFormChange}
                    placeholder="e.g., Saturday, January 10, 2026"
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Ciudad' : 'City'} *
                  </label>
                  <input
                    name="city"
                    value={formData.city}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Program */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Programa' : 'Program'} *
                  </label>
                  <select
                    name="program"
                    value={formData.program}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all appearance-none cursor-pointer"
                  >
                    {PROGRAM_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Direccion' : 'Address'} *
                  </label>
                  <input
                    name="address"
                    value={formData.address}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Latitude */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Latitud' : 'Latitude'} *
                  </label>
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Longitude */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Longitud' : 'Longitude'} *
                  </label>
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={handleFormChange}
                    required
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Descripcion' : 'Description'} *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleFormChange}
                    required
                    rows={3}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all resize-none"
                  />
                </div>

                {/* Description (Spanish) */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    Descripcion en Espanol (optional)
                  </label>
                  <textarea
                    name="description_es"
                    value={formData.description_es || ''}
                    onChange={handleFormChange}
                    rows={3}
                    placeholder={lang === 'es' ? 'Descripcion traducida' : 'Spanish description for ES toggle'}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all resize-none"
                  />
                </div>

                {/* Flyer Upload */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Flyer del Evento' : 'Event Flyer'}{' '}
                    <span className="text-gray-300">(optional)</span>
                  </label>

                  <div className="flex items-center gap-3 mb-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-normal text-base leading-[1.2] border border-[#0f0f0f] bg-white text-[#1a1a1a] hover:bg-gray-50 transition-all">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {lang === 'es' ? 'Subir Flyer' : 'Upload Flyer'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          // Compress image using canvas
                          const img = new Image();
                          const reader = new FileReader();

                          reader.onload = (e) => {
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              const MAX_WIDTH = 600;
                              const MAX_HEIGHT = 800;

                              let width = img.width;
                              let height = img.height;

                              // Scale down if needed
                              if (width > MAX_WIDTH) {
                                height = (height * MAX_WIDTH) / width;
                                width = MAX_WIDTH;
                              }
                              if (height > MAX_HEIGHT) {
                                width = (width * MAX_HEIGHT) / height;
                                height = MAX_HEIGHT;
                              }

                              canvas.width = width;
                              canvas.height = height;

                              const ctx = canvas.getContext('2d');
                              ctx?.drawImage(img, 0, 0, width, height);

                              // Compress to JPEG at 60% quality
                              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                              setFormData((prev) => ({ ...prev, flyerUrl: compressedDataUrl }));
                            };
                            img.src = e.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {formData.flyerUrl && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, flyerUrl: '' }))}
                        className="text-red-500 text-xs font-semibold hover:underline"
                      >
                        {lang === 'es' ? 'Eliminar' : 'Remove'}
                      </button>
                    )}
                  </div>

                  {/* Flyer Preview */}
                  {formData.flyerUrl && (
                    <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-50">
                      <img
                        src={formData.flyerUrl}
                        alt="Flyer preview"
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Website/Eventbrite URL */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Enlace del Evento' : 'Event Link'}{' '}
                    <span className="text-gray-300">(optional - website/eventbrite)</span>
                  </label>
                  <input
                    name="websiteUrl"
                    value={formData.websiteUrl || ''}
                    onChange={handleFormChange}
                    placeholder="https://eventbrite.com/..."
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                  />
                </div>

                {/* Event Tags */}
                <div className="sm:col-span-2 space-y-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                    {lang === 'es' ? 'Etiquetas del Evento' : 'Event Tags'}
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="saveTheDate"
                      type="checkbox"
                      checked={formData.saveTheDate || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Proximamente (detalles por confirmar)' : 'Coming Soon (details TBD)'}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="isPromoted"
                      type="checkbox"
                      checked={formData.isPromoted || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Promocionado (mostrar al inicio)' : 'Promoted (show at top)'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {lang === 'es' ? '+ etiqueta "Recien Agregado"' : '+ "Just Added" tag'}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      name="isSponsored"
                      type="checkbox"
                      checked={formData.isSponsored || false}
                      onChange={handleFormChange}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-[#233dff] focus:ring-[#233dff]"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {lang === 'es' ? 'Patrocinado' : 'Sponsored'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {lang === 'es' ? '+ etiqueta de patrocinio' : '+ sponsor badge'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="h-12 flex-1 justify-center" disabled={isSaving}>
                  {isSaving
                    ? '...'
                    : editingEvent
                    ? lang === 'es'
                      ? 'Guardar Cambios'
                      : 'Save Changes'
                    : lang === 'es'
                    ? 'Crear Evento'
                    : 'Create Event'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setView('main')}
                  className="h-12"
                  disabled={isSaving}
                >
                  {lang === 'es' ? 'Cancelar' : 'Cancel'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 p-5 text-center shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
            {lang === 'es' ? 'Panel de Administrador' : 'Admin Panel'} - Health Matters Clinic
          </div>
        </div>
      </div>
    </div>
  );
};
