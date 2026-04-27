// 8 SEO-optimized use case configurations.
// Each entry drives a generated page at /use-case/<slug>.
//
// Editing tips:
// - `seo.title` / `seo.description` are what Google + LinkedIn show in previews.
// - `keywords` get baked into a <meta name="keywords"> tag and sprinkled into H2/H3.
// - `faqs` render as schema.org FAQPage JSON-LD so Google can pull rich snippets.
// - Keep `hero.h1` to ~60 chars and include the primary keyword phrase.

import {
  Scissors, Stethoscope, Wrench, Briefcase, GraduationCap, ShoppingBag,
  Calendar, Building2,
} from "lucide-react";

export const USE_CASE_PAGES = [
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "salon",
    icon: Scissors,
    industry: "Salon & Spa",
    seo: {
      title: "AI Receptionist for Salons & Spas | BotNira — Books Haircuts & Facials 24/7",
      description: "BotNira is an AI receptionist built for hair salons, beauty bars and spas. Books appointments via chat, WhatsApp and phone, handles cancellations, sends reminders.",
      keywords: "ai receptionist for salon, salon booking ai, ai chatbot for hair salon, spa appointment ai, beauty salon virtual receptionist, after hours salon booking",
    },
    hero: {
      eyebrow: "For Salons, Spas & Beauty Bars",
      h1: "Your salon's AI receptionist — books appointments while you cut hair.",
      sub: "BotNira answers every call, WhatsApp and DM the moment it lands. Books haircuts, facials, waxing and color appointments — even when you're with a client. Sends reminders, handles cancellations, remembers stylist preferences.",
      stat: { kpi: "73%", label: "of salon bookings happen after 6pm — when nobody's at the front desk" },
    },
    why: [
      { title: "Stop missing after-hours bookings", body: "Most beauty bookings happen between 7pm–11pm and on weekends. If your phone goes to voicemail, the customer just books with the salon down the street. BotNira picks up every time, day or night." },
      { title: "Never double-book a stylist", body: "BotNira reads your live calendar before confirming. If Maria's busy at 2pm Saturday, it offers Priya at 2:15 instead. Customers walk away with a real time slot, not a 'we'll call you back'." },
      { title: "Reschedule without drama", body: "Cancellations and walk-in changes get handled automatically. The freed slot opens up, and BotNira can even fill it with someone on your waitlist." },
      { title: "Memory for repeat clients", body: "BotNira remembers Sarah always books Tuesday with Anna for highlights — and surfaces her usual appointment in 2 messages." },
    ],
    workflow: [
      { step: 1, title: "Customer texts your salon's WhatsApp or fills the chat widget on your site" },
      { step: 2, title: "BotNira asks for service, preferred date, stylist (if any) — in their language" },
      { step: 3, title: "Checks your live calendar, offers the closest matching slot" },
      { step: 4, title: "Confirms, sends reminder 24h + 2h before, and adds the booking to your dashboard" },
    ],
    faqs: [
      { q: "Will BotNira replace my front-desk staff?", a: "No. BotNira handles 80% of routine bookings and questions, freeing your front desk to focus on in-person clients and upsells. Live agents can take over any conversation in one click." },
      { q: "Does it work for multi-location salons?", a: "Yes. BotNira can route customers to the nearest branch by city/postal code, and each branch has its own calendar." },
      { q: "Can it sell gift cards and packages?", a: "Yes. Configure your packages once in your business profile and BotNira will pitch them when relevant — e.g. when a customer asks about pricing for multiple services." },
      { q: "What languages does it speak?", a: "Every major language out of the box — including Spanish, Portuguese, French, Hindi, Arabic, Mandarin and 90+ others. Customers get answers in whatever language they wrote in." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "dental",
    icon: Stethoscope,
    industry: "Dental Clinic",
    seo: {
      title: "AI Receptionist for Dental Clinics | BotNira — Patient Intake & Booking 24/7",
      description: "BotNira is HIPAA-aware AI for dental practices. Books cleanings, handles emergency triage, captures insurance info, sends reminders — across phone, WhatsApp and web chat.",
      keywords: "ai receptionist for dental clinic, dental appointment ai, dental chatbot, dentist virtual receptionist, dental practice automation, after hours dental booking",
    },
    hero: {
      eyebrow: "For Dental Clinics",
      h1: "An AI receptionist for your dental practice — never miss a new patient.",
      sub: "BotNira answers every call and message. Books cleanings, root canals and emergency consultations. Captures insurance details, runs intake, and books before the patient picks another clinic.",
      stat: { kpi: "$420", label: "average lifetime value of a dental patient — 1 missed call = 1 lost patient" },
    },
    why: [
      { title: "Capture every emergency call", body: "Dental emergencies don't wait for office hours. BotNira triages — broken tooth → same-day slot, routine cleaning → next available — and books accordingly." },
      { title: "Insurance intake on autopilot", body: "BotNira asks for insurance provider, member ID and policy details upfront. Your front desk shows up to a complete file, not a half-filled form." },
      { title: "Cuts no-shows by 40%", body: "Auto-reminders 48h, 24h and 2h before the appointment. Patients can confirm or reschedule with one tap — no phone tag." },
      { title: "Keeps PHI safe", body: "Conversations are encrypted in transit (TLS 1.3) and stored in a tenant-isolated workspace. PHI is never used to train any model." },
    ],
    workflow: [
      { step: 1, title: "Patient calls or texts your clinic" },
      { step: 2, title: "BotNira identifies symptoms, asks for insurance info" },
      { step: 3, title: "Books an appropriate slot from your calendar (cleaning vs emergency)" },
      { step: 4, title: "Sends reminders, accepts reschedules, hands the case file to your hygienist" },
    ],
    faqs: [
      { q: "Is BotNira HIPAA compliant?", a: "BotNira follows HIPAA-aligned best practices: encrypted transit + storage, tenant isolation, role-based access, and we don't use patient conversations to train AI models. For a fully signed BAA, contact our team." },
      { q: "Can it handle multiple dentists in one clinic?", a: "Yes. Each dentist has their own calendar; BotNira routes patients to the right one based on procedure or patient preference." },
      { q: "What about patient records integration?", a: "BotNira pushes booking + intake data into your dashboard. Direct integrations with Dentrix, OpenDental and Eaglesoft are on our roadmap — talk to us if you need one." },
      { q: "Does it call patients back?", a: "Yes. If a call comes in after hours and the patient leaves a callback request, your team gets a notification + the full transcript the next morning." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "auto-repair",
    icon: Wrench,
    industry: "Auto Repair & Trades",
    seo: {
      title: "AI Receptionist for Auto Repair Shops & Mechanics | BotNira",
      description: "BotNira books service appointments for auto repair shops, mechanics and tire centers. Handles quotes, dispatches mobile technicians, captures vehicle info — 24/7.",
      keywords: "ai receptionist for auto repair, mechanic chatbot, auto shop booking ai, tire center virtual receptionist, mobile mechanic dispatch ai, after hours auto repair booking",
    },
    hero: {
      eyebrow: "For Auto Repair, Mechanics & Trades",
      h1: "Stop losing service jobs to voicemail — BotNira books them while you wrench.",
      sub: "Hands greasy? Phone ringing? BotNira picks up every call and WhatsApp. Captures vehicle make, model, year, the issue, and books a service slot. Dispatches mobile mechanics to the right address. Quotes simple jobs instantly.",
      stat: { kpi: "62%", label: "of inbound auto-repair calls go unanswered — half of those callers never call back" },
    },
    why: [
      { title: "Capture the customer in the moment", body: "When someone's car breaks down, the FIRST shop that picks up wins the job. BotNira always picks up — your competitors don't." },
      { title: "Quote simple jobs in seconds", body: "Oil change, tire rotation, brake pad swap — BotNira knows your standard prices and quotes instantly. Customer books on the spot." },
      { title: "Triage emergency vs routine", body: "Stranded car / overheating engine → expedited slot. Routine 60k service → next available. BotNira keeps the queue moving." },
      { title: "Capture vehicle info upfront", body: "Make, model, year, VIN, mileage, the noise — all collected before the customer arrives. Your bay starts on the diagnosis, not the small talk." },
    ],
    workflow: [
      { step: 1, title: "Customer calls or messages with a problem" },
      { step: 2, title: "BotNira asks vehicle details + symptoms" },
      { step: 3, title: "Quotes if it's a standard job, or schedules a diagnostic" },
      { step: 4, title: "Books a bay, sends address + arrival window" },
    ],
    faqs: [
      { q: "Will it scare off customers who want to talk to a real person?", a: "No. BotNira sounds natural and tells customers up-front it's an AI. They can ask for a human anytime — you'll get the live transcript and can take over instantly." },
      { q: "Can it dispatch mobile mechanics?", a: "Yes. It captures the customer's location, books a 30-min arrival window, and notifies your nearest available technician." },
      { q: "Does it handle parts pricing?", a: "Configure your service catalog once and BotNira quotes from it. For complex jobs it says 'I'll have a tech call you with a quote in X minutes.'" },
      { q: "Can it run multiple shop locations?", a: "Yes — it routes by postal code/city to your nearest shop." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "real-estate",
    icon: Building2,
    industry: "Real Estate",
    seo: {
      title: "AI Receptionist for Real Estate Agents & Brokerages | BotNira",
      description: "BotNira qualifies leads, books property tours, answers listing questions and captures buyer preferences — across web chat, WhatsApp, voice and SMS. Built for realtors.",
      keywords: "ai receptionist for real estate, realtor chatbot, real estate lead qualification ai, property tour booking ai, buyer agent virtual assistant, after hours realtor",
    },
    hero: {
      eyebrow: "For Realtors & Brokerages",
      h1: "Qualify leads & book property tours while you're showing other listings.",
      sub: "BotNira chats with every web-form lead in 30 seconds — way before they call your competitor. Qualifies budget, area, timeline, financing readiness. Books tours straight into your calendar.",
      stat: { kpi: "5 minutes", label: "is the magic window — leads contacted in 5 min are 21× more likely to qualify" },
    },
    why: [
      { title: "Beat the 5-minute rule", body: "Studies show leads contacted within 5 minutes are 21× more likely to convert. BotNira responds in 30 seconds — every time." },
      { title: "Qualify before you waste a tour", body: "BotNira asks the right BANT questions — budget, area preferences, timeline, financing pre-approval — so you only show up to serious buyers." },
      { title: "Book tours that show", body: "Auto reminders + live calendar checks mean tours don't get double-booked or no-show'd as often." },
      { title: "Speak every buyer's language", body: "BotNira translates fluently — useful when half your area's buyers prefer Spanish, Mandarin or Punjabi." },
    ],
    workflow: [
      { step: 1, title: "Lead fills your contact form, calls, or WhatsApps you" },
      { step: 2, title: "BotNira qualifies — budget, area, timeline, financing" },
      { step: 3, title: "Books a property tour from your live calendar" },
      { step: 4, title: "Sends listing details, drives reminders, hands you a hot lead" },
    ],
    faqs: [
      { q: "Can BotNira pull MLS listings?", a: "Today it speaks from the listings YOU paste into your business profile. MLS integration is on the roadmap — talk to us if you need it." },
      { q: "Does it integrate with my CRM?", a: "Yes — every qualified lead lands as a structured record (name, phone, email, budget, timeline, area). Native Zoho/HubSpot integrations launch Q3 2026." },
      { q: "Can I take over a hot conversation?", a: "Yes. The unified inbox lets you jump in mid-chat any time. Customer never knows it switched from AI to you." },
      { q: "Will it cold-call leads back?", a: "Inbound only at launch. Outbound calling features coming soon." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "restaurant",
    icon: ShoppingBag,
    industry: "Restaurant",
    seo: {
      title: "AI Receptionist for Restaurants — Reservations & Menu Q&A | BotNira",
      description: "BotNira takes reservations, answers menu and dietary questions, handles takeout orders and special requests — across phone, WhatsApp, Google Business chat and your website.",
      keywords: "ai receptionist for restaurants, restaurant chatbot, reservation ai, takeout ordering ai, menu questions chatbot, restaurant phone automation",
    },
    hero: {
      eyebrow: "For Restaurants & Cafés",
      h1: "Reservations, menu questions, takeout — all handled while you cook.",
      sub: "BotNira answers every reservation call and DM. Knows your menu, allergens, hours, parking, and specials. Books tables straight into your reservation system. Takes simple takeout orders.",
      stat: { kpi: "1 in 3", label: "restaurant reservation calls go to voicemail during peak service hours" },
    },
    why: [
      { title: "Reservations land while service is running", body: "Friday 7pm — your hostess is seating tables, not answering phones. BotNira handles every call and locks in the reservation." },
      { title: "Menu and dietary expert on call", body: "What's gluten-free? Is the soup vegan? Does the curry have nuts? BotNira knows your menu cold and answers honestly — no waiter callouts needed." },
      { title: "Takes simple takeout orders", body: "Pickup orders, time slots, special instructions — captured in your dashboard for the kitchen to prep." },
      { title: "Multi-language support for diverse cities", body: "Tourists asking about pricing in Spanish, family in Mandarin asking about Sunday brunch — handled in their language." },
    ],
    workflow: [
      { step: 1, title: "Customer calls / WhatsApps / fills the website chat" },
      { step: 2, title: "BotNira handles reservation, menu Q's, hours, dress code" },
      { step: 3, title: "Books a table or takes a takeout order" },
      { step: 4, title: "Confirms with the customer + drops it into your dashboard" },
    ],
    faqs: [
      { q: "Does it integrate with OpenTable / Resy?", a: "Native integrations are on the roadmap. Today, reservations land in your BotNira dashboard for your front-of-house team to confirm." },
      { q: "Can it handle large group bookings?", a: "Yes — for groups above your configured size, it auto-flags the request as 'requires manager approval' and notifies you instantly." },
      { q: "What if the kitchen is slammed and we're not taking takeout?", a: "Toggle takeout off in your channel settings. BotNira politely tells customers takeout is paused and offers a reservation instead." },
      { q: "Can it do delivery zones / quote prices?", a: "Configure your delivery radius + minimum order — BotNira quotes accordingly." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "education",
    icon: GraduationCap,
    industry: "Education & Coaching",
    seo: {
      title: "AI Receptionist for Schools, Coaching Centers & Tutors | BotNira",
      description: "BotNira answers admissions queries, handles fee questions, books trial classes, and translates for parents — for schools, tutoring centers and online coaching.",
      keywords: "ai receptionist for school, coaching center chatbot, admissions ai assistant, tutor booking ai, online education virtual receptionist, school helpdesk automation",
    },
    hero: {
      eyebrow: "For Schools, Tuition & Coaching",
      h1: "Admissions, course details, fees — answered for every parent in their language.",
      sub: "Most parents won't fill a form — they want a quick chat. BotNira answers every WhatsApp, every call, every web message. Course details, fees, schedule, free trial slots — all in their language.",
      stat: { kpi: "78%", label: "of admissions inquiries happen on WhatsApp in growth markets" },
    },
    why: [
      { title: "Capture the parent in the WhatsApp moment", body: "By the time you reply tomorrow morning, the parent has already enrolled their kid elsewhere. BotNira replies in 30 seconds." },
      { title: "Translate for diverse families", body: "English-speaking school in a multilingual neighborhood? BotNira handles Spanish, Punjabi, Mandarin, Arabic, Tagalog — every parent gets answers in their language." },
      { title: "Book trial classes that actually convert", body: "Trial-class bookings come in 24/7. BotNira books them straight into your trainer's calendar with student grade + topic." },
      { title: "Surface the right course at the right level", body: "BotNira asks the student's grade and goals, then suggests the right course — IELTS prep vs spoken English, Math 8 vs Math 9 — without an admissions counselor." },
    ],
    workflow: [
      { step: 1, title: "Parent WhatsApps or fills your website form" },
      { step: 2, title: "BotNira asks student name, grade, course interest, language" },
      { step: 3, title: "Pitches the right course + fee, books a trial class" },
      { step: 4, title: "Sends a welcome pack — class link, prep instructions, your address" },
    ],
    faqs: [
      { q: "Can it handle batch / class scheduling?", a: "Yes. Configure your batches once and BotNira knows what's available, what's full, and what starts next month." },
      { q: "Does it speak Indian regional languages?", a: "Yes — Hindi, Punjabi, Tamil, Telugu, Bengali, Marathi, Gujarati, Malayalam, Kannada, and 80+ others. Train it once in English, it answers in any language." },
      { q: "Can it negotiate fees or give discounts?", a: "Configurable — set rules like 'sibling 10% off' or 'early-bird discount before X date' and BotNira applies them automatically." },
      { q: "Will it work for online-only coaching?", a: "Yes. Web widget + WhatsApp + email — all the channels online coaching businesses already live on." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "home-services",
    icon: Briefcase,
    industry: "Home Services",
    seo: {
      title: "AI Receptionist for Plumbers, Electricians & HVAC | BotNira",
      description: "BotNira dispatches plumbers, electricians, HVAC technicians and cleaners — captures the job, address, urgency, books the right tech and quotes simple visits 24/7.",
      keywords: "ai receptionist for plumber, electrician chatbot, hvac dispatch ai, home services booking ai, cleaning service virtual receptionist, after hours emergency plumber",
    },
    hero: {
      eyebrow: "For Plumbers, Electricians, HVAC & Cleaners",
      h1: "Dispatch your crew without picking up the phone.",
      sub: "Customers don't wait when their basement floods. BotNira picks up every call. Captures the job, urgency, address. Dispatches your nearest available tech. Quotes routine visits — emergency calls go to the top of the queue.",
      stat: { kpi: "$340", label: "average emergency-call ticket — every missed call after hours = real money lost" },
    },
    why: [
      { title: "Capture emergencies the moment they happen", body: "Burst pipe at 2am? BotNira books the job, captures the address, gets the tech a 30-min arrival window — even while you sleep." },
      { title: "Right tech, right job", body: "Electrical issue? Plumbing? HVAC? BotNira routes by skillset to the right specialist on your team." },
      { title: "Quotes routine visits instantly", body: "Drain cleaning, faucet replacement, AC tune-up — BotNira quotes from your service catalog and books on the spot." },
      { title: "Reduces no-shows", body: "Confirmation + 24h reminder + 2h 'tech is on the way' notification = customers home, tech doesn't waste a trip." },
    ],
    workflow: [
      { step: 1, title: "Customer calls / texts with a service need" },
      { step: 2, title: "BotNira asks job type, urgency, address" },
      { step: 3, title: "Books the nearest available technician" },
      { step: 4, title: "Sends arrival window + tech name + photo" },
    ],
    faqs: [
      { q: "Can BotNira route by zip code?", a: "Yes. Configure service zones, and BotNira dispatches the closest tech." },
      { q: "What about emergency vs routine pricing?", a: "Set after-hours / weekend / holiday rates in your business profile. BotNira quotes accordingly and is upfront about it." },
      { q: "Does it integrate with ServiceTitan / Jobber?", a: "Roadmap. Today, jobs land in your BotNira dashboard for your dispatcher to push into your existing tool." },
      { q: "Can it answer 'how much does X cost' questions?", a: "Yes — configure your standard pricing once and BotNira quotes consistently." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: "healthcare-clinic",
    icon: Calendar,
    industry: "Healthcare Clinic",
    seo: {
      title: "AI Receptionist for Healthcare Clinics & Doctors | BotNira",
      description: "BotNira books patient appointments, handles insurance questions, runs intake and triages — for family doctors, specialists, physiotherapy, mental-health and walk-in clinics.",
      keywords: "ai receptionist for doctor, healthcare chatbot, patient booking ai, clinic virtual receptionist, physiotherapy booking ai, walk in clinic automation",
    },
    hero: {
      eyebrow: "For Healthcare Clinics & Specialists",
      h1: "An AI front desk that understands every patient, in every language.",
      sub: "Family doctors, specialists, walk-in clinics, physiotherapy, mental-health practices — BotNira books appointments, handles intake, answers insurance and prescription questions, and routes urgent cases to a human.",
      stat: { kpi: "11 minutes", label: "average phone hold time at busy clinics — patients hang up and search for another doctor" },
    },
    why: [
      { title: "End the hold-music problem", body: "Patients calling busy clinics wait 10+ minutes on hold and often hang up. BotNira answers in seconds, every time." },
      { title: "Patient intake before they walk in", body: "Insurance details, presenting symptoms, medication list — captured before the appointment. Doctors get a head start, patients get faster care." },
      { title: "Triage urgent vs routine", body: "Chest pain → BotNira tells the patient to call 911 immediately and flags your team. Cold symptoms → routine slot in 3 days." },
      { title: "Multi-language for diverse practices", body: "Patient bringing a parent who only speaks Mandarin? BotNira handles the entire conversation in their language." },
    ],
    workflow: [
      { step: 1, title: "Patient calls or messages your clinic" },
      { step: 2, title: "BotNira identifies the issue + insurance" },
      { step: 3, title: "Books the right slot — emergency, routine, or specialist" },
      { step: 4, title: "Pre-fills intake, sends prep instructions, drives reminders" },
    ],
    faqs: [
      { q: "Is this safe for medical conversations?", a: "BotNira is configured to never give medical diagnoses or advice. It triages and books — actual medical guidance stays with your clinicians. Conversations are encrypted in transit, tenant-isolated, and never used for AI training." },
      { q: "Can it handle prescription refill requests?", a: "Yes. It captures medication name, dosage, last refill date, and routes to your pharmacy team for review." },
      { q: "What about cancellations and rescheduling?", a: "Patients can reschedule with one tap. The freed slot goes back in your calendar for someone on the waitlist." },
      { q: "Does it integrate with EMR systems?", a: "Direct integrations with leading EMRs (OSCAR, Accuro, OpenEMR) are on our roadmap. Today, BotNira pushes structured intake data to your dashboard for your team to import." },
    ],
  },
];

// Helper for the landing page card → use case page link
export function findUseCaseBySlug(slug) {
  return USE_CASE_PAGES.find((u) => u.slug === slug);
}
