import { describe, expect, it } from "vitest";
import { applyMapping, normalizeDate, normalizeNumber, type MappedSchema } from "./ingest-mapping";

const schemas: MappedSchema[] = [
  {
    key: "usage",
    label: "Usage",
    fields: [
      { name: "customer_id", type: "text" },
      { name: "email", type: "email" },
      { name: "date", type: "date" },
      { name: "logins", type: "number" },
    ],
  },
];

const mappings = [
  {
    key: "usage",
    confidence: 92,
    note: "engagement export",
    fields: [
      { field: "customer_id", column: "Account ID" },
      { field: "email", column: "Contact Email" },
      { field: "date", column: "Week Of" },
      { field: "logins", column: "Sign-ins" },
    ],
  },
];

describe("applyMapping", () => {
  it("maps every row of a large file, not just the first", () => {
    const headers = ["Account ID", "Contact Email", "Week Of", "Sign-ins"];
    const rows = Array.from({ length: 200 }, (_, i) => [
      `ACC-${i + 1}`,
      `user${i + 1}@Acme.com`,
      "03/07/2026",
      "1,234",
    ]);

    const [ds] = applyMapping(headers, rows, schemas, mappings);
    expect(ds).toBeDefined();
    expect(ds!.rows).toHaveLength(200);
    expect(ds!.headers).toEqual(["customer_id", "email", "date", "logins"]);
    expect(ds!.rows[0]).toEqual(["ACC-1", "user1@acme.com", "2026-07-03", "1234"]);
    expect(ds!.rows[199]![0]).toBe("ACC-200");
  });

  it("leaves unmapped fields empty and drops blank rows", () => {
    const headers = ["Account ID", "Sign-ins"];
    const rows = [["ACC-1", "5"], ["", ""], ["ACC-2", "7"]];
    const [ds] = applyMapping(headers, rows, schemas, [
      {
        key: "usage",
        confidence: 70,
        note: "",
        fields: [
          { field: "customer_id", column: "Account ID" },
          { field: "logins", column: "Sign-ins" },
          { field: "date", column: "", constant: "2026-08-01" },
        ],
      },
    ]);
    expect(ds!.rows).toHaveLength(3);
    expect(ds!.rows[1]).toEqual(["", "", "2026-08-01", ""]);
    expect(ds!.rows[2]).toEqual(["ACC-2", "", "2026-08-01", "7"]);
  });

  it("normalises common date and number formats", () => {
    expect(normalizeDate("2026-01-05")).toBe("2026-01-05");
    expect(normalizeDate("5 Jan 2026")).toBe("2026-01-05");
    expect(normalizeDate("13/02/2026")).toBe("2026-02-13");
    expect(normalizeNumber("$1,250.50")).toBe("1250.50");
    expect(normalizeNumber("(300)")).toBe("-300");
  });
});
