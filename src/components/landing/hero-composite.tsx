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
    <div className="relative mx-auto w-full max-w-[520px] origin-center scale-[0.8] translate-x-[10%] sm:translate-x-[18%]">
      {/* Top card — renders in front */}
      <div className="relative z-10 rounded-[16px] bg-card" style={{ boxShadow: cardShadow }}>
        <RiskFactorsCard
          customer={c}
          analyzedCopy={analyzedCopyFor(c.factors.map((f) => f.label))}
          className="rounded-[16px] border-0 bg-transparent"
        />
      </div>

      {/* Bottom card — offset down and to the right, overlapping by ~60px */}
      <div
        className="relative z-0 -mt-[40px] ml-auto w-[94%] rounded-[16px] bg-card sm:-mt-[60px] sm:w-[88%] sm:translate-x-8"
        style={{ boxShadow: cardShadow }}
      >
        <RecommendedActionsCard
          customer={c}
          limit={2}
          showSteps={false}
          className="rounded-[16px] border-0 bg-transparent pt-14"
        />
      </div>

      {/* Floating health score badge */}
      <div className="absolute -top-9 right-0 z-20 rounded-[12px] bg-[#152238] px-4 py-2.5 text-right shadow-[0_8px_20px_rgba(0,0,0,0.18)] sm:-top-4 sm:-right-2 sm:py-3">
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
