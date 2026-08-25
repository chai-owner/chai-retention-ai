// Dataset templates that define which fields ChAi expects for each kind of
// upload, which are mandatory, and sample rows used to generate downloadable
// CSV / Excel example files.

export interface SchemaField {
  name: string;
  mandatory: boolean;
  description: string;
  example: string;
  /**
   * Part of the "who is this row about?" group. A signal row is valid when it
   * carries ANY of these (customer_id, email or customer_name) — not all.
   */
  identifier?: boolean;
}

/** Identifier columns accepted on every non-roster dataset, in match order. */
export const IDENTIFIER_FIELDS = ["customer_id", "email", "customer_name", "name"] as const;

export const IDENTIFIER_HINT =
  "Provide at least one of customer_id, email or customer_name.";

/** Identifier fields declared on a schema. */
export function identifierFields(schema: DatasetSchema): SchemaField[] {
  return schema.fields.filter((f) => f.identifier);
}

/** True when a row carries at least one usable customer identifier. */
export function hasIdentifier(row: Record<string, string | undefined>): boolean {
  return IDENTIFIER_FIELDS.some((f) => (row[f] ?? "").trim().length > 0);
}

/** The three identifier columns every signal dataset accepts. */
export function customerIdentifierFields(): SchemaField[] {
  return [
    {
      name: "customer_id",
      mandatory: false,
      identifier: true,
      description: `Your ID for the customer. ${IDENTIFIER_HINT}`,
      example: "CUS-1001",
    },
    {
      name: "email",
      mandatory: false,
      identifier: true,
      description: `Contact email — used to match the row when the ID is missing or differs. ${IDENTIFIER_HINT}`,
      example: "ops@northwind.com",
    },
    {
      name: "customer_name",
      mandatory: false,
      identifier: true,
      description: `Customer or company name — used to match the row when the ID is missing or differs. ${IDENTIFIER_HINT}`,
      example: "Northwind Labs",
    },
  ];
}

export interface DatasetSchema {
  key: string;
  label: string;
  description: string;
  fields: SchemaField[];
  sampleRows: string[][]; // values aligned to fields order
}

export const datasetSchemas: DatasetSchema[] = [
  {
    key: "customers",
    label: "Customers",
    description: "Your core customer list — one row per customer. " + IDENTIFIER_HINT,
    fields: [
      // Identifier group: any ONE of these three makes the row valid.
      { name: "customer_id", mandatory: false, identifier: true, description: `Your ID for the customer. ${IDENTIFIER_HINT}`, example: "CUS-1001" },
      { name: "name", mandatory: false, identifier: true, description: `Customer or company name. ${IDENTIFIER_HINT}`, example: "Northwind Labs" },
      { name: "email", mandatory: false, identifier: true, description: `Primary contact email. ${IDENTIFIER_HINT}`, example: "ops@northwind.com" },
      { name: "signup_date", mandatory: true, description: "When they became a customer (YYYY-MM-DD)", example: "2024-02-14" },
      { name: "monthly_revenue", mandatory: false, description: "Average revenue per month ($)", example: "1200" },
      { name: "plan", mandatory: false, description: "Plan or tier name", example: "Growth" },
      { name: "region", mandatory: false, description: "Country or region", example: "US" },
    ],
    sampleRows: [
      ["CUS-1001", "Northwind Labs", "ops@northwind.com", "2024-02-14", "1200", "Growth", "US"],
      ["CUS-1002", "Globex Co", "team@globex.com", "2023-11-03", "450", "Starter", "UK"],
    ],
  },
  {
    key: "transactions",
    label: "Transactions",
    description: "Purchases, invoices or renewals — one row per transaction. " + IDENTIFIER_HINT,
    fields: [
      ...customerIdentifierFields(),
      { name: "transaction_id", mandatory: true, description: "Unique transaction ID", example: "TXN-90021" },
      { name: "amount", mandatory: true, description: "Transaction amount ($)", example: "1200" },
      { name: "transaction_date", mandatory: true, description: "Date of transaction (YYYY-MM-DD)", example: "2025-05-01" },
      { name: "product", mandatory: false, description: "Product or SKU purchased", example: "Annual plan" },
      { name: "currency", mandatory: false, description: "Currency code", example: "USD" },
    ],
    sampleRows: [
      ["CUS-1001", "ops@northwind.com", "Northwind Labs", "TXN-90021", "1200", "2025-05-01", "Annual plan", "USD"],
      ["", "team@globex.com", "Globex Co", "TXN-90022", "450", "2025-04-18", "Monthly plan", "USD"],
    ],
  },
  {
    key: "usage",
    label: "Product usage",
    description: "Engagement signals — one row per customer per day or week. " + IDENTIFIER_HINT,
    fields: [
      ...customerIdentifierFields(),
      { name: "date", mandatory: true, description: "Activity date (YYYY-MM-DD)", example: "2025-05-20" },
      { name: "logins", mandatory: false, description: "Number of logins", example: "12" },
      { name: "active_minutes", mandatory: false, description: "Active minutes in product", example: "340" },
      { name: "features_used", mandatory: false, description: "Distinct features used", example: "5" },
    ],
    sampleRows: [
      ["CUS-1001", "ops@northwind.com", "Northwind Labs", "2025-05-20", "12", "340", "5"],
      ["", "team@globex.com", "Globex Co", "2025-05-20", "1", "8", "1"],
    ],
  },
  {
    key: "support",
    label: "Support tickets",
    description: "Support interactions — one row per ticket. " + IDENTIFIER_HINT,
    fields: [
      ...customerIdentifierFields(),
      { name: "ticket_id", mandatory: true, description: "Unique ticket ID", example: "TKT-5512" },
      { name: "created_date", mandatory: true, description: "When the ticket was opened", example: "2025-05-12" },
      { name: "status", mandatory: true, description: "open / resolved / reopened", example: "open" },
      { name: "category", mandatory: false, description: "Issue category", example: "Billing" },
      { name: "satisfaction_score", mandatory: false, description: "CSAT 1–5", example: "3" },
    ],
    sampleRows: [
      ["CUS-1001", "ops@northwind.com", "Northwind Labs", "TKT-5512", "2025-05-12", "open", "Billing", "3"],
      ["", "team@globex.com", "Globex Co", "TKT-5513", "2025-05-09", "resolved", "Technical", "5"],
    ],
  },
  {
    key: "surveys",
    label: "Surveys & CSAT",
    description: "Satisfaction and NPS responses — one row per response. " + IDENTIFIER_HINT,
    fields: [
      ...customerIdentifierFields(),
      { name: "survey_date", mandatory: true, description: "Date of response", example: "2025-05-15" },
      { name: "score", mandatory: true, description: "NPS or CSAT score", example: "9" },
      { name: "type", mandatory: false, description: "NPS / CSAT", example: "NPS" },
      { name: "comment", mandatory: false, description: "Free-text feedback", example: "Great product" },
    ],
    sampleRows: [
      ["CUS-1001", "ops@northwind.com", "Northwind Labs", "2025-05-15", "9", "NPS", "Great product"],
      ["", "team@globex.com", "Globex Co", "2025-05-15", "4", "CSAT", "Support was slow"],
    ],
  },
];

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildCsv(schema: DatasetSchema): string {
  const header = schema.fields.map((f) => f.name);
  const rows = [header, ...schema.sampleRows];
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

// Excel-readable HTML table (.xls) — opens natively in Excel without deps.
export function buildExcelHtml(schema: DatasetSchema): string {
  const head = schema.fields
    .map((f) => `<th style="background:#f3e9dd;border:1px solid #ccc">${f.name}${f.mandatory ? " *" : ""}</th>`)
    .join("");
  const body = schema.sampleRows
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table>${`<tr>${head}</tr>`}${body}</table></body></html>`;
}

export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsvTemplate(schema: DatasetSchema) {
  downloadBlob(buildCsv(schema), `chai-${schema.key}-template.csv`, "text/csv;charset=utf-8");
}

export function downloadExcelTemplate(schema: DatasetSchema) {
  downloadBlob(buildExcelHtml(schema), `chai-${schema.key}-template.xls`, "application/vnd.ms-excel");
}
