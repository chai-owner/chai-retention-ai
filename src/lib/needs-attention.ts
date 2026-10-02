// Who appears in the dashboard "Needs attention now" list, and what to say when
// nobody does. Uses the same risk categories as the dashboard counts.
import { categoryFromHealth, type Customer } from "@/lib/mock-data";

export const NEEDS_ATTENTION_LIMIT = 5;

type Pick_ = Pick<Customer, "health" | "risk" | "notEnoughData">;

export function selectNeedsAttention<T extends Pick_>(customers: T[], limit = NEEDS_ATTENTION_LIMIT): T[] {
  return customers
    .filter((c) => !c.notEnoughData)
    .filter((c) => {
      const cat = categoryFromHealth(c.health);
      return cat === "at-risk" || cat === "critical";
    })
    .sort((a, b) => b.risk - a.risk || a.health - b.health)
    .slice(0, limit);
}

export function needsAttentionEmpty(notEnoughDataCount: number): { text: string; linkToDataQuality: boolean } {
  if (notEnoughDataCount > 0) {
    const noun = notEnoughDataCount === 1 ? "customer doesn't" : "customers don't";
    return {
      text: `No customers need attention right now. ${notEnoughDataCount} ${noun} have enough data yet.`,
      linkToDataQuality: true,
    };
  }
  return { text: "No customers need attention right now.", linkToDataQuality: false };
}
