import { describe, expect, it } from "vitest";
import { applyMapping, evalGroupOp, evalRowOp, normalizeDate, normalizeNumber, type MappedSchema } from "./ingest-mapping";

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

// --- calculated metrics ----------------------------------------------------

const metricSchema: MappedSchema[] = [
  {
    key: "metric_missed_appointments",
    label: "Missed appointments",
    fields: [
      { name: "customer_id", type: "text" },
      { name: "email", type: "email" },
      { name: "date", type: "date" },
      { name: "missed_appointments", type: "number" },
    ],
  },
];

const NOW = Date.parse("2026-08-18T00:00:00Z");

describe("derived metrics", () => {
  it("rolls appointment events up into per-customer no-show counts", () => {
    const headers = ["Patient ID", "Email", "Appointment Date", "Status"];
    const rows = [
      ["P-1", "a@x.com", "2026-07-01", "Attended"],
      ["P-1", "a@x.com", "2026-07-08", "No-show"],
      ["P-1", "a@x.com", "2026-07-15", "DNA"],
      ["P-2", "b@x.com", "2026-07-02", "No-show"],
      ["P-2", "b@x.com", "2026-07-09", "Attended"],
    ];
    const [ds] = applyMapping(headers, rows, metricSchema, [
      {
        key: "metric_missed_appointments",
        confidence: 88,
        note: "counted no-shows",
        groupBy: "Patient ID",
        fields: [
          { field: "customer_id", column: "Patient ID" },
          { field: "email", column: "Email" },
          { field: "date", column: "Appointment Date" },
          {
            field: "missed_appointments",
            column: "",
            derive: { op: "count_if", column: "Status", anyOf: ["No-show", "DNA"] },
          },
        ],
      },
    ], NOW);

    expect(ds!.grouped).toBe(true);
    expect(ds!.rows).toHaveLength(2);
    expect(ds!.rows[0]).toEqual(["P-1", "a@x.com", "2026-07-15", "2"]);
    expect(ds!.rows[1]).toEqual(["P-2", "b@x.com", "2026-07-09", "1"]);
    expect(ds!.derivations[0]).toContain("count of rows");
  });

  it("supports each row-level operation", () => {
    const col = (n: string) => ["A", "B", "D1", "D2", "Flag", "Status"].indexOf(n);
    const row = ["100", "4", "2026-01-01", "2026-01-11", "Yes", "At risk"];
    expect(evalRowOp({ op: "arith", a: "A", b: "B", operator: "/" }, row, col, NOW)).toBe("25");
    expect(evalRowOp({ op: "arith", a: "A", operator: "*", value: 2 }, row, col, NOW)).toBe("200");
    expect(evalRowOp({ op: "date_diff", from: "D1", to: "D2" }, row, col, NOW)).toBe("10");
    expect(evalRowOp({ op: "days_since", column: "D2" }, row, col, NOW)).toBe("219");
    expect(evalRowOp({ op: "bool", column: "Flag" }, row, col, NOW)).toBe("1");
    expect(
      evalRowOp({ op: "lookup", column: "Status", map: { "At risk": "3" }, fallback: "1" }, row, col, NOW),
    ).toBe("3");
  });

  it("supports each group-level operation", () => {
    const col = (n: string) => ["Amount", "Date", "Reopened"].indexOf(n);
    const group = [
      ["100", "2026-06-01", "Yes"],
      ["300", "2026-08-01", "No"],
    ];
    expect(evalGroupOp({ op: "count" }, group, col, NOW)).toBe("2");
    expect(evalGroupOp({ op: "sum", column: "Amount" }, group, col, NOW)).toBe("400");
    expect(evalGroupOp({ op: "avg", column: "Amount" }, group, col, NOW)).toBe("200");
    expect(evalGroupOp({ op: "min", column: "Amount" }, group, col, NOW)).toBe("100");
    expect(evalGroupOp({ op: "max", column: "Amount" }, group, col, NOW)).toBe("300");
    expect(evalGroupOp({ op: "last_date", column: "Date" }, group, col, NOW)).toBe("2026-08-01");
    expect(evalGroupOp({ op: "days_since_last", column: "Date" }, group, col, NOW)).toBe("17");
    expect(evalGroupOp({ op: "ratio_if", column: "Reopened", equals: "Yes" }, group, col, NOW)).toBe("50");
  });

  it("computes per-row derivations without grouping", () => {
    const headers = ["Patient ID", "Email", "Appointment Date", "No Show"];
    const rows = [
      ["P-1", "a@x.com", "2026-07-01", "No"],
      ["P-1", "a@x.com", "2026-07-08", "Yes"],
    ];
    const [ds] = applyMapping(headers, rows, metricSchema, [
      {
        key: "metric_missed_appointments",
        confidence: 80,
        note: "",
        fields: [
          { field: "customer_id", column: "Patient ID" },
          { field: "email", column: "Email" },
          { field: "date", column: "Appointment Date" },
          { field: "missed_appointments", column: "", derive: { op: "bool", column: "No Show" } },
        ],
      },
    ], NOW);
    expect(ds!.grouped).toBe(false);
    expect(ds!.rows).toEqual([
      ["P-1", "a@x.com", "2026-07-01", "0"],
      ["P-1", "a@x.com", "2026-07-08", "1"],
    ]);
  });
});
