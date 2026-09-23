// Client-safe display strings for content risk signals. Deliberately does not
// import the constructed test set (which is validation-only data).

export const SIGNAL_LABELS: Record<string, string> = {
  competitor_mentioned: "Competitor mentioned",
  cancellation_intent: "Cancellation intent",
  champion_departure: "Champion may have left",
  company_distress: "Signs of company distress",
};

export const SIGNAL_TONE: Record<string, "danger" | "warning"> = {
  competitor_mentioned: "danger",
  cancellation_intent: "danger",
  champion_departure: "warning",
  company_distress: "warning",
};

export const SOURCE_LABELS: Record<string, string> = {
  intercom: "Intercom",
  zendesk: "Zendesk",
  freshdesk: "Freshdesk",
  zoho: "Zoho CRM",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  data_drop: "Data Drop",
};

export function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal.replace(/_/g, " ");
}

export function sourceLabelFor(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
