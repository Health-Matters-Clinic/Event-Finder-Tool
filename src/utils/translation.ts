import { Language } from '../types';

const PROGRAM_TRANSLATIONS: Record<string, string> = {
  'Unstoppable Workshop': 'Taller Unstoppable',
  'Unstoppable Wellness Meetup': 'Encuentro de bienestar Unstoppable',
  'Community Walk & Run': 'Caminata y carrera comunitaria',
  'Community Fair': 'Feria comunitaria',
  'Community Wellness': 'Bienestar comunitario',
};

const TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Unstoppable Workshop:/g, 'Taller Unstoppable:'],
  [/Unstoppable Wellness Meetup/g, 'Encuentro de bienestar Unstoppable'],
  [/Unstoppable Community Event/g, 'Evento comunitario Unstoppable'],
  [/Community Walk & Run/g, 'Caminata y carrera comunitaria'],
  [/Community Health & Wellness Event/g, 'Evento comunitario de salud y bienestar'],
  [/Community Fair/g, 'Feria comunitaria'],
  [/Health & Wellness Event/g, 'Evento de salud y bienestar'],
  [/Community Event/g, 'Evento comunitario'],
  [/Walk \+ Health Fair/g, 'Caminata + feria de salud'],
  [/Mental Health Awareness/g, 'Conciencia de salud mental'],
  [/Social Connections/g, 'Conexiones sociales'],
  [/Community Advocacy & Empowerment/g, 'Defensa comunitaria y empoderamiento'],
  [/Access to Healthcare/g, 'Acceso a la atención médica'],
  [/Cultural Competence & Inclusion/g, 'Competencia cultural e inclusión'],
];

export const translateProgram = (program: string, lang: Language): string => {
  if (lang === 'en') return program;
  return PROGRAM_TRANSLATIONS[program] ?? program;
};

export const translateEventTitle = (title: string, lang: Language): string => {
  if (lang === 'en') return title;
  return TITLE_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), title);
};
