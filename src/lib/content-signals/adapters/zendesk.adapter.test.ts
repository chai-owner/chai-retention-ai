import { describe, it, expect } from "vitest";
import {
  commentsToText,
  normaliseZendeskTicket,
  zendeskCustomerRef,
} from "./zendesk.adapter.server";

describe("zendesk content adapter normalisation", () => {
  const ticket = {
    id: 4242,
    subject: "Renewal question",
    requester_id: 99,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T11:30:00Z",
  };

  it("uses the Zendesk requester id as the customer reference", () => {
    expect(zendeskCustomerRef(ticket)).toBe("99");
    expect(zendeskCustomerRef({ id: 1 }, "a@b.com")).toBe("a@b.com");
    expect(zendeskCustomerRef({ id: 1 })).toBeNull();
  });

  it("flattens public comments into Speaker: text lines, oldest first", () => {
    const text = commentsToText(
      ticket,
      [
        { author_id: 99, plain_body: "We're comparing you to  Acme.\n\n\nThoughts?" },
        { author_id: 7, plain_body: "Happy to walk you through it." },
      ],
      new Map([
        ["99", "Dana Ruiz"],
        ["7", "Sam (Support)"],
      ]),
    );
    expect(text).toBe(
      "Dana Ruiz: We're comparing you to Acme.\n\nThoughts?\n\nSam (Support): Happy to walk you through it.",
    );
  });

  it("drops internal notes and empty comments", () => {
    const text = commentsToText(ticket, [
      { author_id: 99, plain_body: "Public question" },
      { author_id: 7, public: false, plain_body: "Internal: watch this account" },
      { author_id: 7, plain_body: "   " },
    ]);
    expect(text).toBe("Customer: Public question");
  });

  it("produces the same normalised shape the pipeline expects", () => {
    const row = normaliseZendeskTicket(ticket, [{ author_id: 99, plain_body: "Hello there" }]);
    expect(row).toEqual({
      source: "zendesk",
      externalId: "4242",
      customerRef: "99",
      subject: "Renewal question",
      body: "Customer: Hello there",
      occurredAt: "2026-09-02T11:30:00.000Z",
    });
  });
});

describe("zendesk incremental cursor", () => {
  it("never asks for a start_time inside the last minute (Zendesk 400s on that)", async () => {
    const { zendeskStartTime } = await import("./zendesk.adapter.server");
    const now = new Date("2026-09-23T18:40:00Z");
    // A cursor from seconds ago is held back.
    expect(zendeskStartTime("2026-09-23T18:39:50Z", now)).toBe(
      Math.floor(now.getTime() / 1000) - 70,
    );
    // An older cursor is used as-is.
    expect(zendeskStartTime("2026-09-01T00:00:00Z", now)).toBe(
      Math.floor(new Date("2026-09-01T00:00:00Z").getTime() / 1000),
    );
    expect(zendeskStartTime(null, now)).toBe(0);
  });
});
