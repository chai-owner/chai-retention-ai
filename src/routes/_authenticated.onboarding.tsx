import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ArrowRight, ArrowLeft, Check, Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { profileStore } from "@/lib/profile-store";
import { saveProfile } from "@/lib/profile.functions";
import { recommendMetrics } from "@/lib/ai.functions";
import { plannerMetrics, DEFAULT_METRIC_WEIGHTS, IMPORTANCE_LABELS, type PlannerMetric } from "@/lib/mock-data";
import { SmartIngestCard, UploadDatasetsCard } from "@/components/data-uploads-panel";
import { IntegrationsPanel } from "@/components/integrations-panel";
import {
  businessModels,
  interactionChannels,
  companySizes,
  getQuestions,
  getChurnDefinition,
} from "@/lib/onboarding-options";

interface Segment {
  name: string;
  min: string;
  max: string;
}

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Get started — ChAi" }] }),
  component: Onboarding,
});


const steps = [
  "Business",
  "Segments",
  "How you work",
  "What matters",
  "What to track",
  "Interactions",
  "Integrations",
  "Data",
];

const MAX_SEGMENTS = 4;

function Onboarding() {
  const navigate = useNavigate();
  const persistProfile = useServerFn(saveProfile);
  const getRecommendedMetrics = useServerFn(recommendMetrics);
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
    churnDefinition: "",
    concerns: "",
  });
  const [tracked, setTracked] = useState<Record<string, boolean>>({});
  const [channels, setChannels] = useState<string[]>([]);
  const [metricWeights, setMetricWeights] = useState<Record<string, number>>(
    () => ({ ...DEFAULT_METRIC_WEIGHTS }),
  );
  // AI-generated recommendations (weights + tailored reasons) for step 3.
  const [recommendedWeights, setRecommendedWeights] = useState<Record<string, number>>(
    () => ({ ...DEFAULT_METRIC_WEIGHTS }),
  );
  const [metricReasons, setMetricReasons] = useState<Record<string, string>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(false);
  const metricsGenerated = useRef(false);
  const [segments, setSegments] = useState<Segment[]>([
    { name: "", min: "", max: "" },
  ]);

  // When the user reaches the "What matters" step, ask ChAi to recommend metric
  // importance tailored to the industry/company info they entered earlier.
  async function generateMetricRecommendations() {
    setMetricsLoading(true);
    setMetricsError(false);
    try {
      const { recommendations } = await getRecommendedWeights({
        data: {
          profile: {
            company: form.company,
            industry: form.industry,
            model: form.model,
            size: form.size,
            customers: form.customers,
            avgValue: form.avgValue,
            whatBuy: form.whatBuy,
            cadence: form.cadence,
            lifespan: form.lifespan,
            concerns: form.concerns,
          },
          metrics: plannerMetrics.map((m) => ({ name: m.name, why: m.why })),
        },
      });
      if (recommendations.length === 0) {
        setMetricsError(true);
        return;
      }
      const weights: Record<string, number> = { ...DEFAULT_METRIC_WEIGHTS };
      const reasons: Record<string, string> = {};
      for (const r of recommendations) {
        weights[r.name] = r.weight;
        if (r.reason) reasons[r.name] = r.reason;
      }
      setRecommendedWeights(weights);
      setMetricReasons(reasons);
      setMetricWeights(weights);
      metricsGenerated.current = true;
    } catch {
      setMetricsError(true);
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    if (step === 3 && !metricsGenerated.current && !metricsLoading && !metricsError) {
      void generateMetricRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);


  const questions = getQuestions(form.model);
  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const updateSegment = (i: number, k: keyof Segment, v: string) =>
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, [k]: v } : seg)));
  const addSegment = () =>
    setSegments((s) => (s.length < MAX_SEGMENTS ? [...s, { name: "", min: "", max: "" }] : s));
  const removeSegment = (i: number) =>
    setSegments((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));

  // Per-segment validation + cross-segment overlap detection.
  const segmentErrors = useMemo(() => {
    const errs = segments.map(() => "");
    const parsed = segments.map((seg) => ({
      name: seg.name.trim(),
      min: seg.min.trim() === "" ? NaN : Number(seg.min),
      max: seg.max.trim() === "" ? NaN : Number(seg.max),
    }));

    parsed.forEach((p, i) => {
      if (!p.name) errs[i] = "Give this segment a name.";
      else if (Number.isNaN(p.min) || Number.isNaN(p.max)) errs[i] = "Enter a numeric value range.";
      else if (p.min < 0 || p.max < 0) errs[i] = "Values can't be negative.";
      else if (p.max <= p.min) errs[i] = "The upper value must be greater than the lower value.";
    });

    // Overlap check across all valid ranges.
    for (let i = 0; i < parsed.length; i++) {
      if (errs[i]) continue;
      for (let j = i + 1; j < parsed.length; j++) {
        if (errs[j]) continue;
        const a = parsed[i];
        const b = parsed[j];
        if (a.min < b.max && b.min < a.max) {
          const overlap = `Range overlaps with "${segments[j].name.trim() || `segment ${j + 1}`}".`;
          errs[i] = errs[i] || overlap;
          errs[j] = errs[j] || `Range overlaps with "${segments[i].name.trim() || `segment ${i + 1}`}".`;
        }
      }
    }
    return errs;
  }, [segments]);

  const segmentsValid = segmentErrors.every((e) => e === "");

  // Gate progress: each step must be sufficiently complete before continuing.
  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          form.company.trim() !== "" &&
          form.industry.trim() !== "" &&
          form.customers.trim() !== "" &&
          form.avgValue.trim() !== ""
        );
      case 1:
        return segmentsValid;
      case 2:
        return (
          form.whatBuy.trim() !== "" &&
          form.cadence.trim() !== "" &&
          form.lifespan.trim() !== "" &&
          form.successActions.trim() !== "" &&
          form.disengagement.trim() !== "" &&
          form.churnDefinition.trim() !== ""
        );
      case 5:
        return channels.length > 0;
      default:
        return true;
    }
  }, [step, form, segmentsValid, channels]);

  const canContinue = stepValid;


  function finish() {
    setSubmitting(true);
    const payload = {
      company: form.company,
      industry: form.industry,
      model: form.model,
      size: form.size,
      customers: form.customers,
      avgValue: form.avgValue,
      whatBuy: form.whatBuy,
      cadence: form.cadence,
      lifespan: form.lifespan,
      concerns: form.concerns,
      segments,
      successActions: form.successActions,
      disengagement: form.disengagement,
      churnDefinition: form.churnDefinition,
      tracked,
      channels,
      metricWeights,
    };
    profileStore.save(payload);
    // Persist to the user's account so it follows them across devices.
    persistProfile({ data: payload }).catch(() => {
      // Non-blocking: localStorage already holds the profile.
    });
    setTimeout(() => navigate({ to: "/app/welcome" }), 1600);
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-warm text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold">ChAi</span>
        </Link>
        <span className="text-sm text-muted-foreground">Let's set you up</span>
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
                ChAi is learning how your business works and generating your customer health model.
              </p>
            </div>
          ) : (
            <>
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Tell us about your business</h2>
                    <p className="mt-1 text-sm text-muted-foreground">This teaches ChAi how you operate.</p>
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
                        {companySizes.map((o) => <option key={o}>{o}</option>)}
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
                    <select className={inputCls} value={form.model} onChange={(e) => update("model", e.target.value)}>
                      {businessModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Define your customer segments</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Group customers by the average revenue they bring per month. Add up to {MAX_SEGMENTS} segments — ranges can't overlap.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {segments.map((seg, i) => (
                      <div key={i} className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Segment {i + 1}</span>
                          {segments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSegment(i)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          )}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Segment name">
                            <input
                              className={inputCls}
                              value={seg.name}
                              onChange={(e) => updateSegment(i, "name", e.target.value)}
                              placeholder="e.g. Premium"
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Min / month ($)">
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className={inputCls}
                                value={seg.min}
                                onChange={(e) => updateSegment(i, "min", e.target.value)}
                                placeholder="0"
                              />
                            </Field>
                            <Field label="Max / month ($)">
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className={inputCls}
                                value={seg.max}
                                onChange={(e) => updateSegment(i, "max", e.target.value)}
                                placeholder="500"
                              />
                            </Field>
                          </div>
                        </div>
                        {segmentErrors[i] && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {segmentErrors[i]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {segments.length < MAX_SEGMENTS && (
                    <button
                      type="button"
                      onClick={addSegment}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/40"
                    >
                      <Plus className="h-4 w-4" /> Add segment
                    </button>
                  )}
                </div>
              )}

              {step === 2 && (
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
                  <div>
                    <Field label="When would you consider a customer churned?">
                      <textarea
                        className={cn(inputCls, "min-h-20 resize-none")}
                        value={form.churnDefinition}
                        onChange={(e) => update("churnDefinition", e.target.value)}
                        placeholder="Describe what 'churned' means for your business"
                      />
                    </Field>
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p>
                          Based on your {form.model} model, a common definition is:{" "}
                          <span className="text-foreground">"{getChurnDefinition(form.model)}"</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => update("churnDefinition", getChurnDefinition(form.model))}
                          className="mt-1.5 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Use this suggestion
                        </button>
                      </div>
                    </div>
                  </div>

                  <Field label="What are your biggest retention concerns?">
                    <textarea className={cn(inputCls, "min-h-20 resize-none")} value={form.concerns} onChange={(e) => update("concerns", e.target.value)} placeholder="e.g. customers go quiet before renewal" />
                  </Field>
                </div>
              )}

              {step === 4 && (
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
                    <h2 className="text-xl font-semibold">How much each metric matters</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Slide each metric from Unimportant to Critical. ChAi weights your customer health score by what matters most to you.
                    </p>
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        ChAi generated these <span className="font-medium text-foreground">recommended weights</span> from your industry, business model and the company details you entered. Adjust any metric to fit your priorities.
                      </span>
                    </div>
                  </div>

                  {metricsLoading ? (
                    <div className="flex flex-col items-center rounded-xl border border-border py-12 text-center">
                      <Loader2 className="h-7 w-7 animate-spin text-primary" />
                      <p className="mt-3 text-sm font-medium">ChAi is tailoring your metrics…</p>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        Weighing each retention signal against your {form.industry || "business"} profile.
                      </p>
                    </div>
                  ) : (
                    <>
                      {metricsError && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Couldn't generate tailored weights — showing sensible defaults you can adjust.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              metricsGenerated.current = false;
                              void generateMetricRecommendations();
                            }}
                            className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      <div className="space-y-4">
                        {plannerMetrics.map((m) => {
                          const level = metricWeights[m.name] ?? 3;
                          const recommended = recommendedWeights[m.name] ?? DEFAULT_METRIC_WEIGHTS[m.name] ?? 3;
                          const isRecommended = level === recommended;
                          const description = metricReasons[m.name] || m.why;
                          return (
                            <div key={m.name} className="rounded-xl border border-border p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{m.name}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                                    {IMPORTANCE_LABELS[level - 1]}
                                  </span>
                                  {isRecommended ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Sparkles className="h-2.5 w-2.5" /> ChAi recommended
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMetricWeights((w) => ({ ...w, [m.name]: recommended }))
                                      }
                                      className="text-[10px] text-primary underline-offset-2 hover:underline"
                                    >
                                      Reset to recommended
                                    </button>
                                  )}
                                </div>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={level}
                                onChange={(e) =>
                                  setMetricWeights((w) => ({ ...w, [m.name]: Number(e.target.value) }))
                                }
                                className="mt-3 w-full accent-primary"
                              />
                              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                                <span>Unimportant</span>
                                <span>Critical</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === 5 && (
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
                    ChAi will build a {form.model} retention framework, score your customers' health, and surface who's at risk — all in plain English.
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Connect your integrations</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The more ChAi can see, the sharper your retention insights. Connect any of these
                      now, or skip and add them later from Data &amp; Integrations — nothing here is
                      required to continue.
                    </p>
                  </div>
                  <IntegrationsPanel />
                </div>
              )}

              {step === 7 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Add your data</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      ChAi runs its first assessment on the data you add here — nothing is made up.
                      Drop in documents or upload CSVs. The more you add, the more accurate your first
                      snapshot. You can skip and add data later, too.
                    </p>
                  </div>
                  <SmartIngestCard />
                  <UploadDatasetsCard />
                  <div className="rounded-lg bg-accent/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Ready when you are.</p>
                    ChAi will build a {form.model} retention framework and run its first assessment on
                    whatever you've added. Added little or nothing? We'll tell you honestly and set it
                    up together on your onboarding call.
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
                    disabled={!canContinue}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={finish}
                    disabled={!canContinue}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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
