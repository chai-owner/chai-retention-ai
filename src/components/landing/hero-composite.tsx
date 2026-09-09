import {
  RiskFactorsCard,
  RecommendedActionsCard,
  analyzedCopyFor,
} from "@/components/customer/risk-panels";
import { customers } from "@/lib/mock-data";

const cardShadow = "0 16px 40px rgba(0,0,0,0.14)";

/** The real product panels for a representative at-risk account. */
export const heroCompositeCustomer =
  customers.find((c) => c.name === "Pied Piper Digital") ?? customers[0];

export function HeroComposite() {
  const c = heroCompositeCustomer;

  return (
    <div className="relative mx-auto w-full max-w-[520px] pb-16 pr-3 sm:pb-20 sm:pr-10">
      {/* Bottom card — offset down/right, sits behind */}
      <div
        className="absolute bottom-0 right-0 z-0 w-[92%] rounded-[16px] bg-card sm:w-[88%]"
        style={{ boxShadow: cardShadow }}
      >
        <RecommendedActionsCard
          customer={c}
          limit={2}
          showSteps={false}
          className="rounded-[16px] border-0 bg-transparent"
        />
      </div>

      {/* Top card — in front */}
      <div className="relative z-10 rounded-[16px] bg-card" style={{ boxShadow: cardShadow }}>
        <RiskFactorsCard
          customer={c}
          analyzedCopy={analyzedCopyFor(c.factors.map((f) => f.label))}
          className="rounded-[16px] border-0 bg-transparent"
        />
      </div>

      {/* Floating health score badge */}
      <div
        className="absolute -top-4 right-0 z-20 rounded-[12px] bg-[#152238] px-4 py-3 text-right shadow-[0_8px_20px_rgba(0,0,0,0.18)] sm:-right-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A9E0F1]">
          Health score
        </p>
        <p className="text-2xl font-extrabold leading-tight text-white">
          {c.health} <span className="text-sm font-semibold text-white/60">/100</span>
        </p>
      </div>
    </div>
  );
}
