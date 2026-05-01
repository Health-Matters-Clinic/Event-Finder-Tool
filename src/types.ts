
export type Language = 'en' | 'es';

export interface EventSession {
  id: string;
  title: string;
  description?: string;
  time: string;
  location?: string;
  capacity?: number;
  rsvpCount?: number;
  waitlistCount?: number;
  instructor?: string;
}

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
  title_es?: string;          // Spanish title (admin-provided)
  description_es?: string;    // Spanish description (admin-provided)
  sessions?: EventSession[];  // Sub-events/agenda items within this event
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
  action?: 'preregister' | 'checkin' | 'joinWaitlist' | 'cancelWaitlist';
  eventId: string;
  eventTitle: string;
  eventDate: string; // display date is fine for UI; backend uses eventId to look up actual date
  eventDateISO?: string; // YYYY-MM-DD for ICS generation
  eventTime?: string; // event time for confirmation emails
  eventAddress?: string; // venue address for confirmation email
  eventCity?: string; // city/state/zip for confirmation email
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

  // Ambassador/referral tracking
  referralCode?: string;

  // Session selections
  sessionIds?: string[];

  // T-shirt size (Unstoppable events only — for early registrant tee pickup)
  tshirtSize?: string;

  // Flag: registered before May 2 cutoff, eligible for on-site tee pickup
  earlyRegistrant?: boolean;

  // Group RSVP: number of additional guests (0 = just the registrant)
  guests?: number;

  // Accessibility needs — routed to kayla@healthmatters.clinic
  accessibilityNeeds?: string;

  // For check-in
  checkinToken?: string;
}

