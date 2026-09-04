import { describe, expect, it } from "vitest";
import {
  dueTrialEmails,
  effectivePlan,
  isLockedOut,
  trialBadgeLabel,
  trialState,
} from "@/lib/trials";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-04T10:00:00.000Z");
const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();

describe("trialState", () => {
  it("returns none without a trial date", () => {
    expect(trialState(null, now).status).toBe("none");
  });

  it("counts days left during the trial", () => {
    const s = trialState(at(4), now);
    expect(s.status).toBe("trialing");
    expect(s.daysLeft).toBe(4);
    expect(effectivePlan("core", s)).toBe("standard");
    expect(trialBadgeLabel(s)).toBe("Trial: 4 days left");
  });

  it("enters a 7-day grace period after the trial ends", () => {
    const s = trialState(at(-2), now);
    expect(s.status).toBe("grace");
    expect(s.daysLeft).toBe(5);
    expect(isLockedOut(s)).toBe(false);
    expect(effectivePlan("core", s)).toBe("standard");
  });

  it("locks out once the grace period has passed", () => {
    const s = trialState(at(-8), now);
    expect(s.status).toBe("expired");
    expect(isLockedOut(s)).toBe(true);
    expect(effectivePlan("core", s)).toBe("core");
    expect(trialBadgeLabel(s)).toBeNull();
  });
});

describe("dueTrialEmails", () => {
  it("fires the 4-days-left reminder on day 10", () => {
    expect(dueTrialEmails(at(4), [], now).map((e) => e.key)).toEqual(["day10"]);
  });

  it("fires the expiry notice when the trial ends", () => {
    // The day-before reminder is still inside its 2-day catch-up window, so a
    // brand new workspace that has had nothing sent yet gets both.
    expect(dueTrialEmails(at(0), ["day13"], now).map((e) => e.key)).toEqual(["expired"]);
  });

  it("fires the grace reminders on days 17 and 20", () => {
    expect(dueTrialEmails(at(-3), [], now).map((e) => e.key)).toEqual(["day17"]);
    expect(dueTrialEmails(at(-6), [], now).map((e) => e.key)).toEqual(["day20"]);
  });

  it("never sends the same reminder twice", () => {
    expect(dueTrialEmails(at(4), ["day10"], now)).toEqual([]);
  });

  it("does not backfill very old reminders", () => {
    expect(dueTrialEmails(at(30), [], now)).toEqual([]);
  });
});
