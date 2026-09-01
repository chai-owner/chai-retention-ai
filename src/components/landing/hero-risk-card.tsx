import { AlertTriangle, HeartPulse, Lightbulb } from "lucide-react";
import { formatCurrency, sortedByRisk, type Customer } from "@/lib/mock-data";

function HeroRiskCard({ customer }: { customer: Customer }) {
  const topFactor = customer.factors[0];
  const topRec = customer.recommendations[0];
  const probability = customer.churnProbability;

  const badge =
    probability >= 45
      ? { text: `${probability}% very likely to leave`, tone: "danger" as const }
      : probability >= 15
        ? { text: `${probability}% likely to leave`, tone: "warning" as const }
        : { text: `${probability}% low risk`, tone: "success" as const };

  const toneClasses = {
    danger: "bg-danger/10 text-danger border-danger/20",
    warning: "bg-warning/15 text-warning-foreground border-warning/30",
    success: "bg-success/10 text-success border-success/20",
  };

  return (
    <div className="overflow-hidden rounded-[10px] border border-white/10 bg-hero-charcoal text-white">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{customer.name}</h3>
            <p className="text-sm text-white/55">
              {formatCurrency(customer.revenue)}/yr account
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[badge.tone]}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {badge.text}
          </span>
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <HeartPulse className="h-4 w-4 text-danger" />
            Why this customer is at risk
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            {topFactor.detail}
          </p>
        </div>

        <div className="mt-4 rounded-lg bg-success/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <Lightbulb className="h-4 w-4" />
            Recommended action
          </div>
          <p className="mt-2 text-sm leading-relaxed text-success-foreground/90">
            {topRec.title}
          </p>
          <p className="mt-2 text-xs font-semibold text-success">
            Could save {formatCurrency(topRec.revenueSaved)}/yr
          </p>
        </div>
      </div>
    </div>
  );
}

export const heroCustomer = sortedByRisk[0];
export { HeroRiskCard };
