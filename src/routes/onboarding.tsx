import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Get started — Chai" }] }),
  component: Onboarding,
});

const businessModels = [
  "SaaS", "Subscription", "Ecommerce", "Agency", "Professional Services", "Insurance",
  "Telecom", "Education", "Financial Services", "Membership", "Marketplace", "Healthcare",
  "Logistics", "Fitness / Gym", "Hospitality", "Property", "Manufacturing", "Other",
];

const interactionChannels = [
  "Email", "Support Tickets", "Live Chat", "Phone Calls", "Customer Success Calls",
  "WhatsApp", "Surveys", "CRM Notes", "Other",
];

// Industry-specific questions generated based on the chosen model.
const industryQuestions: Record<string, string[]> = {
  SaaS: ["Do you track logins?", "Do you track feature adoption?", "Do you track seat utilization?", "Do customers renew contracts?"],
  Ecommerce: ["Do you track repeat purchases?", "Do you track average order value?", "Do you track days since last purchase?"],
  Education: ["Do you track attendance?", "Do you track assignment completion?", "Do you track course progress?"],
  Insurance: ["Do you track policy renewals?", "Do you track claims activity?", "Do you track premium changes?"],
  Telecom: ["Do you track complaints?", "Do you track contract renewals?", "Do you track data/usage levels?"],
};

const defaultQuestions = [
  "Do you track how often customers engage?",
  "Do you track repeat purchases or renewals?",
  "Do you track customer satisfaction?",
];

const steps = ["Business", "How you work", "What to track", "Interactions"];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    company: "",
    industry: "",
    size: "1–10",
    customers: "",
    avgValue: "",
    model: "SaaS",
    whatBuy: "",
    cadence: "",
    lifespan: "",
    successActions: "",
    disengagement: "",
    concerns: "",
  });
  const [tracked, setTracked] = useState<Record<string, boolean>>({});
  const [channels, setChannels] = useState<string[]>([]);

  const questions = industryQuestions[form.model] ?? defaultQuestions;
  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function finish() {
    setSubmitting(true);
    setTimeout(() => navigate({ to: "/app/dashboard" }), 1600);
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-warm text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold">Chai</span>
        </Link>
        <Link to="/app/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          Skip to demo
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-16">
        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          {submitting ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <h2 className="mt-4 text-xl font-semibold">Building your retention engine…</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Chai is learning how your business works and generating your customer health model.
              </p>
            </div>
          ) : (
            <>
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Tell us about your business</h2>
                    <p className="mt-1 text-sm text-muted-foreground">This teaches Chai how you operate.</p>
                  </div>
                  <Field label="Company name">
                    <input className={inputCls} value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Northwind Labs" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Industry">
                      <input className={inputCls} value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="e.g. B2B software" />
                    </Field>
                    <Field label="Company size">
                      <select className={inputCls} value={form.size} onChange={(e) => update("size", e.target.value)}>
                        {["1–10", "11–50", "51–200", "201–1000", "1000+"].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="Number of customers">
                      <input className={inputCls} value={form.customers} onChange={(e) => update("customers", e.target.value)} placeholder="e.g. 400" />
                    </Field>
                    <Field label="Average customer value">
                      <input className={inputCls} value={form.avgValue} onChange={(e) => update("avgValue", e.target.value)} placeholder="e.g. $12,000 / year" />
                    </Field>
                  </div>
                  <Field label="Business model">
                    <div className="flex flex-wrap gap-2">
                      {businessModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => update("model", m)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            form.model === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">How a healthy customer behaves</h2>
                    <p className="mt-1 text-sm text-muted-foreground">There are no wrong answers — describe it in your own words.</p>
                  </div>
                  <Field label="What do customers buy from you?">
                    <input className={inputCls} value={form.whatBuy} onChange={(e) => update("whatBuy", e.target.value)} placeholder="e.g. an annual software subscription" />
                  </Field>
                  <Field label="How often should a healthy customer engage?">
                    <input className={inputCls} value={form.cadence} onChange={(e) => update("cadence", e.target.value)} placeholder="e.g. logs in weekly" />
                  </Field>
                  <Field label="How long should a healthy customer stay?">
                    <input className={inputCls} value={form.lifespan} onChange={(e) => update("lifespan", e.target.value)} placeholder="e.g. 3+ years" />
                  </Field>
                  <Field label="What actions show a customer is succeeding?">
                    <input className={inputCls} value={form.successActions} onChange={(e) => update("successActions", e.target.value)} placeholder="e.g. inviting teammates, renewing" />
                  </Field>
                  <Field label="What actions show disengagement?">
                    <input className={inputCls} value={form.disengagement} onChange={(e) => update("disengagement", e.target.value)} placeholder="e.g. no logins for 30 days" />
                  </Field>
                  <Field label="What are your biggest retention concerns?">
                    <textarea className={cn(inputCls, "min-h-20 resize-none")} value={form.concerns} onChange={(e) => update("concerns", e.target.value)} placeholder="e.g. customers go quiet before renewal" />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">What you're already tracking</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tailored to {form.model} businesses. Toggle the ones you track today.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {questions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setTracked((t) => ({ ...t, [q]: !t[q] }))}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                          tracked[q] ? "border-primary bg-accent/50" : "border-border hover:bg-accent/30",
                        )}
                      >
                        {q}
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border",
                            tracked[q] ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {tracked[q] && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">How customers interact with you</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Pick all that apply — these become churn signals.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {interactionChannels.map((ch) => {
                      const active = channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setChannels((c) => (active ? c.filter((x) => x !== ch) : [...c, ch]))}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                            active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                          )}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-lg bg-accent/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">You're all set.</p>
                    Chai will build a {form.model} retention framework, score your customers' health, and surface who's at risk — all in plain English.
                  </div>
                </div>
              )}

              {/* Nav */}
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                {step < steps.length - 1 ? (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={finish}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Build my retention engine <Sparkles className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
