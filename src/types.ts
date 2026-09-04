
export type Language = 'en' | 'es';

/**
 * Who owns the RSVP for an event. Stored, never inferred: the registration route
 * used to be read off whether `websiteUrl` happened to be filled in, which made a
 * blank field mean "Health Matters Clinic collects this RSVP". That is the wrong
 * default for a listing that carries other organizations' events, and there was no
 * way at all to say an event needs no RSVP.
 *
 * - `hmc`             HMC hosts it and collects the RSVP.
 * - `hmc-for-partner` HMC deliberately collects on the host organization's behalf,
 *                     as arranged through partner.healthmatters.clinic.
 * - `external`        The host organization owns it. We link out or show their contact.
 * - `none`            Open invite. Nothing to sign up for.
 */
export type RsvpMode = 'hmc' | 'hmc-for-partner' | 'external' | 'none';

/** The two modes under which an RSVP reaches HMC's own sheet. */
export const HMC_COLLECTED_MODES: readonly RsvpMode[] = ['hmc', 'hmc-for-partner'];

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
  ceApproved?: boolean;        // LACDMH-approved for CE/CEU credit
  ceBoards?: string;           // Approved boards (e.g. "BBS, BRN, CCAPP, Psychology")
  ceHours?: number;            // CE credit hours awarded
  // Whether this is an online event. Stored rather than inferred: the format used
  // to be derived from whether address was non-empty, which meant a virtual event
  // reverted to in-person the moment anything put an address back on the record.
  isVirtual?: boolean;
  /**
   * Last day of a run of days, as YYYY-MM-DD. Absent for a single-day event.
   * A three-day training was previously one `date`, so it vanished from the
   * listing after day one and its schema claimed it was over.
   */
  endDate?: string;
  /**
   * In person, venue not announced yet. A real third state: writing "TBA" into
   * the address made the event look located, put a pin on the map at whatever
   * coordinates were lying around, and blocked RSVPs because the bookable check
   * demanded an address longer than fifteen characters.
   */
  locationTBD?: boolean;
  /**
   * Who collects the RSVP. Absent on records written before the field existed;
   * `resolveRsvpMode` decides what those mean rather than any default here, so the
   * absence stays visible to the admin screen that asks someone to set it.
   */
  rsvpMode?: RsvpMode;
  /**
   * The organization actually running the event, when that is not HMC. Names the
   * destination on the Register button and the `organizer` in the event's
   * structured data, which previously claimed HMC ran every event listed.
   */
  hostOrg?: string;
  /**
   * Phone, email, or instructions for an `external` event whose host has no
   * registration page. Plenty of orgs take an RSVP by phone or take none at all.
   */
  rsvpContact?: string;
}

export interface PartnerEventRequest {
  name: string;
  email: string;
  organization: string;
  eventTitle: string;
  eventDescription: string;
  proposedDate: string;
  location: string;
  /** Partner's own registration page, when the event does not use HMC RSVP. */
  websiteUrl?: string;
  /** How the partner wants RSVPs handled. See RsvpMode. */
  rsvpMode?: RsvpMode;
  /** Phone or email to RSVP with, for a partner who has no registration page. */
  rsvpContact?: string;
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

  // RSVP preferences (collection only, reminders are handled elsewhere)
  contact_method?: 'text' | 'email' | 'none';
  sms_consent?: boolean;

  // Optional: allow guardian to preregister a minor using the same email/phone
  isMinor?: boolean;
  minorName?: string;

  needs?: string[];
  lang: Language;
  source: string;

  /**
   * The organization the RSVP is being collected for, when HMC is collecting on a
   * partner's behalf. Recorded so a partner-owned registration is distinguishable
   * from an HMC-owned one in the RSVPs sheet rather than looking like our own.
   */
  hostOrg?: string;

  // Ambassador/referral tracking
  referralCode?: string;

  // Session selections
  sessionIds?: string[];

  // T-shirt size (Unstoppable events only, for early registrant tee pickup)
  tshirtSize?: string;

  // Flag: registered before May 2 cutoff, eligible for on-site tee pickup
  earlyRegistrant?: boolean;

  // Group RSVP: number of additional guests (0 = just the registrant)
  guests?: number;

  // Accessibility needs, routed to kayla@healthmatters.clinic
  accessibilityNeeds?: string;

  // For check-in
  checkinToken?: string;
}

