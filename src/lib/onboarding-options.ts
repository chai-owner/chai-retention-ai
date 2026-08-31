// Shared option sets and helpers used by both the onboarding wizard and the
// editable profile in Settings. Keeping these in one place means the two
// surfaces never drift apart.

export const businessModels = [
  "Subscription business", "Ecommerce", "Agency", "Professional Services", "Insurance",
  "Telecom", "Education", "Financial Services", "Membership", "Marketplace", "Healthcare",
  "Logistics", "Fitness / Gym", "Hospitality", "Property", "Manufacturing", "Other",
];

export const interactionChannels = [
  "Email", "Support Tickets", "Live Chat", "Phone Calls", "Customer Success Calls",
  "WhatsApp", "Surveys", "CRM Notes", "Other",
];

export const companySizes = ["1–10", "11–50", "51–200", "201–1000", "1000+"];

// Industry-specific questions generated based on the chosen model. Broadened
// to cover every business model offered above.
export const industryQuestions: Record<string, string[]> = {
  "Subscription business": ["Do you track customer engagement?", "Do you track product or service usage?", "Do you track renewals?", "Do you track plan changes or cancellations?"],
  Ecommerce: ["Do you track repeat purchases?", "Do you track average order value?", "Do you track days since last purchase?", "Do you track cart abandonment?"],
  Agency: ["Do you track retainer renewals?", "Do you track scope/usage of hours?", "Do you track client satisfaction?", "Do you track project delivery on time?"],
  "Professional Services": ["Do you track engagement renewals?", "Do you track billable utilization?", "Do you track client satisfaction?", "Do you track referrals?"],
  Insurance: ["Do you track policy renewals?", "Do you track claims activity?", "Do you track premium changes?", "Do you track lapses in cover?"],
  Telecom: ["Do you track complaints?", "Do you track contract renewals?", "Do you track data/usage levels?", "Do you track plan downgrades?"],
  Education: ["Do you track attendance?", "Do you track assignment completion?", "Do you track course progress?", "Do you track re-enrolment?"],
  "Financial Services": ["Do you track product holdings?", "Do you track account activity?", "Do you track balance changes?", "Do you track complaints?"],
  Membership: ["Do you track renewals?", "Do you track visit/usage frequency?", "Do you track event attendance?", "Do you track downgrade requests?"],
  Marketplace: ["Do you track transaction frequency?", "Do you track GMV per account?", "Do you track listing/buying activity?", "Do you track days since last order?"],
  Healthcare: ["Do you track appointment attendance?", "Do you track plan/programme adherence?", "Do you track follow-up visits?", "Do you track satisfaction?"],
  Logistics: ["Do you track shipment volume?", "Do you track on-time delivery?", "Do you track complaints/claims?", "Do you track contract renewals?"],
  "Fitness / Gym": ["Do you track visit frequency?", "Do you track class attendance?", "Do you track membership renewals?", "Do you track freeze/cancel requests?"],
  Hospitality: ["Do you track repeat bookings?", "Do you track average spend?", "Do you track review scores?", "Do you track loyalty activity?"],
  Property: ["Do you track lease renewals?", "Do you track maintenance requests?", "Do you track payment timeliness?", "Do you track tenant satisfaction?"],
  Manufacturing: ["Do you track reorder frequency?", "Do you track order volume?", "Do you track quality complaints?", "Do you track contract renewals?"],
};

export const defaultQuestions = [
  "Do you track how often customers engage?",
  "Do you track repeat purchases or renewals?",
  "Do you track customer satisfaction?",
];

export function getQuestions(model: string): string[] {
  return industryQuestions[model] ?? defaultQuestions;
}

// Suggested definitions of a "churned customer" tailored to each business
// model. Shown during onboarding so users can accept a sensible default or
// refine it, rather than us assuming what churn means for their business.
export const churnDefinitions: Record<string, string> = {
  "Subscription business": "Cancelled their subscription, stopped engaging for a sustained period, or didn't renew at the end of the term.",
  Ecommerce: "No purchase in the last 6 months, having previously bought regularly.",
  Agency: "Ended their retainer or hasn't renewed an engagement after it lapsed.",
  "Professional Services": "No active engagement and no new work booked in the last 6 months.",
  Insurance: "Let a policy lapse or didn't renew at the end of the term.",
  Telecom: "Cancelled their contract or ported their number to another provider.",
  Education: "Didn't re-enrol for the next term, or stopped attending for 30+ days.",
  "Financial Services": "Closed their account or has had no activity for 6+ months.",
  Membership: "Didn't renew their membership or hasn't visited in 90+ days.",
  Marketplace: "No transactions in the last 90 days after previously being active.",
  Healthcare: "Missed follow-ups and hasn't booked an appointment in 6+ months.",
  Logistics: "No shipments booked in the last 90 days, or didn't renew a contract.",
  "Fitness / Gym": "Cancelled their membership or hasn't visited in 30+ days.",
  Hospitality: "No repeat booking in the last 12 months after previously returning.",
  Property: "Didn't renew their lease or gave notice to leave.",
  Manufacturing: "No reorder in the expected cycle, or didn't renew a supply contract.",
};

const defaultChurnDefinition =
  "No purchases or engagement for a sustained period, or an explicit cancellation.";

export function getChurnDefinition(model: string): string {
  return churnDefinitions[model] ?? defaultChurnDefinition;
}
