import { cn } from "@/lib/utils";
import { riskMeta, type RiskCategory } from "@/lib/mock-data";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "caution" | "danger";
}) {
  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "caution"
          ? "text-caution"
          : tone === "danger"
            ? "text-danger"
            : "text-foreground";
  return (
    <div className="rounded-xl border border-border border-t-4 border-t-primary bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn("h-4 w-4", tone === "default" ? "text-muted-foreground" : toneText)} />}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", toneText)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function HealthBadge({ category }: { category: RiskCategory }) {
  const m = riskMeta[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        m.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function ScoreBar({ value, tone }: { value: number; tone?: string }) {
  const color =
    value >= 75 ? "bg-success" : value >= 55 ? "bg-warning" : value >= 35 ? "bg-caution" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", tone ?? color)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border border-t-4 border-t-primary bg-card p-5 shadow-soft", className)}>
      {children}
    </div>
  );
}
