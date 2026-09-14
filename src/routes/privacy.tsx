import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ChAi | AI Customer Retention" },
      {
        name: "description",
        content:
          "Read ChAi's Privacy Policy. Learn how we collect, use, and protect your personal information.",
      },
      { property: "og:title", content: "ChAi Privacy Policy" },
      {
        property: "og:description",
        content:
          "Read ChAi's Privacy Policy. Learn how we collect, use, and protect your personal information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

const signup = { mode: "signup" as const, demo: false, redirect: undefined };
const login = { mode: undefined, demo: false, redirect: undefined };

const navItems = [
  { label: "Product", href: "/#product" },
  { label: "Integrations", href: "/#integrations" },
];

function PrivacyPage() {
  const [scrolled, setScrolled] = useState(false);
  const { open: demoOpen, openGate, closeGate } = useDemoGate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
      {/* ── Nav ─────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-white/10 bg-navy/70 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-light.png" alt="ChAi" className="h-9 w-auto" />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {n.label}
              </a>
            ))}
            <Link
              to="/pricing"
              className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={openGate}
              className="hidden rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              View Demo
            </button>
            <Link
              to="/auth"
              search={login}
              className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              to="/auth"
              search={signup}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(32,70,84,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
            >
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy pt-36 pb-20 lg:pt-44 lg:pb-28">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="mesh-drift absolute -right-40 -top-52 h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[120px]" />
          <div className="mesh-drift absolute -bottom-56 -left-40 h-[34rem] w-[34rem] rounded-full bg-[#204654]/30 blur-[130px]" />
          <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
        </div>

        <div className="relative mx-auto max-w-[1280px] px-6 text-center lg:px-8">
          <Reveal className="mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              Legal
            </span>
            <h1 className="mt-7 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl lg:text-[4rem]">
              Privacy Policy
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/65">
              We believe your data belongs to you. This policy explains what we collect, why we collect it, and how we protect it.
            </p>
            <p className="mt-3 text-sm text-white/50">
              Last updated: {new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Privacy content ─────────────────────────────── */}
      <main className="mx-auto max-w-[800px] px-6 py-16 lg:px-8 lg:py-24">
        <article className="prose prose-lg max-w-none text-foreground">
          <Reveal>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <p className="text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">The short version:</strong> ChAi collects the minimum data needed to provide the service. We do not sell your data. We do not use your customer data to train AI models. You can request deletion at any time.
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">1. Who we are</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is operated by <strong>Dominion Agency (Pty) Ltd</strong>, a company incorporated in South Africa (“ChAi,” “we,” “our,” or “us”). ChAi is an AI-powered customer retention platform that helps businesses understand and improve customer health.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              For privacy enquiries, contact us at <a className="text-primary hover:underline" href="mailto:privacy@askchai.tech">privacy@askchai.tech</a>.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">2. Scope of this policy</h2>
            <p className="leading-relaxed text-muted-foreground">This Privacy Policy applies to:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Visitors to our website at <a className="text-primary hover:underline" href="https://askchai.tech">askchai.tech</a></li>
              <li>Users who create a ChAi account or free trial</li>
              <li>Administrators and team members within a ChAi Workspace</li>
              <li>Anyone who contacts us for support or enquiries</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              This policy does not apply to third-party services you connect to ChAi (such as your CRM, accounting software, or helpdesk). Those services have their own privacy policies and you should review them separately.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">3. What we collect</h2>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">3.1 Information you give us directly</h3>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Account information:</strong> your name, email address, password, and business name when you register.</li>
              <li><strong>Billing information:</strong> payment details processed securely via our payment provider (we do not store full card numbers).</li>
              <li><strong>Profile information:</strong> details about your business type, industry, and customer base provided during onboarding to configure your workspace.</li>
              <li><strong>Support communications:</strong> messages you send us via support channels, email, or in-app chat.</li>
              <li><strong>Feedback:</strong> feature requests, bug reports, and other feedback you submit.</li>
            </ul>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">3.2 Customer data you bring into ChAi</h3>
            <p className="leading-relaxed text-muted-foreground">
              When you connect integrations or upload files, ChAi processes data about <em>your</em> customers on your behalf. This may include names, contact details, transaction history, support records, and other business data. You are the data controller for this information. ChAi processes it only to provide the service you’ve requested.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">3.3 Information collected automatically</h3>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Usage data:</strong> pages visited, features used, actions taken, and session duration within the platform.</li>
              <li><strong>Device and technical data:</strong> browser type, operating system, IP address, and referring URL.</li>
              <li><strong>Log data:</strong> server logs including timestamps, error reports, and API calls, retained for security and debugging purposes.</li>
              <li><strong>Cookies and similar technologies:</strong> see Section 10 for details.</li>
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">4. How we use your information</h2>
            <p className="leading-relaxed text-muted-foreground">We use the information we collect to:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Create and manage your account and Workspace</li>
              <li>Provide, operate, and improve the ChAi platform</li>
              <li>Process payments and manage your subscription</li>
              <li>Generate AI-powered insights, health scores, and recommendations from your connected data</li>
              <li>Send transactional emails (account confirmations, billing receipts, password resets)</li>
              <li>Send product updates and feature announcements (you may opt out at any time)</li>
              <li>Respond to support requests and enquiries</li>
              <li>Monitor for security threats and prevent fraud</li>
              <li>Comply with legal obligations</li>
              <li>Analyse aggregated, anonymised usage patterns to improve the product</li>
            </ul>

            <p className="leading-relaxed text-muted-foreground">We process your information on the following legal bases:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Contract performance:</strong> to deliver the service you’ve signed up for</li>
              <li><strong>Legitimate interests:</strong> to operate, secure, and improve our platform</li>
              <li><strong>Legal obligation:</strong> where required by applicable law</li>
              <li><strong>Consent:</strong> for marketing communications (you may withdraw at any time)</li>
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">5. How we share your information</h2>
            <p className="leading-relaxed text-muted-foreground">
              We do not sell your personal information. We share information only in the following circumstances:
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">5.1 Service providers</h3>
            <p className="leading-relaxed text-muted-foreground">
              We use trusted third-party providers to operate ChAi, including cloud hosting, payment processing, email delivery, analytics, and customer support tooling. These providers access data only to perform services on our behalf and are contractually required to protect it.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">5.2 Integrations you authorise</h3>
            <p className="leading-relaxed text-muted-foreground">
              When you connect a third-party integration (e.g. HubSpot, Xero, Zendesk), you authorise ChAi to retrieve data from that service. Data flows are read-only unless expressly stated otherwise. You may disconnect integrations at any time from your Workspace settings.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">5.3 Legal requirements</h3>
            <p className="leading-relaxed text-muted-foreground">
              We may disclose information if required to do so by law, court order, or governmental authority, or where we believe disclosure is necessary to protect the rights, property, or safety of ChAi, our users, or the public.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">5.4 Business transfers</h3>
            <p className="leading-relaxed text-muted-foreground">
              If ChAi is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you before your information becomes subject to a materially different privacy policy.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">5.5 With your consent</h3>
            <p className="leading-relaxed text-muted-foreground">We may share information for other purposes with your explicit consent.</p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">6. Data retention</h2>
            <p className="leading-relaxed text-muted-foreground">We retain your account information for as long as your account is active. If you cancel your subscription:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Your Workspace data is retained for <strong>30 days</strong> so you can export or reactivate.</li>
              <li>After 30 days, your Customer Data is permanently deleted from our production systems.</li>
              <li>Billing records and legal compliance data may be retained longer where required by law.</li>
              <li>Anonymised, aggregated data (with no link to you or your customers) may be retained indefinitely for product improvement.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              You may request earlier deletion at any time by contacting <a className="text-primary hover:underline" href="mailto:privacy@askchai.tech">privacy@askchai.tech</a>.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">7. Security</h2>
            <p className="leading-relaxed text-muted-foreground">
              We take security seriously and implement administrative, technical, and organisational measures to protect your data, including:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Encryption of data in transit (TLS) and at rest</li>
              <li>Secure authentication with role-based access controls</li>
              <li>Regular security monitoring and logging</li>
              <li>Restricted employee access on a need-to-know basis</li>
              <li>Routine backups and disaster recovery procedures</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              No method of electronic storage or internet transmission is 100% secure. We will notify affected users without undue delay in the event of a data breach that poses a risk to their rights and freedoms, in accordance with applicable law.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">8. AI features and your data</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi uses artificial intelligence to generate customer health scores, churn risk indicators, summaries, and recommendations. Here is how we handle your data in relation to AI:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>We do not use your Customer Data to train general-purpose AI models.</strong> Your data is used only to generate insights for your Workspace.</li>
              <li>Where we use third-party AI providers to process data, we select providers that offer enterprise controls designed to prevent your data from being used to train publicly available models.</li>
              <li>AI-generated outputs are probabilistic and may not always be accurate. You remain responsible for reviewing insights before making business decisions.</li>
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">9. Your rights</h2>
            <p className="leading-relaxed text-muted-foreground">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Access:</strong> request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> request that inaccurate or incomplete information be corrected</li>
              <li><strong>Deletion:</strong> request deletion of your personal information, subject to legal retention requirements</li>
              <li><strong>Portability:</strong> request your data in a structured, machine-readable format</li>
              <li><strong>Objection:</strong> object to processing based on legitimate interests</li>
              <li><strong>Restriction:</strong> request that we restrict processing in certain circumstances</li>
              <li><strong>Withdraw consent:</strong> where processing is based on consent, withdraw it at any time without affecting the lawfulness of prior processing</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              To exercise any of these rights, contact us at <a className="text-primary hover:underline" href="mailto:privacy@askchai.tech">privacy@askchai.tech</a>. We will respond within 30 days. We may ask you to verify your identity before processing your request.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              South African residents may also lodge a complaint with the <strong>Information Regulator of South Africa</strong> at <a className="text-primary hover:underline" href="https://www.justice.gov.za/inforeg/" target="_blank" rel="noopener">www.justice.gov.za/inforeg</a>. Users in the European Economic Area or United Kingdom may lodge a complaint with their local data protection authority.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">10. Cookies and tracking</h2>
            <p className="leading-relaxed text-muted-foreground">ChAi uses cookies and similar technologies for the following purposes:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Essential cookies:</strong> required for authentication, session management, and platform security. These cannot be disabled.</li>
              <li><strong>Functional cookies:</strong> remember your preferences and settings within the platform.</li>
              <li><strong>Analytics cookies:</strong> help us understand how the platform is used so we can improve it. Data is aggregated and anonymised where possible.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              You can control non-essential cookies through your browser settings. Disabling cookies may affect some platform functionality.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">11. Children</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is a business platform and is not directed at children under the age of 18. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us with personal information, please contact us and we will delete it promptly.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">12. International data transfers</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is operated from South Africa. If you access the platform from outside South Africa, your information may be transferred to and processed in South Africa or in countries where our service providers operate. We take steps to ensure that such transfers are made in compliance with applicable data protection laws and that your information receives an adequate level of protection.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">13. Changes to this policy</h2>
            <p className="leading-relaxed text-muted-foreground">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. If we make material changes, we will notify you by email or by posting a notice within the platform at least 14 days before the changes take effect. The “Last updated” date at the top of this page will always reflect the most recent version. Your continued use of ChAi after changes take effect constitutes your acceptance of the updated policy.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">14. Contact us</h2>
            <p className="leading-relaxed text-muted-foreground">
              If you have questions, concerns, or requests relating to this Privacy Policy or how we handle your data, please contact us:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Email:</strong> <a className="text-primary hover:underline" href="mailto:privacy@askchai.tech">privacy@askchai.tech</a></li>
              <li><strong>Company:</strong> Dominion Agency (Pty) Ltd, trading as ChAi</li>
              <li><strong>Website:</strong> <a className="text-primary hover:underline" href="https://askchai.tech">askchai.tech</a></li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">We aim to respond to all privacy enquiries within 30 days.</p>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-16 rounded-[20px] border border-border bg-card p-8 text-center shadow-soft">
              <p className="text-base font-semibold text-foreground">Questions about this policy?</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Reach out through our support channels and we’ll be happy to help.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/auth"
                  search={signup}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_-16px_rgba(32,70,84,1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
                >
                  Sign Up <ArrowRight className="h-4.5 w-4.5" />
                </Link>
                <button
                  onClick={openGate}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-7 py-4 text-base font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                >
                  View Demo
                </button>
              </div>
            </div>
          </Reveal>
        </article>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-[1280px] px-6 py-12 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/logo-dark.png" alt="ChAi" className="h-9 w-auto dark:hidden" />
              <img src="/logo-light.png" alt="ChAi" className="hidden h-9 w-auto dark:block" />
            </div>

            <div className="flex flex-col items-center sm:items-end">
              <p className="text-sm font-semibold">Resources</p>
              <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground sm:justify-end">
                <li>
                  <button className="transition-colors hover:text-primary" onClick={openGate}>
                    Live Demo
                  </button>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/terms">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/privacy">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/auth" search={login}>
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
            <p className="hidden sm:block">Built for businesses that run on recurring revenue.</p>
          </div>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}
