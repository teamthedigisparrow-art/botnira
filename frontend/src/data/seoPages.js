// SEO-targeted landing pages aimed at *search-intent* keywords
// (different from /use-case/<industry> pages which target verticals).
// Each entry drives a top-level URL — e.g. /ai-sales-agent.

import {
  PhoneCall, Calendar, Globe, Users, MessageCircle, Headphones,
} from "lucide-react";

export const SEO_PAGES = [
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "ai-sales-agent",
    path: "/ai-sales-agent",
    icon: PhoneCall,
    intent: "AI Sales Agent",
    seo: {
      title: "AI Sales Agent | BotNira — Books Demos, Qualifies Leads, Sells 24/7",
      description: "BotNira is an AI sales agent that calls and chats with your prospects, qualifies leads, books demos and closes deals — across phone, WhatsApp, email and web chat. Replace 3 SDRs.",
      keywords: "ai sales agent, ai sales rep, virtual sales assistant, automated sales calls, ai sdr, ai bdr, ai lead qualification, sales automation software",
    },
    hero: {
      eyebrow: "AI Sales Agent",
      h1: "An AI sales agent that calls, qualifies and books — 24/7.",
      sub: "BotNira handles outbound calls, replies to every inbound inquiry, qualifies leads using your ICP, books demos on your calendar, and never asks for a salary. Works across phone, WhatsApp, email and your website chat.",
      stat: { kpi: "1 BotNira", label: "replaces ~3 SDRs at a fraction of the cost — and works every weekend, every holiday, every night." },
    },
    problem: {
      title: "Why human-only sales teams break",
      points: [
        "60% of inbound leads never get a response within 5 minutes — by then they've moved on to your competitor.",
        "SDR turnover is 18 months. You spend more time hiring and onboarding than selling.",
        "Cold calling has a 2% connection rate when humans dial — and your team hates doing it.",
        "Your reps can't follow up with 500 prospects a week. BotNira can — without burning the relationship.",
      ],
    },
    how: [
      { step: 1, title: "Train BotNira on your offer", body: "Paste your sales deck, pricing, ICP and objection-handling notes. BotNira learns your product and your sales motion in minutes." },
      { step: 2, title: "Connect your channels", body: "Plug in WhatsApp, your Twilio voice number, your inbox email and the BotNira widget on your site. Inbound + outbound, all unified." },
      { step: 3, title: "Run outbound + answer inbound", body: "BotNira calls or emails prospects in your cold list (paced 5–45 min between sends to stay out of spam) and answers every inbound lead in seconds." },
      { step: 4, title: "Hand off hot leads to humans", body: "Qualified leads land on your calendar with a full conversation transcript. Your reps spend time on demos, not on dialing." },
    ],
    faqs: [
      { q: "Does it sound like a real human on phone calls?", a: "Yes — BotNira uses ultra-realistic voice models and matches your brand tone. Most prospects don't realise they're talking to AI until BotNira tells them." },
      { q: "Can it really qualify leads as well as a human SDR?", a: "For routine qualification (budget, timeline, decision-maker, fit) BotNira matches a trained SDR. For nuanced enterprise objections, it hands off to your AE with a full transcript." },
      { q: "What happens if a prospect asks something off-script?", a: "BotNira either answers from your knowledge base, asks a clarifying question, or politely says \"let me get our team to follow up\" and notifies your reps." },
      { q: "Will my outreach get marked as spam?", a: "BotNira paces sends with 5–45 minute random delays and auto-includes unsubscribe + CASL/CAN-SPAM compliance. Our typical user keeps domain reputation green." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "ai-appointment-booking-software",
    path: "/ai-appointment-booking-software",
    icon: Calendar,
    intent: "AI Appointment Booking",
    seo: {
      title: "AI Appointment Booking Software | BotNira — Books, Confirms, Reminds",
      description: "BotNira is AI appointment booking software for clinics, salons, lawyers, consultants and service businesses. Books across phone, WhatsApp, web chat and email — confirms, reschedules and sends reminders automatically.",
      keywords: "ai appointment booking software, automated appointment scheduling, ai booking system, online appointment booking ai, scheduling automation, ai scheduling assistant",
    },
    hero: {
      eyebrow: "AI Appointment Booking",
      h1: "Appointment booking, fully automated by AI.",
      sub: "BotNira takes appointment requests on phone, WhatsApp, web chat and email — checks your real calendar, offers the right slot in the customer's language, confirms, and sends reminders. Cancellations get refilled automatically.",
      stat: { kpi: "73%", label: "of appointment requests happen outside business hours. BotNira books every one." },
    },
    problem: {
      title: "The hidden cost of manual booking",
      points: [
        "Every missed call after hours is a customer who'll book with your competitor.",
        "Front-desk staff lose 2+ hours a day to phone tag, no-shows and re-confirmations.",
        "Static booking links don't work in WhatsApp and feel cold — customers want to chat, not click a link.",
        "No-shows cost service businesses 10–25% of revenue. Smart reminders cut that in half.",
      ],
    },
    how: [
      { step: 1, title: "Connect your calendar", body: "Native integrations with Google Calendar, Outlook + a built-in BotNira calendar — all your team's availability in one view." },
      { step: 2, title: "Customer messages or calls", body: "On WhatsApp, web chat, phone, SMS or email — BotNira picks up in seconds and asks what service + when." },
      { step: 3, title: "Smart slot suggestion", body: "BotNira offers the closest available slot, respects buffer times, multi-staff routing and service durations." },
      { step: 4, title: "Confirm, remind, reschedule", body: "Confirmation sent on the same channel the customer used. 24h + 2h reminders go out automatically. One-tap reschedule." },
    ],
    faqs: [
      { q: "Does it work without a calendar tool?", a: "Yes — BotNira has a built-in scheduling engine so you don't need Google Calendar or Outlook. If you do use one, we sync both ways." },
      { q: "Can it handle multi-staff scheduling?", a: "Absolutely. Each staff member has their own availability, services and pricing — BotNira routes the customer to the right person automatically." },
      { q: "What about cancellations and refills?", a: "Cancellations free up the slot instantly. If you have a waitlist enabled, BotNira will message the next person and refill the slot." },
      { q: "Does it send SMS/WhatsApp reminders?", a: "Yes — automated reminders 24h and 2h before, on the channel the customer used to book. Vendor controls timing and template." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "ai-chatbot-for-immigration-consultants",
    path: "/ai-chatbot-for-immigration-consultants",
    icon: Globe,
    intent: "Immigration Consultant AI Chatbot",
    seo: {
      title: "AI Chatbot for Immigration Consultants | BotNira — Capture, Qualify, Book Consults",
      description: "BotNira is the AI chatbot built for immigration consultants and law firms. Answers visa questions in 90+ languages, qualifies prospects by program eligibility, books consultations 24/7 on phone, WhatsApp and web.",
      keywords: "ai chatbot for immigration consultants, immigration law firm chatbot, visa consultant ai, immigration practice automation, multilingual immigration chatbot, lead capture for rcic, rcic chatbot",
    },
    hero: {
      eyebrow: "For Immigration Consultants, RCICs & Law Firms",
      h1: "An AI chatbot built for immigration consultants.",
      sub: "BotNira pre-qualifies prospects by program (Express Entry, PNP, Study Visa, Family Sponsorship, Work Permit), captures their CRS / eligibility profile, books paid consultations and follows up — in 90+ languages.",
      stat: { kpi: "10×", label: "lead-capture lift typical for RCIC firms in the first month — most visitors leave English-only forms blank but chat in their native language." },
    },
    problem: {
      title: "Why immigration practices leak revenue",
      points: [
        "Prospects from non-English-speaking countries don't fill English-only contact forms. They want to chat in Punjabi, Hindi, Mandarin, Arabic, Tagalog, Spanish or French.",
        "Routine eligibility questions (\"Am I eligible for Express Entry with 7-band IELTS?\") consume hours of consultant time before any payment is made.",
        "Time-zone gaps mean leads from Asia or the Middle East go to voicemail while you sleep — and choose someone else by morning.",
        "Manual lead scoring is inconsistent. Without standard intake, hot prospects fall through the cracks.",
      ],
    },
    how: [
      { step: 1, title: "Train on your immigration practice", body: "BotNira learns the programs you serve (Express Entry, PNP, Study Visa, Family Sponsorship, etc.), your fee structure, intake questions and disclaimers." },
      { step: 2, title: "Plug into WhatsApp + your website", body: "WhatsApp matters in immigration — most prospects from South Asia, MENA and LATAM start there. BotNira speaks their language." },
      { step: 3, title: "Pre-qualifies leads", body: "Asks for age, education, IELTS/CELPIP score, work experience, NOC code, family status — and tells the prospect their rough eligibility before booking a paid consult." },
      { step: 4, title: "Books paid consultations", body: "BotNira sends a Stripe payment link, books the slot once paid, and pushes the full intake transcript to your dashboard." },
    ],
    faqs: [
      { q: "Will BotNira give immigration advice?", a: "Never. BotNira is configured to share general program information and pre-qualify on objective criteria — but explicitly tells prospects that final advice must come from a licensed RCIC or lawyer. You stay compliant." },
      { q: "Which languages does it actually handle?", a: "90+ including Punjabi, Hindi, Urdu, Mandarin, Tagalog, Arabic, Farsi, Spanish, Portuguese, French and Russian — and the prospect picks the language; BotNira matches." },
      { q: "Can it capture documents securely?", a: "Yes — BotNira can request and receive document uploads (passport scans, IELTS results, etc.) which land in your encrypted dashboard. Tenant-isolated, never used for AI training." },
      { q: "How does pricing work for small firms?", a: "Starts at $49/mo for solo RCICs. Most firms run on the Growth plan ($149/mo) with 500 voice minutes and 8000 AI messages." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "replace-sales-team-with-ai",
    path: "/replace-sales-team-with-ai",
    icon: Users,
    intent: "Replace Sales Team with AI",
    seo: {
      title: "Replace Your Sales Team with AI | BotNira — Cut Headcount, Lift Revenue",
      description: "Replace expensive sales teams with an AI that calls, qualifies, books and closes 24/7. BotNira costs less than one SDR and works across phone, WhatsApp, email and chat — every weekend, every holiday.",
      keywords: "replace sales team with ai, ai instead of sdr, ai sales automation, cut sales headcount, ai sales rep replacement, save on sdr cost, ai sales agent vs human",
    },
    hero: {
      eyebrow: "Replace Your Sales Team with AI",
      h1: "Replace your sales team with AI — and watch revenue climb.",
      sub: "BotNira does the work of 3 SDRs at a fraction of the cost: outbound calls, inbound chat, lead qualification, demo booking, follow-ups and CRM hygiene. No PTO, no quotas, no burnout.",
      stat: { kpi: "~$8,000/mo", label: "saved vs hiring one SDR — and BotNira works 24/7 in 90+ languages without complaining." },
    },
    problem: {
      title: "Why sales teams are the highest-cost, highest-churn part of every business",
      points: [
        "An SDR in North America costs $60–90K/year fully loaded. BotNira Pro is $399/mo.",
        "Average SDR tenure is 14–18 months. You spend more time hiring than they spend selling.",
        "Humans answer ~30% of inbound calls outside business hours. BotNira answers 100%.",
        "Cold-call burnout is real. Reps go quiet at 4pm Friday. BotNira keeps dialing.",
      ],
    },
    how: [
      { step: 1, title: "Identify what your team actually does", body: "Most SDR work is routine: qualify by ICP, ask 4 standard questions, book a demo if hot. BotNira handles 100% of that." },
      { step: 2, title: "Plug BotNira into your channels", body: "Phone, WhatsApp, email, chat — every prospect touchpoint, unified into one inbox." },
      { step: 3, title: "BotNira runs outbound + inbound", body: "Calls your cold list with smart pacing, replies to every web inquiry in seconds, runs eligibility/budget/timeline qualification, books qualified demos on your AE's calendar." },
      { step: 4, title: "Keep the humans for closing", body: "Your senior reps focus on demos and contracts. BotNira does the high-volume, low-value work — and your top line goes up while payroll goes down." },
    ],
    faqs: [
      { q: "Is BotNira really good enough to replace a human SDR?", a: "For top-of-funnel work (qualify, book, follow-up) — yes, equal or better. For deep technical discovery and enterprise negotiation, you still want humans. BotNira is the SDR replacement, not the AE replacement." },
      { q: "What if a prospect doesn't want to talk to AI?", a: "BotNira identifies itself when asked, and offers to connect a human. About 5% of prospects ask — the other 95% just want their question answered." },
      { q: "How fast can we switch over?", a: "Most teams replace inbound qualification in their first week. Outbound takes 2–3 weeks of script tuning. You can run BotNira alongside a human team during the transition." },
      { q: "What about CRM updates and reporting?", a: "BotNira logs every conversation, qualification, booking and follow-up in your BotNira dashboard. CRM integrations (HubSpot, Salesforce, Pipedrive) are on the roadmap; today, we push CSV exports." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "whatsapp-ai-assistant",
    path: "/whatsapp-ai-assistant",
    icon: MessageCircle,
    intent: "WhatsApp AI Assistant",
    seo: {
      title: "WhatsApp AI Assistant | BotNira — Verified Business Bot, 24/7 Replies",
      description: "BotNira is a WhatsApp AI assistant for businesses. Verified WhatsApp Business API, multi-language replies, lead capture, appointment booking, payment links — fully managed setup in minutes.",
      keywords: "whatsapp ai assistant, whatsapp business chatbot, whatsapp ai for business, whatsapp api chatbot, whatsapp automated reply, whatsapp customer service ai, whatsapp ai for small business",
    },
    hero: {
      eyebrow: "WhatsApp AI Assistant",
      h1: "Your WhatsApp, answered by AI — 24/7.",
      sub: "BotNira connects to the official WhatsApp Business API in minutes, replies to every message in your business's voice, books appointments, captures leads and sends payment links — in 90+ languages.",
      stat: { kpi: "2 billion+", label: "people use WhatsApp daily. Your customers are there. Be there to answer them — even at midnight." },
    },
    problem: {
      title: "Why WhatsApp is the channel you can't ignore",
      points: [
        "Customers expect a response in under 5 minutes on WhatsApp. Your team can't, BotNira can.",
        "Email open rates are 20%. WhatsApp open rates are 98%. If you're not on WhatsApp, you're invisible.",
        "Most WhatsApp tools require a developer to set up. BotNira connects via Meta's Embedded Signup in 90 seconds.",
        "Language is a real barrier. WhatsApp is global — your replies need to be too.",
      ],
    },
    how: [
      { step: 1, title: "Connect via Embedded Signup", body: "One click. Meta's official 2-minute popup walks you through linking your WhatsApp Business Account — no SDKs, no API keys to manage." },
      { step: 2, title: "Train BotNira on your business", body: "Paste your services, hours, FAQs and pricing. BotNira learns your tone and responds like a member of your team." },
      { step: 3, title: "Auto-reply with intent", body: "Every inbound message gets a smart reply: book a slot, send a quote, capture lead info, route urgent messages to a human." },
      { step: 4, title: "Send & receive payments", body: "BotNira can send Stripe checkout links inside the WhatsApp thread and confirm bookings only after payment lands." },
    ],
    faqs: [
      { q: "Do I need a separate WhatsApp Business app?", a: "No — BotNira uses Meta's Cloud API, which means you keep your business number but operate it programmatically. No mobile app needed." },
      { q: "Can I still answer messages manually?", a: "Yes. The BotNira Unified Inbox lets you take over any conversation in one click. AI continues to handle the rest." },
      { q: "What about template messages and the 24h rule?", a: "BotNira respects Meta's 24-hour customer service window. Outside the window, you can send pre-approved templates — our template manager helps you get those approved." },
      { q: "Is this compliant with Meta's policies?", a: "Yes — BotNira is built on Meta's official Cloud API. You stay verified, you stay compliant, you stay in good standing with WhatsApp." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "24-7-ai-receptionist",
    path: "/24-7-ai-receptionist",
    icon: Headphones,
    intent: "24/7 AI Receptionist",
    seo: {
      title: "24/7 AI Receptionist | BotNira — Always-On Front Desk for Every Business",
      description: "BotNira is a 24/7 AI receptionist that answers every call, WhatsApp and email — books appointments, takes messages, qualifies leads. Never miss a customer at 2am, on weekends, or during holidays.",
      keywords: "24/7 ai receptionist, ai receptionist, ai virtual receptionist, after hours receptionist, ai phone answering, automated receptionist, ai answering service, 24 7 ai answering service",
    },
    hero: {
      eyebrow: "24/7 AI Receptionist",
      h1: "A 24/7 AI receptionist your customers will actually like.",
      sub: "Every call, WhatsApp, email and chat — answered the moment it lands, day or night, in the customer's language. Books appointments, captures leads, escalates emergencies to a human, never goes to voicemail.",
      stat: { kpi: "$15K+/year", label: "saved vs a part-time receptionist — and BotNira works 168 hours a week, not 40." },
    },
    problem: {
      title: "The cost of missed calls is enormous",
      points: [
        "62% of calls to small businesses go unanswered. Each one is a customer choosing your competitor.",
        "After-hours and weekend calls are typically 100% lost — voicemail is the new \"closed\" sign.",
        "An answering service is $300–800/mo and reads from a script. BotNira books, qualifies and remembers.",
        "Customers want a real conversation, not a phone tree. BotNira talks like a person — in their language.",
      ],
    },
    how: [
      { step: 1, title: "Pick a number or use your own", body: "BotNira provisions a local phone number on Twilio, or you forward calls from your existing business number to it." },
      { step: 2, title: "Train on your business", body: "Hours, services, address, pricing, common FAQs — BotNira learns your business and your tone in minutes." },
      { step: 3, title: "BotNira picks up — every time", body: "Inbound call rings → BotNira answers in under 1 second → understands the request → books / qualifies / takes a message." },
      { step: 4, title: "You see everything in one inbox", body: "Every call transcript, voicemail, booking and lead — in the BotNira Unified Inbox. Pick up where BotNira left off, anytime." },
    ],
    faqs: [
      { q: "Will it actually sound like a real person?", a: "Yes — BotNira uses real-time ultra-realistic voice models. Most callers don't realise they're talking to AI." },
      { q: "What about emergencies?", a: "Configure emergency triggers (\"chest pain\", \"flooding\", etc.) and BotNira escalates to a human number you provide, immediately." },
      { q: "Does it work with my existing phone number?", a: "Yes — set up call forwarding from your existing business number to BotNira on any condition (always, busy, no-answer). Customers keep dialing the same number." },
      { q: "How much does it cost compared to a human?", a: "Starter $49/mo, Growth $149/mo, Pro $399/mo. A part-time human receptionist is $1,500+/mo. A 24/7 answering service is $300–800/mo and doesn't book or qualify." },
    ],
  },
];

export function findSeoPageBySlug(slug) {
  return SEO_PAGES.find((p) => p.slug === slug);
}
