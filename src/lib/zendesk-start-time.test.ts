import { describe, expect, it } from "vitest";
import { zendeskStartTime, ZENDESK_START_TIME_LAG_SECONDS } from "./zendesk.server";

const now = Date.parse("2026-09-23T20:00:00Z");

describe("zendeskStartTime", () => {
  it("holds a too-recent cursor back past Zendesk's 60-second floor", () => {
    const t = zendeskStartTime("2026-09-23T19:59:50Z", now);
    expect(t).toBe(Math.floor(now / 1000) - ZENDESK_START_TIME_LAG_SECONDS);
  });

  it("leaves an older cursor alone", () => {
    expect(zendeskStartTime("2026-09-23T19:40:00Z", now)).toBe(
      Math.floor(Date.parse("2026-09-23T19:40:00Z") / 1000),
    );
  });

  it("backfills a year when there is no cursor", () => {
    expect(zendeskStartTime(null, now)).toBe(Math.floor(now / 1000) - 365 * 24 * 60 * 60);
  });
});
