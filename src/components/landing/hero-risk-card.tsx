import { formatCurrency, sortedByRisk, type Customer } from "@/lib/mock-data";

/** Status band colours — reserved for real health/status data only. */
function statusFor(health: number) {
  if (health >= 80) return { label: "Healthy", color: "var(--success)" };
  if (health >= 60) return { label: "Watch", color: "var(--warning)" };
  if (health >= 40) return { label: "At risk", color: "var(--caution)" };
  return { label: "Critical", color: "var(--danger)" };
}

function HeroRiskCard({ customer }: { customer: Customer }) {
  const topFactor = customer.factors[0];
  const topRec = customer.recommendations[0];
  const status = statusFor(customer.health);

  return (
    <div className="relative">
      {/* soft warm radial glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full"
        style={{
          background:
            "radial-gradient(50% 50% at 55% 45%, rgba(224,169,58,0.28) 0%, rgba(224,169,58,0) 70%)",
        }}
      />

      <div className="relative rounded-[20px] bg-white p-6 shadow-[0_30px_70px_-30px_rgba(21,34,56,0.65)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-[-0.02em] text-[#152238]">
              {customer.name}
            </h3>
            <p className="mt-0.5 text-sm text-[#4A5A6B]">
              {formatCurrency(customer.revenue)} ARR
            </p>
          </div>
          <div className="text-right">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-[12px] text-lg font-extrabold text-white"
              style={{ backgroundColor: status.color }}
            >
              {customer.health}
            </div>
            <p className="mt-1 text-[11px] font-semibold" style={{ color: status.color }}>
              {status.label}
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-[12px] bg-[#EEF7FB] p-4 text-sm leading-relaxed text-[#152238]">
          {topFactor.detail}
        </p>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-[12px] border border-[#D8E7EF] p-4">
          <p className="text-sm font-semibold text-[#152238]">{topRec.title}</p>
          <span className="shrink-0 text-sm font-extrabold text-[#204654]">
            +{formatCurrency(topRec.revenueSaved)}
          </span>
        </div>
      </div>

      {/* floating micro-cards for depth */}
      <div className="absolute -left-6 -top-6 hidden rounded-[12px] bg-white px-3 py-2 shadow-[0_12px_30px_-12px_rgba(21,34,56,0.5)] sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4A5A6B]">
          Revenue at risk
        </p>
        <p className="text-sm font-extrabold text-[#152238]">$18,420</p>
      </div>
      <div className="absolute -bottom-6 -right-5 hidden rounded-[12px] bg-white px-3 py-2 shadow-[0_12px_30px_-12px_rgba(21,34,56,0.5)] sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4A5A6B]">
          Accounts monitored
        </p>
        <p className="text-sm font-extrabold text-[#152238]">312</p>
      </div>
    </div>
  );
}

export const heroCustomer = sortedByRisk[0];
export { HeroRiskCard };
