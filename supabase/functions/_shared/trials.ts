// Ported verbatim from src/lib/trials.ts.
import type { OrgPlan } from "./organisations.ts";

export const TRIAL_DAYS = 14;
export const TRIAL_GRACE_DAYS = 7;
export const TRIAL_PLAN: OrgPlan = "standard";

export type TrialStatus = "none" | "trialing" | "grace" | "expired";

export interface TrialState {
  status: TrialStatus;
  daysLeft: number;
  endsAt: string | null;
  graceEndsAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntil(target: Date, now: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY_MS));
}

export function trialState(
  trialEndsAt: string | Date | null | undefined,
  now: Date = new Date(),
): TrialState {
  const end = toDate(trialEndsAt);
  if (!end) return { status: "none", daysLeft: 0, endsAt: null, graceEndsAt: null };
  const graceEnd = new Date(end.getTime() + TRIAL_GRACE_DAYS * DAY_MS);
  const endsAt = end.toISOString();
  const graceEndsAt = graceEnd.toISOString();
  if (now.getTime() < end.getTime()) {
    return { status: "trialing", daysLeft: daysUntil(end, now), endsAt, graceEndsAt };
  }
  if (now.getTime() < graceEnd.getTime()) {
    return { status: "grace", daysLeft: daysUntil(graceEnd, now), endsAt, graceEndsAt };
  }
  return { status: "expired", daysLeft: 0, endsAt, graceEndsAt };
}

export function effectivePlan(plan: OrgPlan, state: TrialState): OrgPlan {
  return state.status === "trialing" || state.status === "grace" ? TRIAL_PLAN : plan;
}

// --- Reminder schedule -------------------------------------------------------

export interface TrialEmail {
  key: string;
  /** Days relative to the trial end date; negative is before it ends. */
  offsetDays: number;
  subject: string;
  headline: string;
  body: string;
}

export const TRIAL_EMAILS: TrialEmail[] = [
  {
    key: "day10",
    offsetDays: -4,
    subject: "4 days left on your ChAi trial",
    headline: "4 days left on your trial",
    body: "Your free trial ends in 4 days. Choose a plan now to keep your retention workspace, your data and your team seats.",
  },
  {
    key: "day13",
    offsetDays: -1,
    subject: "Your ChAi trial ends tomorrow",
    headline: "Your trial ends tomorrow",
    body: "This is your last full day of free access. Pick a plan to carry on without interruption.",
  },
  {
    key: "expired",
    offsetDays: 0,
    subject: "Your ChAi free trial has ended",
    headline: "Your free trial has ended",
    body: "Your 14-day trial is over. You have 7 more days of access while you choose a plan — after that your workspace will be locked until you subscribe.",
  },
  {
    key: "day17",
    offsetDays: 3,
    subject: "4 days until your ChAi workspace locks",
    headline: "4 days of access left",
    body: "Your trial ended a few days ago. You have 4 days left before your workspace is locked. Choose a plan to keep everything running.",
  },
  {
    key: "day20",
    offsetDays: 6,
    subject: "Final warning: your ChAi workspace locks tomorrow",
    headline: "Final warning",
    body: "Tomorrow your workspace will be locked until you choose a plan. Nothing is deleted — your data is waiting for you.",
  },
];

/**
 * Which reminder emails are due now, given the ones already sent. Emails are
 * sent once each, and never retro-fired more than 2 days late so a paused cron
 * doesn't flood a mailbox on restart.
 */
export function dueTrialEmails(
  trialEndsAt: string | Date | null | undefined,
  alreadySent: string[] = [],
  now: Date = new Date(),
): TrialEmail[] {
  const end = toDate(trialEndsAt);
  if (!end) return [];
  const sent = new Set(alreadySent);
  return TRIAL_EMAILS.filter((email) => {
    if (sent.has(email.key)) return false;
    const dueAt = end.getTime() + email.offsetDays * DAY_MS;
    const age = now.getTime() - dueAt;
    return age >= 0 && age < 2 * DAY_MS;
  });
}
