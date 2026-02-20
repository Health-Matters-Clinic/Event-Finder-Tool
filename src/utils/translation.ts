import { ClinicEvent, Language } from '../types';

const PROGRAM_TRANSLATIONS: Record<string, string> = {
  'Unstoppable Workshop': 'Taller Unstoppable',
  'Unstoppable Wellness Meetup': 'Encuentro de bienestar Unstoppable',
  'Community Walk & Run': 'Caminata y carrera comunitaria',
  'Community Fair': 'Feria comunitaria',
  'Community Wellness': 'Bienestar comunitario',
  'Partner Event': 'Evento de Socio',
  'Volunteer': 'Voluntario',
};

const TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  // Multi-word phrases first (longer matches take priority)
  [/Unstoppable Workshop:/gi, 'Taller Unstoppable:'],
  [/Unstoppable Wellness Meetup/gi, 'Encuentro de bienestar Unstoppable'],
  [/Unstoppable Community Event/gi, 'Evento comunitario Unstoppable'],
  [/Community Walk & Run/gi, 'Caminata y carrera comunitaria'],
  [/Community Health & Wellness Event/gi, 'Evento comunitario de salud y bienestar'],
  [/Community Health & Wellness/gi, 'Salud y bienestar comunitario'],
  [/Health & Wellness Event/gi, 'Evento de salud y bienestar'],
  [/Health & Wellness/gi, 'Salud y bienestar'],
  [/Community Fair/gi, 'Feria comunitaria'],
  [/Community Event/gi, 'Evento comunitario'],
  [/Walk \+ Health Fair/gi, 'Caminata + feria de salud'],
  [/Health Fair/gi, 'Feria de salud'],
  [/Mental Health Multicultural Conference/gi, 'Conferencia Multicultural de Salud Mental'],
  [/Mental Health Awareness/gi, 'Conciencia de salud mental'],
  [/Mental Health Conference/gi, 'Conferencia de salud mental'],
  [/Mental Health/gi, 'Salud mental'],
  [/Multicultural Conference/gi, 'Conferencia multicultural'],
  [/Social Connections/gi, 'Conexiones sociales'],
  [/Community Advocacy & Empowerment/gi, 'Defensa comunitaria y empoderamiento'],
  [/Access to Healthcare/gi, 'Acceso a la atención médica'],
  [/Cultural Competence & Inclusion/gi, 'Competencia cultural e inclusión'],
  [/Resource Fair/gi, 'Feria de recursos'],
  [/Pop-Up Clinic/gi, 'Clínica emergente'],
  [/Pop Up Clinic/gi, 'Clínica emergente'],
  [/Street Medicine/gi, 'Medicina callejera'],
  [/Blood Pressure/gi, 'Presión arterial'],
  [/HIV Testing/gi, 'Prueba de VIH'],
  [/Harm Reduction/gi, 'Reducción de daños'],
  [/Food Distribution/gi, 'Distribución de alimentos'],
  [/Free Health Screenings/gi, 'Exámenes de salud gratuitos'],
  [/Health Screenings/gi, 'Exámenes de salud'],
  [/Wellness Activation/gi, 'Activación de bienestar'],
  [/Wellness Event/gi, 'Evento de bienestar'],
  [/Volunteer Training/gi, 'Capacitación de voluntarios'],
  [/Community Outreach/gi, 'Alcance comunitario'],
  [/Outreach Event/gi, 'Evento de alcance'],
  [/Outreach/gi, 'Alcance'],
  [/Wellness/gi, 'Bienestar'],
  [/Community/gi, 'Comunidad'],
  [/Workshop/gi, 'Taller'],
  [/Training/gi, 'Capacitación'],
  [/Meetup/gi, 'Encuentro'],
  [/Meeting/gi, 'Reunión'],
  [/Conference/gi, 'Conferencia'],
  [/Summit/gi, 'Cumbre'],
  [/Symposium/gi, 'Simposio'],
  [/Forum/gi, 'Foro'],
  [/Screening/gi, 'Examen'],
  [/Clinic/gi, 'Clínica'],
  [/Festival/gi, 'Festival'],
  [/Celebration/gi, 'Celebración'],
  [/Awareness/gi, 'Conciencia'],
  [/Prevention/gi, 'Prevención'],
  [/Recovery/gi, 'Recuperación'],
  [/Support Group/gi, 'Grupo de apoyo'],
  [/Multicultural/gi, 'Multicultural'],
  [/Event/gi, 'Evento'],
  [/Free/gi, 'Gratis'],
  [/Health/gi, 'Salud'],
];

// Word-level description translations for common phrases
const DESCRIPTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/free health screenings/gi, 'exámenes de salud gratuitos'],
  [/health screenings/gi, 'exámenes de salud'],
  [/blood pressure checks/gi, 'chequeos de presión arterial'],
  [/HIV testing/gi, 'pruebas de VIH'],
  [/food distribution/gi, 'distribución de alimentos'],
  [/harm reduction/gi, 'reducción de daños'],
  [/mental health/gi, 'salud mental'],
  [/health and wellness/gi, 'salud y bienestar'],
  [/community resources/gi, 'recursos comunitarios'],
  [/free services/gi, 'servicios gratuitos'],
  [/no appointment needed/gi, 'no se necesita cita'],
  [/walk-ins welcome/gi, 'se aceptan personas sin cita'],
  [/all are welcome/gi, 'todos son bienvenidos'],
  [/open to the public/gi, 'abierto al público'],
  [/join us/gi, 'únase a nosotros'],
  [/volunteer/gi, 'voluntario'],
  [/register/gi, 'registrarse'],
  [/sign up/gi, 'inscríbase'],
];

export const translateProgram = (program: string, lang: Language): string => {
  if (lang === 'en') return program;
  return PROGRAM_TRANSLATIONS[program] ?? program;
};

/**
 * Translate an event title to Spanish.
 * Priority: 1) event.title_es (admin-provided), 2) pattern-based replacement
 */
export const translateEventTitle = (title: string, lang: Language, event?: ClinicEvent): string => {
  if (lang === 'en') return title;
  // Use admin-provided Spanish title if available
  if (event?.title_es) return event.title_es;
  return TITLE_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), title);
};

/**
 * Translate an event description to Spanish.
 * Priority: 1) event.description_es (admin-provided), 2) pattern-based replacement
 */
export const translateDescription = (description: string, lang: Language, event?: ClinicEvent): string => {
  if (lang === 'en') return description;
  if (event?.description_es) return event.description_es;
  return DESCRIPTION_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), description);
};
