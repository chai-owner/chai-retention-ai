import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — ChAi | AI Customer Retention" },
      {
        name: "description",
        content:
          "Read the ChAi Terms of Service. These terms govern your use of ChAi's AI-powered customer intelligence platform.",
      },
      { property: "og:title", content: "ChAi Terms of Service" },
      {
        property: "og:description",
        content:
          "Read the ChAi Terms of Service. These terms govern your use of ChAi's AI-powered customer intelligence platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

const signup = { mode: "signup" as const, demo: false, redirect: undefined };
const login = { mode: undefined, demo: false, redirect: undefined };

const navItems = [
  { label: "Product", href: "/#product" },
  { label: "Integrations", href: "/#integrations" },
];

function TermsPage() {
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
              Terms of Service
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/65">
              These terms govern your use of the ChAi platform. Please read them carefully.
            </p>
            <p className="mt-3 text-sm text-white/50">
              Last updated: {new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Terms content ───────────────────────────────── */}
      <main className="mx-auto max-w-[800px] px-6 py-16 lg:px-8 lg:py-24">
        <article className="prose prose-lg max-w-none text-foreground">
          <Reveal>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Welcome to ChAi.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is an AI-powered Customer Intelligence Platform designed to help businesses better understand, support, and retain their customers. By securely bringing together customer information from connected systems, ChAi provides insights that help businesses make more informed decisions throughout the customer lifecycle.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Trust is one of our core values. We believe your data belongs to you. Our role is to help you organize, analyze, and understand it — not to take ownership of it. ChAi is designed with privacy, transparency, and responsible AI principles at its core.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              These Terms of Service explain your rights and responsibilities when using ChAi. Please read them carefully.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">1. Acceptance of these Terms</h2>
            <p className="leading-relaxed text-muted-foreground">
              These Terms of Service constitute a legally binding agreement between you and <strong>Dominion Agency (Pty) Ltd</strong>, trading as <strong>ChAi</strong> (“ChAi,” “we,” “our,” or “us”).
            </p>
            <p className="leading-relaxed text-muted-foreground">
              By creating an account, starting a free trial, purchasing a subscription, accessing the Services, or using any part of the Services, you agree to be bound by these Terms and all policies incorporated by reference.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              If you do not agree to these Terms, you may not use the Services. If you use ChAi on behalf of a company or other legal entity, you represent and warrant that you have the authority to bind that entity to these Terms. In that case, “you” refers to both you and the organization you represent.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">2. About ChAi</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is a subscription-based Software-as-a-Service (SaaS) platform that helps businesses understand their customers by bringing together information from multiple sources into a unified workspace.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Depending on your subscription and enabled features, ChAi may provide:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Customer health scoring</li>
              <li>AI-generated customer summaries</li>
              <li>Churn risk analysis</li>
              <li>Customer intelligence dashboards</li>
              <li>Customer lifecycle insights</li>
              <li>AI recommendations</li>
              <li>Reporting and analytics</li>
              <li>Secure document ingestion</li>
              <li>Third-party integrations</li>
              <li>Workflow recommendations</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              The Services are designed to support business decision-making. <strong>ChAi does not replace human judgment.</strong> AI-generated insights are intended to assist users and should always be reviewed before making business, financial, legal, employment, or customer-related decisions.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">3. Definitions</h2>
            <p className="leading-relaxed text-muted-foreground">For purposes of these Terms:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Account</strong> — the registered account used to access the Services.</li>
              <li><strong>Administrator</strong> — a user authorized to manage a Workspace, billing, subscriptions, integrations, and user permissions.</li>
              <li><strong>AI Features</strong> — any functionality powered by artificial intelligence or machine learning, including summaries, recommendations, classifications, health scores, predictions, and similar capabilities.</li>
              <li><strong>Authorized User</strong> — an individual authorized by the Customer to access a Workspace.</li>
              <li><strong>Customer</strong> — the individual or legal entity that registers for or purchases a Subscription.</li>
              <li><strong>Customer Data</strong> — all information, documents, records, communications, files, metadata, and other content uploaded, synchronized, imported, or otherwise processed through the Services.</li>
              <li><strong>Documentation</strong> — user guides, help articles, technical documentation, and other documentation published by ChAi.</li>
              <li><strong>Integrations</strong> — connections between ChAi and supported third-party platforms such as CRM systems, help desk platforms, accounting systems, communication platforms, calendars, or other supported services.</li>
              <li><strong>Services</strong> — the ChAi platform, website, APIs, AI features, Documentation, customer support services, and related functionality provided by ChAi.</li>
              <li><strong>Subscription</strong> — a recurring paid plan that provides access to the Services.</li>
              <li><strong>Workspace</strong> — the dedicated environment created for a Customer within ChAi where Customer Data is processed and made available to Authorized Users.</li>
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">4. Eligibility</h2>
            <p className="leading-relaxed text-muted-foreground">To use the Services, you must:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>be at least eighteen (18) years old;</li>
              <li>have the legal authority to enter into a binding agreement;</li>
              <li>provide accurate and complete registration information;</li>
              <li>keep your information up to date; and</li>
              <li>comply with these Terms and all applicable laws.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              You may not use ChAi if your use would violate applicable sanctions, export control regulations, or other applicable laws.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">5. Accounts and Registration</h2>
            <p className="leading-relaxed text-muted-foreground">To use the Services, you must create an Account. You agree to:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>provide accurate and complete registration information;</li>
              <li>keep your login credentials secure;</li>
              <li>promptly notify ChAi if you suspect unauthorized access to your Account;</li>
              <li>ensure only Authorized Users access your Workspace; and</li>
              <li>remain responsible for all activity occurring under your Account unless caused by ChAi’s negligence or a security incident within our systems.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">You may not:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>impersonate another person or organization;</li>
              <li>create an Account using false information;</li>
              <li>share credentials in a way that compromises security;</li>
              <li>attempt to access another customer’s Workspace without authorization.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              ChAi may suspend or terminate Accounts that materially violate these Terms or pose a significant risk to the security, integrity, or availability of the Services.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">6. Subscription Plans, Billing, and Free Trial</h2>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Subscription Plans</h3>
            <p className="leading-relaxed text-muted-foreground">ChAi currently offers:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li><strong>Monthly Plan:</strong> $99 per month</li>
              <li><strong>Annual Plan:</strong> $999 per year</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Subscription fees are billed in advance and automatically renew until cancelled.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Free Trial</h3>
            <p className="leading-relaxed text-muted-foreground">
              New Customers are eligible for one fourteen (14) day free trial per organization. A valid credit card is required to begin the trial. If you do not cancel before the trial ends, your selected Subscription will automatically begin and your payment method will be charged.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Billing</h3>
            <p className="leading-relaxed text-muted-foreground">
              Subscriptions are billed on the date your paid Subscription begins and automatically renew on the corresponding monthly or annual anniversary date. You authorize ChAi to charge your selected payment method for all applicable Subscription fees and taxes.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Failed Payments</h3>
            <p className="leading-relaxed text-muted-foreground">
              If a payment cannot be processed, ChAi will notify the Account Administrator. You will have seven (7) calendar days to update your payment information or resolve the payment issue. If payment is not received within the grace period, ChAi may suspend access to the Services until all outstanding amounts have been paid.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Cancellation</h3>
            <p className="leading-relaxed text-muted-foreground">
              You may cancel your Subscription at any time through your account settings or by contacting ChAi. Cancellation prevents future renewals but does not immediately terminate access to the Services. You will continue to have access until the end of your current paid billing period.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Refunds</h3>
            <p className="leading-relaxed text-muted-foreground">
              Except where required by applicable law, Subscription fees are non-refundable. This includes unused portions of a billing period, partial months, annual subscriptions, and automatic renewals. We encourage prospective Customers to use the free trial to evaluate whether ChAi is the right solution before purchasing a Subscription.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Data After Cancellation</h3>
            <p className="leading-relaxed text-muted-foreground">
              After your Subscription ends, Customer Data will be retained for thirty (30) days. During this period you may reactivate your Subscription, export Customer Data where supported, or contact ChAi for assistance. After the retention period expires, Customer Data will be permanently deleted from ChAi’s production systems, except where retention is required by law.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">7. Customer Responsibilities</h2>
            <p className="leading-relaxed text-muted-foreground">
              You are responsible for your use of the Services and for ensuring that your use complies with these Terms and all applicable laws. You agree to:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>use the Services only for lawful business purposes;</li>
              <li>maintain the confidentiality of your login credentials;</li>
              <li>ensure that only Authorized Users access your Workspace;</li>
              <li>configure and manage your connected integrations appropriately;</li>
              <li>obtain any permissions, consents, or legal authority required before connecting third-party systems or importing Customer Data into ChAi;</li>
              <li>review AI-generated insights before relying on them for business decisions; and</li>
              <li>promptly notify ChAi if you become aware of any unauthorized use of your Account or Workspace.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              You are solely responsible for the accuracy, quality, legality, and integrity of the Customer Data that you upload or synchronize with the Services.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">8. Third-Party Integrations</h2>
            <p className="leading-relaxed text-muted-foreground">
              One of ChAi’s primary functions is to connect with supported third-party platforms. These integrations may include, but are not limited to: CRM platforms, customer support systems, accounting software, communication platforms, calendar providers, document storage services, and other software supported by ChAi.
            </p>
            <p className="leading-relaxed text-muted-foreground">You acknowledge that:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>third-party integrations are governed by the terms and privacy policies of those providers;</li>
              <li>ChAi is not responsible for the availability or performance of third-party services;</li>
              <li>changes made by third-party providers may temporarily affect integration functionality;</li>
              <li>ChAi may add, modify, suspend, or discontinue integrations as technology or provider requirements evolve.</li>
            </ul>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Read-Only Integrations</h3>
            <p className="leading-relaxed text-muted-foreground">
              Unless expressly stated otherwise, ChAi connects to supported systems in <strong>read-only mode</strong>. This means ChAi is designed to retrieve and analyze Customer Data without modifying, deleting, or writing information back to your connected systems. If ChAi introduces write-enabled features in the future, they will only be available where expressly enabled by you and supported by the relevant integration.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">9. AI Features</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi uses artificial intelligence to assist Customers in understanding customer relationships and identifying opportunities to improve customer success outcomes. AI Features may include: summaries, customer health analysis, churn risk indicators, recommended actions, classifications, trend analysis, document understanding, natural language responses, and other AI-assisted functionality.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              While we continually improve our AI Features, artificial intelligence is inherently probabilistic. Accordingly:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>AI-generated content may contain inaccuracies;</li>
              <li>recommendations should not be treated as professional advice;</li>
              <li>outputs should be reviewed by an appropriately qualified person before making business decisions;</li>
              <li>Customers remain solely responsible for decisions made using AI-generated information.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              ChAi does not guarantee that AI-generated insights will always be accurate, complete, current, or suitable for your particular circumstances.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">10. Customer Data</h2>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Ownership</h3>
            <p className="leading-relaxed text-muted-foreground">
              As between you and ChAi, <strong>you retain all right, title, and interest in and to your Customer Data.</strong> Nothing in these Terms transfers ownership of Customer Data to ChAi.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Limited License</h3>
            <p className="leading-relaxed text-muted-foreground">
              You grant ChAi a limited, non-exclusive, worldwide license to host, store, process, transmit, analyze, and display Customer Data solely as necessary to: provide the Services; operate the platform; perform AI processing requested by you; maintain security; provide customer support; comply with legal obligations; and improve the reliability and performance of the Services. This license ends when your Customer Data is deleted from our systems, subject to any legal retention requirements.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">No Sale of Customer Data</h3>
            <p className="leading-relaxed text-muted-foreground">ChAi does not sell Customer Data.</p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">No General AI Training</h3>
            <p className="leading-relaxed text-muted-foreground">
              ChAi does <strong>not</strong> use Customer Data to train general-purpose artificial intelligence or large language models. Where AI providers process Customer Data to provide requested functionality, ChAi seeks providers that offer enterprise controls designed to prevent Customer Data from being used to train publicly available models.
            </p>

            <h3 className="mt-6 text-lg font-semibold tracking-tight">Data Processing</h3>
            <p className="leading-relaxed text-muted-foreground">
              Customer Data is processed only for the purpose of providing the Services requested by you.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">11. Customer Content and Documents</h2>
            <p className="leading-relaxed text-muted-foreground">
              Customers may upload documents, spreadsheets, reports, presentations, contracts, PDFs, and other business materials for analysis within ChAi. You represent and warrant that:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>you own the content or have the legal right to upload it;</li>
              <li>uploading the content does not infringe the rights of any third party;</li>
              <li>the content does not contain unlawful material; and</li>
              <li>you have obtained any necessary permissions to process personal information contained within the uploaded materials.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">ChAi does not claim ownership of uploaded documents.</p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">12. Intellectual Property</h2>
            <p className="leading-relaxed text-muted-foreground">
              Except for Customer Data, all intellectual property rights in the Services remain the exclusive property of Dominion Agency (Pty) Ltd or its licensors. This includes, but is not limited to: software, source code, algorithms, AI models developed by ChAi, user interfaces, branding, logos, graphics, documentation, workflows, reports, designs, and platform functionality.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              These Terms grant you a limited, non-exclusive, non-transferable, revocable right to use the Services during your active Subscription. No rights are granted except those expressly stated in these Terms.
            </p>
            <p className="leading-relaxed text-muted-foreground">You may not:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>copy the Services except as permitted by law;</li>
              <li>reverse engineer the platform except where such rights cannot legally be restricted;</li>
              <li>remove copyright or proprietary notices;</li>
              <li>create derivative works from the Services;</li>
              <li>sell, sublicense, rent, lease, or commercially exploit the Services without our prior written consent.</li>
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">13. Feedback</h2>
            <p className="leading-relaxed text-muted-foreground">
              We welcome suggestions, feature requests, bug reports, and other feedback. If you provide feedback regarding the Services, you grant ChAi a perpetual, worldwide, royalty-free, irrevocable license to use, modify, incorporate, and otherwise exploit that feedback without restriction or compensation to you. This section applies only to feedback and does not transfer ownership of your Customer Data.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">14. Confidentiality</h2>
            <p className="leading-relaxed text-muted-foreground">
              Each party agrees to protect the other’s confidential information using reasonable care. Confidential Information includes non-public business, technical, commercial, financial, security, and operational information disclosed in connection with the Services.
            </p>
            <p className="leading-relaxed text-muted-foreground">Confidential Information does not include information that:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>is publicly available through no fault of the receiving party;</li>
              <li>was lawfully known before disclosure;</li>
              <li>is independently developed without reference to the confidential information; or</li>
              <li>is lawfully received from another source without confidentiality obligations.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Confidential Information may only be used to perform obligations under these Terms or as otherwise required by law. Reasonable steps shall be taken to prevent unauthorized disclosure of Confidential Information.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">15. Security</h2>
            <p className="leading-relaxed text-muted-foreground">
              Protecting Customer Data is one of ChAi’s highest priorities. ChAi implements administrative, technical, and organizational measures designed to protect Customer Data against unauthorized access, loss, misuse, alteration, or disclosure. These measures may include:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>Encryption of data in transit using industry-standard protocols.</li>
              <li>Encryption of stored data where appropriate.</li>
              <li>Secure authentication mechanisms.</li>
              <li>Role-based access controls.</li>
              <li>Security monitoring and logging.</li>
              <li>Regular software updates and security patches.</li>
              <li>Routine backups and disaster recovery procedures.</li>
              <li>Restricted employee access based on business need.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Although we strive to protect the Services, no security system is completely infallible. You acknowledge that no method of electronic storage or internet transmission can be guaranteed to be 100% secure. You are responsible for maintaining the security of your Account credentials and promptly notifying ChAi of any suspected unauthorized access.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">16. Availability of the Services</h2>
            <p className="leading-relaxed text-muted-foreground">
              We aim to provide reliable and uninterrupted access to the Services. However, ChAi does not guarantee that the Services will always be available or operate without interruption.
            </p>
            <p className="leading-relaxed text-muted-foreground">Temporary interruptions may occur due to:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>scheduled maintenance;</li>
              <li>emergency maintenance;</li>
              <li>software updates;</li>
              <li>infrastructure failures;</li>
              <li>internet outages;</li>
              <li>failures of third-party service providers;</li>
              <li>security incidents; or</li>
              <li>events outside our reasonable control.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Where reasonably practicable, ChAi will provide advance notice of scheduled maintenance.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">17. Customer Support</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi provides customer support through the support channels published on our website. Unless otherwise agreed in writing: support is provided during published business hours; support is provided on a commercially reasonable, best-effort basis; response times are not guaranteed. ChAi may update its support offerings from time to time.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">18. Acceptable Use</h2>
            <p className="leading-relaxed text-muted-foreground">You agree not to use the Services to:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>violate any applicable law or regulation;</li>
              <li>infringe another person’s intellectual property rights;</li>
              <li>transmit malicious software, viruses, worms, or ransomware;</li>
              <li>interfere with or disrupt the operation of the Services;</li>
              <li>attempt unauthorized access to any system or Workspace;</li>
              <li>probe, scan, or test vulnerabilities without authorization;</li>
              <li>use the Services to distribute spam or unsolicited communications;</li>
              <li>upload unlawful, fraudulent, defamatory, or abusive material;</li>
              <li>impersonate another individual or organization;</li>
              <li>misuse AI-generated content in a manner that violates applicable law; or</li>
              <li>use the Services in any manner that could reasonably be expected to damage the security, integrity, or availability of ChAi.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              You are responsible for ensuring that all Authorized Users comply with these Terms.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">19. Suspension of Services</h2>
            <p className="leading-relaxed text-muted-foreground">
              ChAi may suspend access to all or part of the Services where reasonably necessary to:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>investigate suspected fraud or unlawful activity;</li>
              <li>protect the security or integrity of the Services;</li>
              <li>prevent harm to other customers;</li>
              <li>comply with legal obligations;</li>
              <li>address repeated or material violations of these Terms; or</li>
              <li>respond to non-payment after the applicable grace period.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Where practical, we will provide notice before suspension. Immediate suspension may occur where necessary to protect the Services or comply with law. Suspension does not relieve you of your obligation to pay any outstanding Subscription fees.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">20. Termination</h2>
            <p className="leading-relaxed text-muted-foreground">
              You may terminate your Subscription at any time in accordance with these Terms. ChAi may terminate or suspend your Account if:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>you materially breach these Terms;</li>
              <li>you repeatedly violate our Acceptable Use Policy;</li>
              <li>your use creates a significant security risk;</li>
              <li>you fail to pay applicable Subscription fees after the grace period;</li>
              <li>continued provision of the Services would violate applicable law.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Where appropriate, ChAi will provide an opportunity to remedy the breach before termination. Upon termination: your right to access the Services immediately ends; Customer Data will be retained in accordance with our published retention policy; provisions intended to survive termination will remain in effect.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">21. Beta Features</h2>
            <p className="leading-relaxed text-muted-foreground">
              From time to time ChAi may offer experimental or beta functionality. Beta Features: may be incomplete; may change without notice; may contain errors; may be modified or discontinued at any time. Unless otherwise stated, Beta Features are provided “as is” without warranties of any kind. Your use of Beta Features is voluntary. We appreciate feedback that helps us improve these features.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">22. Disclaimers</h2>
            <p className="leading-relaxed text-muted-foreground">
              THE SERVICES ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW. TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHAI DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF: MERCHANTABILITY; FITNESS FOR A PARTICULAR PURPOSE; TITLE; NON-INFRINGEMENT; AND UNINTERRUPTED OR ERROR-FREE OPERATION.
            </p>
            <p className="leading-relaxed text-muted-foreground">ChAi does not warrant that:</p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>AI-generated outputs will always be accurate;</li>
              <li>recommendations will be suitable for every business;</li>
              <li>third-party integrations will remain continuously available;</li>
              <li>reports will always be complete or current;</li>
              <li>the Services will operate without interruption.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              Customers remain responsible for validating information before making business decisions.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">23. Limitation of Liability</h2>
            <p className="leading-relaxed text-muted-foreground">
              To the maximum extent permitted by applicable law, ChAi and its directors, employees, contractors, licensors, and affiliates shall not be liable for any indirect, incidental, consequential, special, exemplary, or punitive damages, including but not limited to: lost profits; lost revenue; lost business opportunities; loss of goodwill; business interruption; loss of anticipated savings; corruption or loss of data; or procurement of substitute services.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              To the maximum extent permitted by law, ChAi’s aggregate liability arising out of or relating to the Services shall not exceed the total Subscription fees actually paid by the Customer to ChAi during the twelve (12) months immediately preceding the event giving rise to the claim.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Nothing in these Terms excludes liability that cannot legally be excluded under applicable law.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">24. Indemnification</h2>
            <p className="leading-relaxed text-muted-foreground">
              You agree to indemnify, defend, and hold harmless Dominion Agency (Pty) Ltd, its directors, officers, employees, contractors, and affiliates from and against claims, losses, liabilities, damages, costs, and reasonable legal expenses arising from:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
              <li>your misuse of the Services;</li>
              <li>your breach of these Terms;</li>
              <li>your violation of applicable law;</li>
              <li>Customer Data you upload or process through the Services; or</li>
              <li>infringement of third-party rights caused by your use of the Services.</li>
            </ul>
            <p className="leading-relaxed text-muted-foreground">
              This obligation survives termination of these Terms.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">25. Force Majeure</h2>
            <p className="leading-relaxed text-muted-foreground">
              Neither party shall be liable for delays or failures in performance caused by circumstances beyond its reasonable control, including: natural disasters; war; terrorism; civil unrest; labor disputes; widespread internet failures; power outages; governmental actions; pandemics; or failures of critical third-party infrastructure. The affected party shall use commercially reasonable efforts to resume performance as soon as reasonably practicable.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">26. Governing Law and Jurisdiction</h2>
            <p className="leading-relaxed text-muted-foreground">
              These Terms are governed by and construed in accordance with the laws of the Republic of South Africa. Any dispute arising out of or relating to these Terms or the Services shall be subject to the exclusive jurisdiction of the courts of South Africa.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              ChAi is operated by Dominion Agency (Pty) Ltd, a company incorporated in South Africa. If you access the Services from outside South Africa, you do so on your own initiative and are responsible for compliance with your local laws.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-14 text-2xl font-semibold tracking-tight">27. General</h2>
            <p className="leading-relaxed text-muted-foreground">
              These Terms, together with any policies incorporated by reference, constitute the entire agreement between you and ChAi regarding the Services. If any provision of these Terms is held to be invalid or unenforceable, that provision will be enforced to the maximum extent permitted, and the remaining provisions will remain in full force and effect. Our failure to enforce any right or provision of these Terms will not be deemed a waiver of such right or provision.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              We may update these Terms from time to time. If we make material changes, we will notify you by email or by posting a notice on the platform before the changes become effective. Your continued use of the Services after any such changes constitutes your acceptance of the updated Terms.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              For any questions about these Terms, please contact us at the support channels published on our website.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-16 rounded-[20px] border border-border bg-card p-8 text-center shadow-soft">
              <p className="text-base font-semibold text-foreground">Questions about these Terms?</p>
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
                  <Link className="transition-colors hover:text-primary" to="/auth" search={login}>
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
            <p className="hidden sm:block">Built for modern SaaS teams.</p>
          </div>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}
