
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
  flyerUrl?: string;
  websiteUrl?: string;
  isPromoted?: boolean;       // Admin-promoted to show at top
  isSponsored?: boolean;      // Sponsored event
  promotedUntil?: string;     // Date promotion expires
  createdAt?: string;         // When event was added
}

export interface PartnerEventRequest {
  name: string;
  email: string;
  organization: string;
  eventTitle: string;
  eventDescription: string;
  proposedDate: string;
  location: string;
  submittedAt: string;
}

export interface RSVPPayload {
  action?: 'preregister' | 'checkin';
  eventId: string;
  eventTitle: string;
  eventDate: string; // display date is fine for UI; backend uses eventId to look up actual date
  eventTime?: string; // event time for confirmation emails
  name: string;

  // Either email OR phone is required. For minors, minorName may be used to allow multiple under one guardian contact.
  phone?: string;
  email?: string;

  // RSVP preferences (collection only — reminders are handled elsewhere)
  contact_method?: 'text' | 'email' | 'none';
  sms_consent?: boolean;

  // Optional: allow guardian to preregister a minor using the same email/phone
  isMinor?: boolean;
  minorName?: string;

  needs?: string[];
  lang: Language;
  source: string;

  // For check-in
  checkinToken?: string;
}

