// Turns a risk factor into a concrete, doable play instead of "improve metric X".
//
// Everything here is generic: plays are chosen by the *semantics* of the metric
// name (attendance, duration, spend, satisfaction, payments, tenure, …), never
// by a hard-coded business or industry. Each play is filled in with the
// customer's real measured value and a peer target so the owner knows exactly
// what to do and what "good" looks like.

export interface PlaybookInput {
  metric: string;
  detail: string;
  /** 0–100, higher = bigger drag on the health score. */
  weight: number;
  customerName: string;
  /** The customer's measured value for this metric, when we have one. */
  value?: number | null;
  /** What a healthy peer looks like on the same metric. */
  target?: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
}

export interface Playbook {
  title: string;
  priority: "High" | "Medium" | "Low";
  difficulty: "Easy" | "Moderate" | "Involved";
  impact: string;
  reasoning: string;
  steps: string[];
}

const fmt = (n: number): string =>
  Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10);

/** Human unit for a metric, inferred from its name when none is supplied. */
export function inferUnit(name: string, unit?: string): string {
  const u = (unit ?? "").trim();
  if (u) return u === "%" ? "percent" : u;
  const n = name.toLowerCase();
  if (/(minute|duration|length of session)/.test(n)) return "minutes";
  if (/hour/.test(n)) return "hours";
  if (/(tenure|recency|days since|age)/.test(n)) return "days";
  if (/per week|weekly/.test(n)) return "per week";
  if (/per month|monthly freq/.test(n)) return "per month";
  if (/(visit|check-?in|attendance|session|class)/.test(n)) return "visits";
  if (/(rate|percent|utilization|delinquen|adoption|churn|%)/.test(n)) return "percent";
  if (/(revenue|spend|value|dues|price|fee|payment|invoice)/.test(n)) return "dollars";
  if (/(score|nps|csat|satisfaction|sentiment)/.test(n)) return "score";
  if (/(count|volume|number|tickets|referral)/.test(n)) return "count";
  return "";
}

function measured(i: PlaybookInput): string {
  if (i.value == null || !Number.isFinite(i.value)) return "";
  const unit = inferUnit(i.metric, i.unit);
  const v = `${fmt(i.value)}${unit ? ` ${unit}` : ""}`;
  if (i.target != null && Number.isFinite(i.target)) {
    return `${i.customerName} is at ${v} versus ${fmt(i.target)}${unit ? ` ${unit}` : ""} for your healthiest members.`;
  }
  return `${i.customerName} is at ${v}.`;
}

function targetPhrase(i: PlaybookInput): string {
  if (i.target == null || !Number.isFinite(i.target)) return "";
  const unit = inferUnit(i.metric, i.unit);
  const dir = i.lowerIsBetter ? "down to" : "up to";
  return `${dir} ${fmt(i.target)}${unit ? ` ${unit}` : ""}`;
}

type Play = (i: PlaybookInput) => Omit<Playbook, "priority"> & { difficulty?: Playbook["difficulty"] };

interface Rule {
  test: RegExp;
  play: Play;
  difficulty: Playbook["difficulty"];
}

// Ordered most-specific first.
const RULES: Rule[] = [
  {
    test: /(attendance|check-?in|visit|frequency|session count|classes?)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Rebuild ${i.customerName}'s weekly visit habit`,
      impact: "Strong",
      reasoning: `Attendance is the strongest predictor of renewal, and it has slipped here. ${measured(i)}`,
      steps: [
        `Call or text ${i.customerName} this week and book two specific sessions into the diary — a named day and time beats an open invitation.`,
        `Pair them with a coach, class or buddy group that matches their goal so the booked sessions actually happen.`,
        `Set a 14-day reminder to check whether visits moved ${targetPhrase(i) || "back toward your healthy range"}; if not, escalate to a retention offer.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(duration|minutes per|length|time spent|workout time)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Extend ${i.customerName}'s session value`,
      impact: "Moderate",
      reasoning: `Short sessions usually mean the plan no longer fits the person. ${measured(i)}`,
      steps: [
        `Offer a free 20-minute programme review to rebuild a plan they can finish in the time they actually have.`,
        `Recommend one specific class or guided programme with a longer, structured format ${targetPhrase(i) ? `to move sessions ${targetPhrase(i)}` : ""}.`.trim(),
        `Ask directly what is cutting sessions short (time, crowding, confidence) and log the answer against the account.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(tenure|membership length|months as|days since signup|age)/,
    difficulty: "Moderate",
    play: (i) => ({
      title: `Run the early-life milestone plan for ${i.customerName}`,
      impact: "Strong",
      reasoning: `Accounts in this tenure band churn most. ${measured(i)}`,
      steps: [
        `Schedule a milestone check-in call in the next 5 days and set one measurable goal with them.`,
        `Enrol them in your onboarding or "first 90 days" sequence if they never completed it.`,
        `Introduce them to one staff member and one community group by name — social ties are the biggest tenure lift.`,
      ],
      difficulty: "Moderate",
    }),
  },
  {
    test: /(delinquen|failed payment|arrears|overdue|payment issue|dunning)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Recover the payment issue on ${i.customerName}'s account`,
      impact: "Strong",
      reasoning: `Billing failures churn accounts silently. ${measured(i)}`,
      steps: [
        `Send a card-update link today and follow with a personal call if it is unpaid after 48 hours.`,
        `Offer a one-time split payment or a date change to match their pay cycle rather than cancelling.`,
        `Turn on automatic retries plus a pre-renewal reminder so the same failure does not repeat.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(revenue|spend|dues|fee|price|order value|invoice|ltv|value per)/,
    difficulty: "Moderate",
    play: (i) => ({
      title: `Match ${i.customerName} to a better-fitting plan`,
      impact: "Moderate",
      reasoning: `Spend sits below the level where this relationship is durable. ${measured(i)}`,
      steps: [
        `Review what they actually use and propose the one plan or add-on that fits it — no generic upsell.`,
        `Offer a time-boxed trial of that upgrade ${targetPhrase(i) ? `to move value ${targetPhrase(i)}` : ""} so there is no commitment risk.`.trim(),
        `If budget is the blocker, offer an annual or off-peak rate instead of discounting the current plan.`,
      ],
      difficulty: "Moderate",
    }),
  },
  {
    test: /(satisfaction|nps|csat|sentiment|feedback|motivation)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Close the loop on ${i.customerName}'s feedback`,
      impact: "Strong",
      reasoning: `Satisfaction is trending below the point where people renew. ${measured(i)}`,
      steps: [
        `Have an owner or manager call within 72 hours and ask what one change would make the biggest difference.`,
        `Fix or formally answer the specific complaint they raise, and tell them what you changed.`,
        `Re-survey them 30 days later to confirm the score moved ${targetPhrase(i) || "back into a healthy range"}.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(support|ticket|complaint|resolution)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Clear ${i.customerName}'s open issues personally`,
      impact: "Strong",
      reasoning: `Unresolved issues are the most immediate churn trigger. ${measured(i)}`,
      steps: [
        `Assign one named owner to every open item on this account and commit to a resolution date.`,
        `Give ${i.customerName} a single summary message covering all open items and next steps.`,
        `Add a follow-up 7 days after closure to confirm the fix held.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(referral|advocacy|invite|nps promoter)/,
    difficulty: "Easy",
    play: (i) => ({
      title: `Pull ${i.customerName} into your community loop`,
      impact: "Moderate",
      reasoning: `Members who bring others almost never leave. ${measured(i)}`,
      steps: [
        `Send a personal invite with a guest pass or referral credit they can use this month.`,
        `Invite them to one community event or challenge by name.`,
        `Thank and reward any referral publicly to reinforce the behaviour.`,
      ],
      difficulty: "Easy",
    }),
  },
  {
    test: /(engagement|login|usage|activity|adoption|feature)/,
    difficulty: "Moderate",
    play: (i) => ({
      title: `Restart ${i.customerName}'s usage with a guided win`,
      impact: "Strong",
      reasoning: `Engagement has dropped below the level of your retained accounts. ${measured(i)}`,
      steps: [
        `Book a 20-minute walkthrough focused on the single outcome they signed up for.`,
        `Set up one thing for them during that call so they leave with a result, not homework.`,
        `Track usage weekly for a month and intervene again if it does not move ${targetPhrase(i) || "toward your healthy band"}.`,
      ],
      difficulty: "Moderate",
    }),
  },
  {
    test: /(cancel|churn|risk of|downgrade|pause)/,
    difficulty: "Moderate",
    play: (i) => ({
      title: `Make a save offer before ${i.customerName} cancels`,
      impact: "Strong",
      reasoning: `This account is showing explicit exit signals. ${measured(i)}`,
      steps: [
        `Call today and ask what would have to change for them to stay — do not lead with a discount.`,
        `Offer a pause, downgrade or plan swap as the retention path instead of a full cancellation.`,
        `Record the reason given so repeated causes get fixed at the source.`,
      ],
      difficulty: "Moderate",
    }),
  },
];

export function playbookFor(input: PlaybookInput): Playbook {
  const name = input.metric.toLowerCase();
  const rule = RULES.find((r) => r.test.test(name));
  const priority: Playbook["priority"] =
    input.weight >= 60 ? "High" : input.weight >= 35 ? "Medium" : "Low";

  if (rule) {
    const p = rule.play(input);
    return {
      title: p.title,
      priority,
      difficulty: p.difficulty ?? rule.difficulty,
      impact: p.impact,
      reasoning: `${p.reasoning} ${input.detail}`.trim(),
      steps: p.steps.filter(Boolean),
    };
  }

  // Unknown metric: still give a concrete, sequenced play rather than
  // "improve <metric>".
  const label = input.metric.toLowerCase();
  return {
    title: `Agree a ${label} plan with ${input.customerName}`,
    priority,
    difficulty: "Moderate",
    impact: input.weight >= 60 ? "Strong" : "Moderate",
    reasoning: `${input.detail} ${measured(input)}`.trim(),
    steps: [
      `Contact ${input.customerName} this week and confirm what is driving their ${label} — assumptions here are usually wrong.`,
      `Agree one specific change with a date attached${targetPhrase(input) ? `, targeting ${targetPhrase(input)}` : ""}.`,
      `Re-check ${label} in 30 days and escalate to a retention offer if it has not moved.`,
    ],
  };
}
