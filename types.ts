
export type Language = 'en' | 'es';

export interface ClinicEvent {
  id: string;
  title: string;
  date: string;
  dateDisplay: string;
  time: string;
  location: string;
  city: string;
  address: string;
  program: string;
  lat: number;
  lng: number;
  description: string;
  saveTheDate?: boolean;
}

export interface RSVPPayload {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  name: string;
  phone: string;
  email: string;
  contact_method: 'text' | 'email' | 'none';
  sms_consent: boolean;
  needs: string[];
  lang: Language;
  source: string;
}
