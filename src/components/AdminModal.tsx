import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { ClinicEvent, EventSession, Language } from '../types';
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

const PROGRAM_COLORS: Record<string, string> = {
  'Unstoppable Workshop': '#233dff',
  'Unstoppable Wellness Meetup': '#7c3aed',
  'Community Walk & Run': '#059669',
  'Community Fair': '#ea580c',
  'Community Wellness': '#db2777',
  'Partner Event': '#0891b2',
  'Volunteer': '#f59e0b',
};

const SHARE_BASE_URL = 'https://teamhmc.github.io/Event-Finder-Tool/?event=';

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

// Helper: parse event date to midnight local Date
const parseEventDate = (dateStr: string): Date => {
  return new Date(dateStr + 'T00:00:00');
};

// Helper: get today as YYYY-MM-DD
const todayStr = () => new Date().toISOString().split('T')[0];

// Helper: days between two YYYY-MM-DD strings
const daysBetween = (a: string, b: string): number => {
  const msDay = 86400000;
  return Math.round((parseEventDate(a).getTime() - parseEventDate(b).getTime()) / msDay);
};

// Collapsible section component for the edit form
const FormSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
};

// Skeleton placeholder for loading states
const SkeletonCard: React.FC = () => (
  <div className="animate-pulse bg-gray-100 rounded-xl p-4 flex items-center gap-4">
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
    <div className="flex gap-2">
      <div className="h-8 w-16 bg-gray-200 rounded-full" />
      <div className="h-8 w-16 bg-gray-200 rounded-full" />
    </div>
  </div>
);

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
  const [eventFormat, setEventFormat] = useState<'in-person' | 'virtual'>('in-person');
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Trust session auth within the same browser session -- passcode was already verified
  useEffect(() => {
    const auth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
    if (auth === 'true') {
      setView('main');
    }
  }, []);

  // ---- Stats ----
  const today = todayStr();

  const stats = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    let todayCount = 0;
    let nextEvent: ClinicEvent | null = null;
    let nextDays = Infinity;

    for (const ev of events) {
      const diff = daysBetween(ev.date, today);
      if (diff > 0) {
        upcoming++;
        if (diff < nextDays) {
          nextDays = diff;
          nextEvent = ev;
        }
      } else if (diff === 0) {
        todayCount++;
        upcoming++; // today counts as upcoming
        if (!nextEvent) {
          nextEvent = ev;
          nextDays = 0;
        }
      } else {
        past++;
      }
    }

    return { upcoming, past, total: events.length, todayCount, nextEvent, nextDays };
  }, [events, today]);

  // ---- Sorted + filtered events ----
  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const da = daysBetween(a.date, today);
      const db = daysBetween(b.date, today);
      // Upcoming (>=0) first, sorted ascending by date; then past sorted descending
      const aUp = da >= 0;
      const bUp = db >= 0;
      if (aUp && !bUp) return -1;
      if (!aUp && bUp) return 1;
      if (aUp && bUp) return da - db; // sooner first
      return db - da; // more recent past first
    });

    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((e) => e.title.toLowerCase().includes(q));
  }, [events, today, searchQuery]);

  // ---- Event status helper ----
  const getEventStatus = (ev: ClinicEvent): { label: string; color: string; bg: string } => {
    const diff = daysBetween(ev.date, today);
    if (diff === 0) return { label: 'TODAY', color: 'text-blue-700', bg: 'bg-blue-100' };
    if (diff > 0) return { label: 'UPCOMING', color: 'text-emerald-700', bg: 'bg-emerald-100' };
    return { label: 'PAST', color: 'text-gray-500', bg: 'bg-gray-100' };
  };

  // ---- Share link ----
  const getShareLink = (ev: ClinicEvent) =>
    SHARE_BASE_URL + encodeURIComponent(ev.title.toLowerCase().replace(/\s+/g, '-'));

  const handleCopyShareLink = (ev: ClinicEvent) => {
    const link = getShareLink(ev);
    navigator.clipboard.writeText(link).then(() => {
      setCopyFeedback(ev.id);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  // ---- Auth handlers (unchanged logic) ----
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
      if (data.success === true && !('events' in data)) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        setView('main');
      } else if (data.needsSetup) {
        setPasscodeError(lang === 'es' ? 'No hay codigo configurado. Usa "Restablecer Codigo" para crear uno.' : 'No passcode set. Use "Reset Passcode" to create one.');
      } else if (data.success === true && 'events' in data) {
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

  // ---- CRUD handlers (unchanged logic) ----
  const handleCreateNew = () => {
    const newId = `event-${Date.now()}`;
    setFormData({ ...emptyEvent, id: newId, date: getDefaultDate(), createdAt: new Date().toISOString() });
    setEditingEvent(null);
    setEventFormat('in-person');
    setSessions([]);
    setView('edit');
  };

  const handleEditEvent = (event: ClinicEvent) => {
    setFormData({ ...event });
    setEditingEvent(event);
    setEventFormat(event.address ? 'in-person' : 'virtual');
    setSessions(event.sessions || []);
    setView('edit');
  };

  const handleDuplicateEvent = (event: ClinicEvent) => {
    const newId = `event-${Date.now()}`;
    setFormData({
      ...event,
      id: newId,
      title: event.title + ' (Copy)',
      createdAt: new Date().toISOString(),
    });
    setEditingEvent(null);
    setEventFormat(event.address ? 'in-person' : 'virtual');
    setSessions(event.sessions ? event.sessions.map((s) => ({ ...s, id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) : []);
    setView('edit');
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm(lang === 'es' ? 'Eliminar este evento?' : 'Delete this event?')) {
      setIsSaving(true);
      setSaveError('');

      try {
        const delRes = await fetch(`${PORTAL_API_URL}/api/public/save-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteEvent', id: eventId }),
        });
        const delResult = await delRes.json();
        if (!delResult.success) throw new Error(delResult.error || 'Delete failed');

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

    let eventToSave = { ...formData, sessions: sessions.length > 0 ? sessions : undefined };
    if (eventToSave.date && !eventToSave.dateDisplay) {
      // Parse date parts manually to avoid timezone shift (UTC vs local)
      const [year, month, day] = eventToSave.date.split('-').map(Number);
      const d = new Date(year, month - 1, day); // month is 0-indexed
      eventToSave.dateDisplay = d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    if (!eventToSave.location && eventToSave.city) {
      eventToSave.location = eventToSave.city;
    }

    try {
      await saveEventToBackend(eventToSave);
    } catch (error) {
      console.error('Backend save failed:', error);
      setSaveError(lang === 'es' ? 'Error al guardar' : `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSaving(false);
      return;
    }

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

  const handleSyncToCloud = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      for (const event of events) {
        await saveEventToBackend(event);
      }
      alert(lang === 'es' ? 'Sincronizado!' : 'Synced to cloud!');
    } catch (e) {
      setSaveError(lang === 'es' ? 'Error al sincronizar' : 'Sync failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshFromCloud = async () => {
    setIsRefreshing(true);
    setSaveError('');
    try {
      const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getEvents`);
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        onEventsUpdate(data.events);
        localStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(data.events));
      } else {
        throw new Error('Invalid response');
      }
    } catch {
      setSaveError(lang === 'es' ? 'Error al actualizar' : 'Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
    setView('passcode');
    setPasscode('');
  };

  // ---- Input class shorthand ----
  const inputCls =
    'w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-base font-semibold focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2';

  // ---- Render ----
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'EventOps - Panel de Operaciones' : 'EventOps Dashboard'}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl border border-gray-200 shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="bg-[#fafbff] border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Back arrow when in edit view */}
            {view === 'edit' && (
              <button
                onClick={() => setView('main')}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#233dff] hover:bg-blue-50 transition-all"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#233dff] tracking-tight">EventOps</span>
                {view === 'main' && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#233dff] text-white px-2 py-0.5 rounded-full">
                    {lang === 'es' ? 'en vivo' : 'live'}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 font-medium">
                {view === 'passcode' || view === 'reset-request' || view === 'reset-confirm'
                  ? lang === 'es'
                    ? view === 'reset-confirm' ? 'Restablecer Codigo' : 'Autenticacion'
                    : view === 'reset-confirm' ? 'Reset Passcode' : 'Authentication'
                  : view === 'edit'
                  ? editingEvent
                    ? lang === 'es' ? 'Editar Evento' : 'Edit Event'
                    : lang === 'es' ? 'Nuevo Evento' : 'New Event'
                  : lang === 'es'
                  ? 'Panel de Operaciones de Eventos'
                  : 'Event Operations Dashboard'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ===== BODY ===== */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Status Messages */}
          {isSaving && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm font-semibold text-blue-700">
                {lang === 'es' ? 'Guardando...' : 'Saving...'}
              </span>
            </div>
          )}
          {saveError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-yellow-800">{saveError}</span>
              <button onClick={() => setSaveError('')} className="text-yellow-600 hover:text-yellow-800 text-xs font-bold">
                {lang === 'es' ? 'Cerrar' : 'Dismiss'}
              </button>
            </div>
          )}

          {/* ===== PASSCODE VIEW ===== */}
          {view === 'passcode' && (
            <div className="max-w-sm mx-auto py-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#233dff]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#233dff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {lang === 'es' ? 'Acceso a EventOps' : 'EventOps Access'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {lang === 'es' ? 'Ingresa tu codigo para continuar' : 'Enter your passcode to continue'}
                </p>
              </div>
              <form onSubmit={handlePasscodeSubmit} className="space-y-5">
                <div>
                  <label className={labelCls}>
                    {lang === 'es' ? 'Codigo de Acceso' : 'Passcode'}
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className={inputCls}
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
            </div>
          )}

          {/* ===== RESET CONFIRM VIEW ===== */}
          {view === 'reset-confirm' && (
            <div className="max-w-sm mx-auto py-8">
              <form onSubmit={handleResetPasscode} className="space-y-6">
                {resetMessage && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-blue-700">{resetMessage}</p>
                  </div>
                )}
                <div>
                  <label className={labelCls}>
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
                  <label className={labelCls}>
                    {lang === 'es' ? 'Nuevo Codigo de Acceso' : 'New Passcode'}
                  </label>
                  <input
                    type="password"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    className={inputCls}
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
            </div>
          )}

          {/* ===== MAIN DASHBOARD VIEW ===== */}
          {view === 'main' && (
            <div className="space-y-5">
              {/* ---- Stats Row ---- */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Upcoming */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-[#233dff] tabular-nums">{stats.upcoming}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mt-0.5">
                    {lang === 'es' ? 'Proximos' : 'Upcoming'}
                  </div>
                </div>
                {/* Past */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-gray-400 tabular-nums">{stats.past}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
                    {lang === 'es' ? 'Pasados' : 'Past'}
                  </div>
                </div>
                {/* Total */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center transition-all duration-300">
                  <div className="text-2xl font-bold text-white tabular-nums">{stats.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
                    {lang === 'es' ? 'Total' : 'Total'}
                  </div>
                </div>
                {/* Next Event */}
                <div
                  className={`border rounded-xl p-3 text-center transition-all duration-300 ${
                    stats.nextDays === 0
                      ? 'bg-green-50 border-green-200'
                      : stats.nextDays <= 7
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-emerald-50 border-emerald-100'
                  }`}
                >
                  {stats.nextEvent ? (
                    <>
                      <div
                        className={`text-sm font-bold truncate ${
                          stats.nextDays === 0
                            ? 'text-green-700'
                            : stats.nextDays <= 7
                            ? 'text-orange-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {stats.nextDays === 0
                          ? lang === 'es' ? 'Hoy!' : 'Today!'
                          : `${lang === 'es' ? 'en' : 'in'} ${stats.nextDays}d`}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5 truncate" title={stats.nextEvent.title}>
                        {stats.nextEvent.title.length > 18
                          ? stats.nextEvent.title.slice(0, 18) + '...'
                          : stats.nextEvent.title}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-gray-300">--</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mt-0.5">
                        {lang === 'es' ? 'Sin eventos' : 'No events'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ---- Action Bar ---- */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Primary: Create Event */}
                <Button onClick={handleCreateNew} className="h-10" disabled={isSaving}>
                  <svg className="w-4 h-4 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {lang === 'es' ? 'Crear Evento' : 'Create Event'}
                </Button>

                {/* Refresh from Cloud */}
                <button
                  onClick={handleRefreshFromCloud}
                  disabled={isRefreshing}
                  className="h-10 px-4 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isRefreshing
                    ? lang === 'es' ? 'Actualizando...' : 'Refreshing...'
                    : lang === 'es' ? 'Actualizar' : 'Refresh'}
                </button>

                {/* Utility dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowUtilityMenu(!showUtilityMenu)}
                    className="h-10 w-10 rounded-full border border-gray-200 text-gray-500 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all flex items-center justify-center"
                    aria-label="More actions"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                  {showUtilityMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowUtilityMenu(false)} />
                      <div className="absolute right-0 top-12 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
                        <button
                          onClick={() => { handleExportJSON(); setShowUtilityMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {lang === 'es' ? 'Exportar JSON' : 'Export JSON'}
                        </button>
                        <button
                          onClick={() => { setShowImport(!showImport); setShowUtilityMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {lang === 'es' ? 'Importar JSON' : 'Import JSON'}
                        </button>
                        <button
                          onClick={() => { handleSyncToCloud(); setShowUtilityMenu(false); }}
                          disabled={isSaving}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {lang === 'es' ? 'Sincronizar' : 'Sync to Cloud'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Logout - far right */}
                <button
                  onClick={handleLogout}
                  className="ml-auto h-10 px-4 rounded-full text-sm font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {lang === 'es' ? 'Salir' : 'Logout'}
                </button>
              </div>

              {/* ---- Import Section ---- */}
              {showImport && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                  <label className={labelCls}>
                    {lang === 'es' ? 'Pegar JSON de eventos' : 'Paste Events JSON'}
                  </label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                    className="w-full bg-white border-2 border-gray-200 px-4 py-3 rounded-xl text-sm font-mono focus:border-[#233dff] focus:bg-[#f0f4ff] outline-none transition-all"
                    placeholder='[{"id": "...", "title": "...", ...}]'
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleImportJSON} className="h-10" disabled={isSaving}>
                      {isSaving ? '...' : lang === 'es' ? 'Importar' : 'Import'}
                    </Button>
                    <button
                      onClick={() => { setShowImport(false); setImportText(''); }}
                      className="h-10 px-4 text-sm font-semibold text-gray-400 hover:text-gray-600"
                    >
                      {lang === 'es' ? 'Cancelar' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* ---- Search / Filter ---- */}
              <div className="relative">
                <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'es' ? 'Buscar eventos por titulo...' : 'Search events by title...'}
                  className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-2.5 rounded-xl text-sm font-medium focus:border-[#233dff] focus:bg-white outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* ---- Event Count ---- */}
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                {searchQuery
                  ? `${sortedEvents.length} ${lang === 'es' ? 'resultados' : 'results'}`
                  : `${events.length} ${lang === 'es' ? 'Eventos' : 'Events'}`}
              </div>

              {/* ---- Events List ---- */}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {isRefreshing && sortedEvents.length === 0 && (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                )}
                {sortedEvents.map((event) => {
                  const status = getEventStatus(event);
                  const progColor = PROGRAM_COLORS[event.program] || '#6b7280';

                  return (
                    <div
                      key={event.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#233dff]/40 hover:shadow-sm transition-all group"
                    >
                      {/* Top row: title + badges */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1a1a1a] truncate text-[15px] leading-tight">
                            {event.title}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {event.dateDisplay || event.date} {event.time ? `- ${event.time}` : ''} {event.city ? `- ${event.city}` : ''}
                          </div>
                        </div>
                        {/* Status badges */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {/* Time status */}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                          {/* Draft */}
                          {event.saveTheDate && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-yellow-100 text-yellow-700">
                              DRAFT
                            </span>
                          )}
                          {/* Promoted */}
                          {event.isPromoted && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700">
                              PROMOTED
                            </span>
                          )}
                          {/* Program pill */}
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ backgroundColor: progColor }}
                          >
                            {event.program.length > 20 ? event.program.slice(0, 20) + '...' : event.program}
                          </span>
                        </div>
                      </div>

                      {/* Quick actions row */}
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#233dff]/30 text-[#233dff] hover:bg-[#233dff] hover:text-white transition-all"
                        >
                          {lang === 'es' ? 'Editar' : 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDuplicateEvent(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-[#233dff]/30 hover:text-[#233dff] hover:bg-blue-50 transition-all"
                        >
                          {lang === 'es' ? 'Duplicar' : 'Duplicate'}
                        </button>
                        <button
                          onClick={() => handleCopyShareLink(event)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                        >
                          {copyFeedback === event.id
                            ? lang === 'es' ? 'Copiado!' : 'Copied!'
                            : lang === 'es' ? 'Copiar Link' : 'Copy Link'}
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all ml-auto"
                        >
                          {lang === 'es' ? 'Eliminar' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {sortedEvents.length === 0 && !isRefreshing && (
                  <div className="text-center py-12 text-gray-300">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium">
                      {searchQuery
                        ? lang === 'es' ? 'No se encontraron eventos' : 'No events found'
                        : lang === 'es' ? 'Sin eventos todavia' : 'No events yet'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== EDIT VIEW ===== */}
          {view === 'edit' && (
            <form onSubmit={handleSaveEvent} className="space-y-4">
              {/* Live preview card */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  {lang === 'es' ? 'Vista previa' : 'Preview'}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    {formData.flyerUrl && (
                      <img src={formData.flyerUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1a1a1a] truncate">
                        {formData.title || (lang === 'es' ? 'Titulo del evento' : 'Event title')}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formData.dateDisplay || formData.date || '--'} {formData.time ? `| ${formData.time}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formData.city || formData.address || (lang === 'es' ? 'Ubicacion' : 'Location')}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {formData.program && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: PROGRAM_COLORS[formData.program] || '#6b7280' }}
                          >
                            {formData.program}
                          </span>
                        )}
                        {formData.saveTheDate && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">
                            DRAFT
                          </span>
                        )}
                        {formData.isPromoted && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                            PROMOTED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {formData.description && (
                    <p className="text-xs text-gray-500 mt-3 line-clamp-2">{formData.description}</p>
                  )}
                </div>
              </div>

              {/* Section: Basic Info */}
              <FormSection title={lang === 'es' ? 'Informacion Basica' : 'Basic Info'}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      {lang === 'es' ? 'Titulo' : 'Title'} *
                    </label>
                    <input
                      name="title"
                      value={formData.title}
                      onChange={handleFormChange}
                      required
                      className={inputCls}
                    />
                  </div>

                  {/* Title (Spanish) */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      Titulo en Espanol (optional)
                    </label>
                    <input
                      name="title_es"
                      value={formData.title_es || ''}
                      onChange={handleFormChange}
                      placeholder={lang === 'es' ? 'Titulo traducido' : 'Spanish title for ES toggle'}
                      className={inputCls}
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Fecha' : 'Date'} *
                    </label>
                    <input
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleFormChange}
                      required
                      className={inputCls}
                    />
                  </div>

                  {/* Time */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Hora' : 'Time'} *
                    </label>
                    <input
                      name="time"
                      value={formData.time}
                      onChange={handleFormChange}
                      required
                      placeholder="e.g., 10:00 AM - 12:00 PM"
                      className={inputCls}
                    />
                  </div>

                  {/* Date Display */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      {lang === 'es' ? 'Fecha Mostrada' : 'Date Display'}{' '}
                      <span className="text-gray-300">(auto-generated if empty)</span>
                    </label>
                    <input
                      name="dateDisplay"
                      value={formData.dateDisplay}
                      onChange={handleFormChange}
                      placeholder="e.g., Saturday, January 10, 2026"
                      className={inputCls}
                    />
                  </div>

                  {/* Program */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Programa' : 'Program'} *
                    </label>
                    <select
                      name="program"
                      value={formData.program}
                      onChange={handleFormChange}
                      required
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      {PROGRAM_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Event Format */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Formato' : 'Format'} *
                    </label>
                    <select
                      value={eventFormat}
                      onChange={(e) => {
                        const fmt = e.target.value as 'in-person' | 'virtual';
                        setEventFormat(fmt);
                        if (fmt === 'virtual') {
                          setFormData((prev) => ({ ...prev, address: '', city: '', lat: 0, lng: 0 }));
                        }
                      }}
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      <option value="in-person">{lang === 'es' ? 'En Persona' : 'In-Person'}</option>
                      <option value="virtual">{lang === 'es' ? 'Virtual' : 'Virtual'}</option>
                    </select>
                  </div>
                </div>
              </FormSection>

              {/* Section: Location */}
              {eventFormat === 'in-person' && (
                <FormSection title={lang === 'es' ? 'Ubicacion' : 'Location'}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* City */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Ciudad' : 'City'} *
                      </label>
                      <input
                        name="city"
                        value={formData.city}
                        onChange={handleFormChange}
                        required
                        className={inputCls}
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Direccion' : 'Address'} *
                      </label>
                      <input
                        name="address"
                        value={formData.address}
                        onChange={handleFormChange}
                        required
                        className={inputCls}
                      />
                    </div>

                    {/* Latitude */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Latitud' : 'Latitude'} *
                      </label>
                      <input
                        name="lat"
                        type="number"
                        step="any"
                        value={formData.lat}
                        onChange={handleFormChange}
                        required
                        className={inputCls}
                      />
                    </div>

                    {/* Longitude */}
                    <div>
                      <label className={labelCls}>
                        {lang === 'es' ? 'Longitud' : 'Longitude'} *
                      </label>
                      <input
                        name="lng"
                        type="number"
                        step="any"
                        value={formData.lng}
                        onChange={handleFormChange}
                        required
                        className={inputCls}
                      />
                    </div>
                  </div>
                </FormSection>
              )}

              {/* Section: Details */}
              <FormSection title={lang === 'es' ? 'Detalles' : 'Details'}>
                <div className="space-y-4">
                  {/* Description */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Descripcion' : 'Description'} *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      required
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  {/* Description (Spanish) */}
                  <div>
                    <label className={labelCls}>
                      Descripcion en Espanol (optional)
                    </label>
                    <textarea
                      name="description_es"
                      value={formData.description_es || ''}
                      onChange={handleFormChange}
                      rows={3}
                      placeholder={lang === 'es' ? 'Descripcion traducida' : 'Spanish description for ES toggle'}
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              </FormSection>

              {/* Section: Media */}
              <FormSection title={lang === 'es' ? 'Medios' : 'Media'} defaultOpen={!!(formData.flyerUrl || formData.websiteUrl)}>
                <div className="space-y-4">
                  {/* Flyer Upload */}
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Flyer del Evento' : 'Event Flyer'}{' '}
                      <span className="text-gray-300">(optional)</span>
                    </label>

                    <div className="flex items-center gap-3 mb-3">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-normal text-sm leading-[1.2] border border-gray-200 bg-white text-gray-600 hover:border-[#233dff] hover:text-[#233dff] hover:bg-blue-50 transition-all">
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

                            const img = new Image();
                            const reader = new FileReader();

                            reader.onload = (e) => {
                              img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 600;
                                const MAX_HEIGHT = 800;

                                let width = img.width;
                                let height = img.height;

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
                  <div>
                    <label className={labelCls}>
                      {lang === 'es' ? 'Enlace del Evento' : 'Event Link'}{' '}
                      <span className="text-gray-300">(optional - website/eventbrite)</span>
                    </label>
                    <input
                      name="websiteUrl"
                      value={formData.websiteUrl || ''}
                      onChange={handleFormChange}
                      placeholder="https://eventbrite.com/..."
                      className={inputCls}
                    />
                  </div>
                </div>
              </FormSection>

              {/* Section: Settings / Tags */}
              <FormSection title={lang === 'es' ? 'Configuracion' : 'Settings'} defaultOpen={!!(formData.saveTheDate || formData.isPromoted || formData.isSponsored)}>
                <div className="space-y-3">
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
              </FormSection>

              {/* Sessions / Agenda */}
              <FormSection title={lang === 'es' ? 'Agenda / Sesiones' : 'Agenda / Sessions'} defaultOpen={sessions.length > 0}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 italic">
                      {sessions.length === 0
                        ? lang === 'es' ? 'Sin sesiones — usa esto para eventos con multiples actividades' : 'No sessions -- use this for events with multiple activities'
                        : `${sessions.length} ${lang === 'es' ? 'sesiones' : 'sessions'}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSessions(prev => [...prev, { id: `s-${Date.now()}`, title: '', time: '', capacity: undefined, instructor: '', description: '' }])}
                      className="text-xs font-semibold text-[#233dff] hover:underline"
                    >
                      + {lang === 'es' ? 'Agregar Sesion' : 'Add Session'}
                    </button>
                  </div>
                  {sessions.map((session, idx) => (
                    <div key={session.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          {lang === 'es' ? 'Sesion' : 'Session'} {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSessions(prev => prev.filter(s => s.id !== session.id))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          {lang === 'es' ? 'Eliminar' : 'Remove'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          value={session.title}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Titulo (ej. Clase de Baile)' : 'Title (e.g. Dance Class)'}
                          className="col-span-2 bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.time}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, time: e.target.value } : s))}
                          placeholder="5:45 PM - 6:05 PM"
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.capacity || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, capacity: e.target.value ? Number(e.target.value) : undefined } : s))}
                          type="number"
                          placeholder={lang === 'es' ? 'Capacidad (opc.)' : 'Capacity (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.instructor || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, instructor: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Instructor (opc.)' : 'Instructor (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                        <input
                          value={session.location || ''}
                          onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, location: e.target.value } : s))}
                          placeholder={lang === 'es' ? 'Ubicacion (opc.)' : 'Room/area (opt.)'}
                          className="bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm font-semibold focus:border-[#233dff] outline-none"
                        />
                      </div>
                      <textarea
                        value={session.description || ''}
                        onChange={e => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, description: e.target.value } : s))}
                        rows={2}
                        placeholder={lang === 'es' ? 'Descripcion (opc.)' : 'Description (opt.)'}
                        className="w-full bg-white border-2 border-gray-200 px-3 py-2 rounded-lg text-sm focus:border-[#233dff] outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              </FormSection>

              {/* Form Actions */}
              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
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

        {/* ===== FOOTER ===== */}
        <div className="bg-[#fafbff] border-t border-gray-200 px-5 py-3 text-center shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300">
            EventOps - Health Matters Clinic
          </div>
        </div>
      </div>
    </div>
  );
};
