import { Link } from "react-router-dom";
import BrandMark from "../components/BrandMark";

const LegalNav = () => (
  <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-black">
    <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2" data-testid="legal-brand">
        <BrandMark size={32} />
        <span className="font-display font-black text-xl tracking-tight">BotNira</span>
      </Link>
      <div className="flex items-center gap-6 text-sm font-bold">
        <Link to="/privacy" className="hover:text-[#002FA7]">Privacy</Link>
        <Link to="/terms" className="hover:text-[#002FA7]">Terms</Link>
      </div>
    </div>
  </nav>
);

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white" data-testid="privacy-page">
      <LegalNav />
      <main className="max-w-3xl mx-auto px-6 py-16 prose prose-neutral">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Legal</div>
        <h1 className="font-display text-5xl font-black tracking-tighter mt-2">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 mt-2 font-mono">Last updated: {new Date().toISOString().slice(0,10)}</p>

        <section className="mt-10 space-y-4">
          <p>
            BotNira ("we", "our", "us", operated by <strong>The Digi Sparrow</strong>) provides an AI-powered
            receptionist platform that lets businesses ("Vendors") answer customer inquiries and book
            appointments across multiple channels including web chat, WhatsApp, SMS and email, and integrates
            with third-party tools such as Google Calendar. This Privacy Policy explains what information we
            collect, how we use it, and the choices you have.
          </p>
        </section>

        <Section n="1" title="Who is covered by this policy">
          <ul>
            <li><strong>Vendors</strong> — businesses who sign up for a BotNira workspace.</li>
            <li><strong>End users</strong> — individuals who chat, call, message or email a Vendor whose front desk runs on BotNira.</li>
          </ul>
          <p>Vendors are the <em>Data Controllers</em> of their End users' conversations. BotNira acts as the <em>Data Processor</em> on their behalf.</p>
        </Section>

        <Section n="2" title="Information we collect">
          <p><strong>From Vendors at signup and while using the service</strong></p>
          <ul>
            <li>Full name, business name, work email, hashed password</li>
            <li>Business description, FAQs and tone settings you paste into Bot Studio</li>
            <li>Channel credentials you connect (WhatsApp Business Account IDs, phone number IDs, access tokens issued by Meta)</li>
            <li>Billing information processed by our payment provider (we never store card numbers)</li>
          </ul>
          <p><strong>From End users (customers who contact your business)</strong></p>
          <ul>
            <li>Their name and phone number / email when provided (including WhatsApp profile name)</li>
            <li>The text of each message they exchange with BotNira</li>
            <li>Basic metadata: channel, timestamps, message delivery status</li>
          </ul>
          <p><strong>Automatically</strong></p>
          <ul>
            <li>Standard server logs (IP address, user agent, API endpoints called)</li>
            <li>A single cookie / localStorage key in the embeddable web widget to remember a conversation</li>
          </ul>
        </Section>

        <Section n="3" title="How we use the information">
          <ul>
            <li><strong>Deliver the service</strong> — route messages to/from the Vendor's trained bot, show conversations in the Inbox, schedule appointments.</li>
            <li><strong>Train the Vendor's bot in real time</strong> — we send the Vendor's business description + FAQs (never End-user data from other Vendors) to our LLM provider as grounding context.</li>
            <li><strong>Billing & usage metering</strong> — count messages, minutes, and appointments for the Vendor's plan.</li>
            <li><strong>Security & abuse prevention</strong> — rate-limit, detect fraud, and audit access.</li>
          </ul>
          <p>We do <strong>not</strong> sell End-user data. We do not use End-user data to train general-purpose AI models.</p>
        </Section>

        <Section n="4" title="Third-party processors">
          <p>To run BotNira we share the minimum necessary data with:</p>
          <ul>
            <li><strong>Meta Platforms Inc.</strong> — for WhatsApp Business Cloud API (receiving + sending messages).</li>
            <li><strong>BotNira's AI engine</strong> — to generate the AI replies (we send the Vendor's business info + the current conversation, never a customer's private data outside of what they themselves typed).</li>
            <li><strong>MongoDB Atlas</strong> — as our primary database.</li>
            <li><strong>Stripe</strong> — payment processing (we never see full card numbers).</li>
          </ul>
          <p>Each processor is contractually bound to handle data only on our instructions and in line with applicable data-protection laws.</p>
        </Section>

        <Section n="5" title="WhatsApp data specifically (required disclosure)">
          <p>
            When a Vendor connects their WhatsApp number to BotNira through Meta's Embedded Signup,
            we receive the WhatsApp Business Account ID, Phone Number ID and an access token scoped
            to that Vendor's account.
          </p>
          <ul>
            <li>We use these tokens <strong>only</strong> to send and receive messages on behalf of the Vendor.</li>
            <li>Message content is stored in our database for the Vendor to view in their Inbox.</li>
            <li>We do not share WhatsApp message content with any third party other than the AI providers listed above, and only to generate an immediate reply.</li>
            <li>A Vendor can disconnect WhatsApp at any time from <em>Channels → WhatsApp → Disconnect</em>; tokens are revoked and no further messages flow through BotNira.</li>
          </ul>
        </Section>

        <Section n="6" title="Google user data (Google Calendar integration)">
          <p>
            If a Vendor chooses to connect their Google Calendar, BotNira requests access to that Vendor's
            Google Account through Google's OAuth&nbsp;2.0 consent screen. This section discloses exactly how
            BotNira accesses, uses, stores and shares Google user data, in accordance with the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline font-bold">Google API Services User Data Policy</a>.
          </p>
          <p><strong>Scopes we request and why</strong></p>
          <ul>
            <li><code>.../auth/calendar</code> — to read the Vendor's calendar busy/free times and existing events (so the AI receptionist never double-books a slot) and to create, update and delete the appointment events that BotNira books on the Vendor's behalf.</li>
            <li><code>.../auth/userinfo.email</code> and <code>openid</code> — to identify which Google Account was connected and display that email address in the Vendor's dashboard.</li>
          </ul>
          <p><strong>How we access it</strong> — Access occurs only after the Vendor explicitly grants consent on Google's screen, and only for that Vendor's own Google Account. End users who book appointments never connect their Google accounts.</p>
          <p><strong>How we use it</strong></p>
          <ul>
            <li>Read upcoming events and busy periods to calculate real-time availability and prevent double-booking across BotNira and Google Calendar.</li>
            <li>Create and manage calendar events for appointments booked through BotNira (via voice, chat, WhatsApp, or the public booking page).</li>
            <li>Display the connected account's email so the Vendor knows which calendar is linked.</li>
          </ul>
          <p><strong>How we store it</strong> — We store the OAuth access token and refresh token for the connected account in our secured backend database (encrypted in transit and at rest). These tokens are never exposed to client-side code and are never accessible to any other Vendor. Calendar busy/free data is read on demand to compute availability; it is not repurposed or resold.</p>
          <p><strong>How we share it</strong> — We do <strong>not</strong> sell, rent, or transfer Google user data to third parties. We do <strong>not</strong> use Google user data to develop, improve, or train generalized or non-personalized AI/ML models. Google user data is used solely to provide and improve the user-facing calendar-sync feature the Vendor has explicitly enabled.</p>
          <p>
            <strong>Limited Use.</strong> BotNira's use and transfer to any other app of information received from
            Google APIs will adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener noreferrer" className="underline font-bold">Google API Services User Data Policy</a>, including the Limited Use requirements.
          </p>
          <p><strong>Revoking access &amp; deletion</strong> — A Vendor can disconnect Google Calendar at any time from <em>Appointments → Calendars → Disconnect</em>, which deletes the stored tokens from our systems. Vendors may also revoke BotNira's access directly at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline font-bold">myaccount.google.com/permissions</a>. On disconnection or workspace deletion, all stored Google tokens and cached calendar data are permanently deleted within 30 days.</p>
        </Section>

        <Section n="7" title="How long we retain data">
          <ul>
            <li><strong>Conversations & transcripts</strong>: retained for as long as the Vendor's workspace is active. Vendors can delete individual conversations at any time.</li>
            <li><strong>Billing records</strong>: 7 years (legal requirement).</li>
            <li>When a Vendor deletes their workspace, all associated conversations, messages, appointments and integration tokens are permanently deleted within 30 days.</li>
          </ul>
        </Section>

        <Section n="8" title="Your rights">
          <p>Depending on your jurisdiction (GDPR, PIPEDA, CCPA), you have the right to:</p>
          <ul>
            <li>Access a copy of your data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion ("right to be forgotten")</li>
            <li>Object to processing and/or withdraw consent</li>
            <li>Port your data to another provider</li>
          </ul>
          <p>
            End users should direct requests to the Vendor they interacted with (the Data Controller). Vendors
            can email us directly — see contact below — and we respond within 30 days.
          </p>
        </Section>

        <Section n="9" title="Security">
          <p>
            We encrypt data in transit (TLS 1.2+) and at rest. Access tokens are stored only in our backend
            database, never in client-side code. Production access is restricted to a small number of
            authorised engineers and logged.
          </p>
        </Section>

        <Section n="10" title="International transfers">
          <p>
            BotNira is operated from Canada. Data may be transferred to and processed in the United States
            and the European Union by our sub-processors listed above, each under Standard Contractual Clauses.
          </p>
        </Section>

        <Section n="11" title="Children">
          <p>BotNira is not directed at children under 16 and we do not knowingly collect their data.</p>
        </Section>

        <Section n="12" title="Changes to this policy">
          <p>If we materially change this policy we'll notify active Vendors by email 30 days before the change takes effect.</p>
        </Section>

        <Section n="13" title="Contact us">
          <p>
            Data protection queries: <strong>privacy@thedigisparrow.com</strong><br/>
            Mailing: The Digi Sparrow, Toronto, Canada
          </p>
        </Section>

        <div className="mt-16 border-t-2 border-black pt-8 text-sm text-neutral-600">
          This Privacy Policy is specifically written to comply with Meta Platforms' WhatsApp Business API Terms
          (see <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="underline font-bold">WhatsApp Business Policy</a>)
          and applicable data-protection regulations including GDPR and PIPEDA.
        </div>
      </main>
    </div>
  );
}

const Section = ({ n, title, children }) => (
  <section className="mt-10">
    <h2 className="font-display text-2xl font-black tracking-tight">
      <span className="text-[#002FA7] mr-2">{n}.</span>{title}
    </h2>
    <div className="mt-3 space-y-3 text-neutral-800 leading-relaxed">{children}</div>
  </section>
);
