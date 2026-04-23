import { Link } from "react-router-dom";

const LegalNav = () => (
  <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-black">
    <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#002FA7] border-2 border-black grid place-items-center">
          <span className="text-white font-black text-sm">B</span>
        </div>
        <span className="font-display font-black text-xl tracking-tight">BotNira</span>
      </Link>
      <div className="flex items-center gap-6 text-sm font-bold">
        <Link to="/privacy" className="hover:text-[#002FA7]">Privacy</Link>
        <Link to="/terms" className="hover:text-[#002FA7]">Terms</Link>
      </div>
    </div>
  </nav>
);

const Section = ({ n, title, children }) => (
  <section className="mt-10">
    <h2 className="font-display text-2xl font-black tracking-tight">
      <span className="text-[#002FA7] mr-2">{n}.</span>{title}
    </h2>
    <div className="mt-3 space-y-3 text-neutral-800 leading-relaxed">{children}</div>
  </section>
);

export default function Terms() {
  return (
    <div className="min-h-screen bg-white" data-testid="terms-page">
      <LegalNav />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Legal</div>
        <h1 className="font-display text-5xl font-black tracking-tighter mt-2">Terms of Service</h1>
        <p className="text-sm text-neutral-500 mt-2 font-mono">Last updated: {new Date().toISOString().slice(0,10)}</p>

        <p className="mt-8 text-neutral-800 leading-relaxed">
          These Terms of Service ("Terms") govern your access to and use of BotNira (the "Service"),
          operated by <strong>The Digi Sparrow</strong> ("BotNira", "we", "our"). By creating an account
          or using the Service you agree to these Terms. If you do not agree, do not use BotNira.
        </p>

        <Section n="1" title="The service">
          <p>
            BotNira is a multi-tenant AI receptionist platform. Businesses ("Vendors") configure a
            branded AI assistant using their own business information and connect it to channels such as
            web chat, WhatsApp, SMS, email and voice calls. The AI answers inbound customer messages
            and books appointments on the Vendor's behalf.
          </p>
        </Section>

        <Section n="2" title="Eligibility and account">
          <ul className="list-disc pl-6 space-y-2">
            <li>You must be at least 18 years old and legally able to enter into a contract.</li>
            <li>You must provide accurate signup information and keep credentials secure.</li>
            <li>You are responsible for all activity on your workspace, including any team members you invite.</li>
            <li>One account per business; sharing accounts is not permitted.</li>
          </ul>
        </Section>

        <Section n="3" title="Acceptable use">
          <p>You agree <strong>not</strong> to use BotNira to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Send unsolicited marketing ("spam") over WhatsApp, SMS, email, or voice.</li>
            <li>Impersonate any person or entity, including other businesses.</li>
            <li>Collect, store, or sell another person's personal data without their consent.</li>
            <li>Violate Meta's <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="underline font-bold">WhatsApp Commerce & Business Policies</a>, including promotion of prohibited goods/services.</li>
            <li>Deceive customers into believing they are chatting with a human when the reply is AI-generated (we recommend disclosing this in your bot's greeting).</li>
            <li>Harass, threaten, or harm any individual.</li>
            <li>Use the Service in connection with unlawful activity of any kind.</li>
            <li>Attempt to reverse-engineer, scrape, or overwhelm the Service.</li>
          </ul>
          <p>
            We may suspend or terminate any account that violates these rules, with or without notice.
            We also comply with all valid legal requests and Meta's enforcement actions.
          </p>
        </Section>

        <Section n="4" title="Channels & third-party services">
          <p>
            Some channels require you to authorise BotNira with a third-party provider
            (Meta WhatsApp, Retell AI, Twilio, Stripe, etc.). You agree to also abide by those providers'
            terms when using them through BotNira. If Meta or another provider suspends your access
            for policy violations, BotNira's ability to deliver that channel will pause until reinstated.
          </p>
        </Section>

        <Section n="5" title="Content ownership and licence">
          <ul className="list-disc pl-6 space-y-2">
            <li>You retain ownership of all content you create on BotNira — business descriptions, FAQs, message history, appointments, recordings.</li>
            <li>You grant BotNira a limited, worldwide licence to process that content solely for the purpose of operating the Service on your behalf.</li>
            <li>You represent you have the rights to all content you upload and the right to respond to the customers messaging you on BotNira-managed channels.</li>
          </ul>
        </Section>

        <Section n="6" title="Pricing, billing and refunds">
          <ul className="list-disc pl-6 space-y-2">
            <li>Plans are billed monthly in advance. All prices are in CAD unless stated otherwise.</li>
            <li>Usage-based charges (voice minutes beyond plan cap, outbound SMS/WhatsApp templates) are metered and invoiced at the end of each billing cycle.</li>
            <li>You can cancel at any time from Settings; you remain responsible for charges already accrued.</li>
            <li>We do not offer prorated refunds for partial months, unless required by applicable law.</li>
            <li>We may update pricing with 30 days' notice by email to your registered address.</li>
          </ul>
        </Section>

        <Section n="7" title="AI output — no warranty of accuracy">
          <p>
            BotNira uses large language models to generate replies. While we ground responses strictly
            in the Vendor's business description and FAQs, AI output may still contain errors or
            inaccuracies. You are solely responsible for the accuracy of the business information you
            provide to BotNira and for monitoring the conversations your bot has. BotNira is not liable
            for decisions your customers make based on AI-generated replies.
          </p>
        </Section>

        <Section n="8" title="Availability and SLA">
          <p>
            We aim for 99.5% monthly uptime but do not guarantee uninterrupted service. Planned
            maintenance will be announced in advance. BotNira is provided "AS IS" without warranties
            of any kind, express or implied, including but not limited to fitness for a particular
            purpose.
          </p>
        </Section>

        <Section n="9" title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, BotNira's total aggregate liability in connection
            with the Service is limited to the fees you paid us in the 12 months preceding the claim.
            We are not liable for indirect, incidental, consequential, special, or punitive damages,
            including loss of profits, revenue, data, or business opportunities.
          </p>
        </Section>

        <Section n="10" title="Termination">
          <p>
            Either party may terminate these Terms at any time. Upon termination, your access ceases
            and we delete your data within 30 days (except records we must retain by law).
          </p>
        </Section>

        <Section n="11" title="Changes to these terms">
          <p>
            We may update these Terms. Material changes will be emailed to active Vendors at least
            30 days before taking effect. Your continued use after the effective date constitutes acceptance.
          </p>
        </Section>

        <Section n="12" title="Governing law">
          <p>
            These Terms are governed by the laws of the Province of Ontario, Canada, without regard to
            conflict-of-law rules. Any dispute will be resolved in the courts of Toronto, Ontario.
          </p>
        </Section>

        <Section n="13" title="Contact">
          <p>
            Questions: <strong>hello@thedigisparrow.com</strong><br/>
            Legal notices: <strong>legal@thedigisparrow.com</strong>
          </p>
        </Section>
      </main>
    </div>
  );
}
