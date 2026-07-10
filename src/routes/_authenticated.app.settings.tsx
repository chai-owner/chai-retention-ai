import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Plus, Trash2, AlertCircle, Check, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { profileStore, useProfile, type ProfileSegment } from "@/lib/profile-store";
import { saveProfile } from "@/lib/profile.functions";
import { IMPORTANCE_LABELS } from "@/lib/mock-data";
import { useActiveMetrics } from "@/lib/use-scored-data";
import { businessModels, companySizes, interactionChannels, getQuestions, getChurnDefinition } from "@/lib/onboarding-options";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Business profile — ChAi" }] }),
  component: Settings,
});

const MAX_SEGMENTS = 4;

function Settings() {
  const profile = useProfile();
  const activeMetrics = useActiveMetrics();
  const persistProfile = useServerFn(saveProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [model, setModel] = useState("SaaS");
  const [size, setSize] = useState("1–10");
  const [customers, setCustomers] = useState("");
  const [avgValue, setAvgValue] = useState("");
  const [whatBuy, setWhatBuy] = useState("");
  const [cadence, setCadence] = useState("");
  const [lifespan, setLifespan] = useState("");
  const [concerns, setConcerns] = useState("");
  const [successActions, setSuccessActions] = useState("");
  const [disengagement, setDisengagement] = useState("");
  const [churnDefinition, setChurnDefinition] = useState("");
  const [segments, setSegments] = useState<ProfileSegment[]>([{ name: "", min: "", max: "" }]);
  const [tracked, setTracked] = useState<Record<string, boolean>>({});
  const [channels, setChannels] = useState<string[]>([]);
  const [metricWeights, setMetricWeights] = useState<Record<string, number>>({ ...DEFAULT_METRIC_WEIGHTS });

  // Hydrate local form state from the saved profile once it's available.
  useEffect(() => {
    if (!profile) return;
    setCompany(profile.company ?? "");
    setIndustry(profile.industry ?? "");
    setModel(profile.model || "SaaS");
    setSize(profile.size || "1–10");
    setCustomers(profile.customers ?? "");
    setAvgValue(profile.avgValue ?? "");
    setWhatBuy(profile.whatBuy ?? "");
    setCadence(profile.cadence ?? "");
    setLifespan(profile.lifespan ?? "");
    setConcerns(profile.concerns ?? "");
    setSuccessActions(profile.successActions ?? "");
    setDisengagement(profile.disengagement ?? "");
    setChurnDefinition(profile.churnDefinition ?? "");
    setSegments(profile.segments?.length ? profile.segments : [{ name: "", min: "", max: "" }]);
    setTracked(profile.tracked ?? {});
    setChannels(profile.channels ?? []);
    setMetricWeights({ ...DEFAULT_METRIC_WEIGHTS, ...(profile.metricWeights ?? {}) });
  }, [profile]);

  const questions = getQuestions(model);

  const updateSegment = (i: number, k: keyof ProfileSegment, v: string) =>
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, [k]: v } : seg)));
  const addSegment = () =>
    setSegments((s) => (s.length < MAX_SEGMENTS ? [...s, { name: "", min: "", max: "" }] : s));
  const removeSegment = (i: number) =>
    setSegments((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));

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
    for (let i = 0; i < parsed.length; i++) {
      if (errs[i]) continue;
      for (let j = i + 1; j < parsed.length; j++) {
        if (errs[j]) continue;
        const a = parsed[i];
        const b = parsed[j];
        if (a.min < b.max && b.min < a.max) {
          errs[i] = errs[i] || `Range overlaps with "${segments[j].name.trim() || `segment ${j + 1}`}".`;
          errs[j] = errs[j] || `Range overlaps with "${segments[i].name.trim() || `segment ${i + 1}`}".`;
        }
      }
    }
    return errs;
  }, [segments]);

  const segmentsValid = segmentErrors.every((e) => e === "");
  const canSave =
    company.trim() !== "" && industry.trim() !== "" && segmentsValid && channels.length > 0;

  function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      company,
      industry,
      model,
      size,
      customers,
      avgValue,
      whatBuy,
      cadence,
      lifespan,
      concerns,
      segments,
      successActions,
      disengagement,
      churnDefinition,
      tracked,
      channels,
      metricWeights,
    };
    profileStore.save(payload);
    persistProfile({ data: payload }).catch(() => {
      // Non-blocking: localStorage already holds the profile.
    });
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 600);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Business profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These answers power your customer health model. Update them any time your business changes.
        </p>
      </div>

      {/* Business */}
      <Card title="Your business">
        <Field label="Company name">
          <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Northwind Labs" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry">
            <input className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. B2B software" />
          </Field>
          <Field label="Business model">
            <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
              {businessModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Company size">
            <select className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}>
              {companySizes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Number of customers">
            <input className={inputCls} value={customers} onChange={(e) => setCustomers(e.target.value)} placeholder="e.g. 400" />
          </Field>
          <Field label="Average customer value">
            <input className={inputCls} value={avgValue} onChange={(e) => setAvgValue(e.target.value)} placeholder="e.g. $12,000 / year" />
          </Field>
        </div>
      </Card>


      {/* Segments */}
      <Card title="Customer segments" subtitle={`Group by average monthly revenue. Up to ${MAX_SEGMENTS} non-overlapping ranges.`}>
        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Segment {i + 1}</span>
                {segments.length > 1 && (
                  <button type="button" onClick={() => removeSegment(i)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Segment name">
                  <input className={inputCls} value={seg.name} onChange={(e) => updateSegment(i, "name", e.target.value)} placeholder="e.g. Premium" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min / month ($)">
                    <input type="number" min="0" inputMode="numeric" className={inputCls} value={seg.min} onChange={(e) => updateSegment(i, "min", e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Max / month ($)">
                    <input type="number" min="0" inputMode="numeric" className={inputCls} value={seg.max} onChange={(e) => updateSegment(i, "max", e.target.value)} placeholder="500" />
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
          <button type="button" onClick={addSegment} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/40">
            <Plus className="h-4 w-4" /> Add segment
          </button>
        )}
      </Card>

      {/* How you work */}
      <Card title="How a healthy customer behaves">
        <Field label="What do customers buy from you?">
          <input className={inputCls} value={whatBuy} onChange={(e) => setWhatBuy(e.target.value)} placeholder="e.g. an annual software subscription" />
        </Field>
        <Field label="How often should a healthy customer engage?">
          <input className={inputCls} value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="e.g. logs in weekly" />
        </Field>
        <Field label="How long should a healthy customer stay?">
          <input className={inputCls} value={lifespan} onChange={(e) => setLifespan(e.target.value)} placeholder="e.g. 3+ years" />
        </Field>
        <Field label="What actions show a customer is succeeding?">
          <input className={inputCls} value={successActions} onChange={(e) => setSuccessActions(e.target.value)} placeholder="e.g. inviting teammates, renewing" />
        </Field>
        <Field label="What actions show disengagement?">
          <input className={inputCls} value={disengagement} onChange={(e) => setDisengagement(e.target.value)} placeholder="e.g. no logins for 30 days" />
        </Field>
        <div>
          <Field label="When would you consider a customer churned?">
            <textarea className={cn(inputCls, "min-h-20 resize-none")} value={churnDefinition} onChange={(e) => setChurnDefinition(e.target.value)} placeholder="Describe what 'churned' means for your business" />
          </Field>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p>
                Based on your {model} model, a common definition is:{" "}
                <span className="text-foreground">"{getChurnDefinition(model)}"</span>
              </p>
              <button
                type="button"
                onClick={() => setChurnDefinition(getChurnDefinition(model))}
                className="mt-1.5 font-medium text-primary underline-offset-2 hover:underline"
              >
                Use this suggestion
              </button>
            </div>
          </div>
        </div>
        <Field label="What are your biggest retention concerns?">
          <textarea className={cn(inputCls, "min-h-20 resize-none")} value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="e.g. customers go quiet before renewal" />
        </Field>
      </Card>


      {/* What matters — weights */}
      <Card title="How much each metric matters" subtitle="Slide each metric from Unimportant to Critical to retune your customer health score.">
        <div className="space-y-4">
          {plannerMetrics.map((m) => {
            const level = metricWeights[m.name] ?? 3;
            const recommended = DEFAULT_METRIC_WEIGHTS[m.name] ?? 3;
            const isRecommended = level === recommended;
            return (
              <div key={m.name} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.why}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {IMPORTANCE_LABELS[level - 1]}
                    </span>
                    {isRecommended ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Sparkles className="h-2.5 w-2.5" /> Recommended
                      </span>
                    ) : (
                      <button type="button" onClick={() => setMetricWeights((w) => ({ ...w, [m.name]: recommended }))} className="text-[10px] text-primary underline-offset-2 hover:underline">
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
                  onChange={(e) => setMetricWeights((w) => ({ ...w, [m.name]: Number(e.target.value) }))}
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
      </Card>

      {/* What you track */}
      <Card title="What you're already tracking" subtitle={`Tailored to ${model} businesses.`}>
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
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", tracked[q] ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {tracked[q] && <Check className="h-3 w-3" />}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Interactions */}
      <Card title="How customers interact with you" subtitle="Pick all that apply — these become churn signals.">
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
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/80 py-4 backdrop-blur">
        {saved && <span className="text-sm text-success">Profile saved.</span>}
        {!canSave && <span className="text-xs text-muted-foreground">Complete company, industry, segments and at least one channel.</span>}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
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

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
