import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Smart Data Ingestion — AI extraction of arbitrary documents into ChAi
// datasets. Accepts PDFs / images (multimodal) or pre-parsed text (CSV / XLSX),
// identifies the document type, and maps the contents to one or more datasets.
// ---------------------------------------------------------------------------

const SchemaFieldInput = z.object({
  name: z.string(),
  mandatory: z.boolean(),
  type: z.string(),
  description: z.string().optional(),
  example: z.string().optional(),
  identifier: z.boolean().optional(),
});

const DatasetSchemaInput = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  fields: z.array(SchemaFieldInput),
});

const ExtractInput = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  // For PDFs / images: base64 (no data: prefix). For text-based files: omit.
  base64: z.string().optional(),
  // For CSV / XLSX / TXT: the extracted text content.
  text: z.string().optional(),
  schemas: z.array(DatasetSchemaInput).min(1),
});

export type ExtractInput = z.infer<typeof ExtractInput>;

const MapColumnsInput = z.object({
  fileName: z.string(),
  headers: z.array(z.string()).min(1),
  sampleRows: z.array(z.array(z.string())).default([]),
  totalRows: z.number().int().nonnegative().default(0),
  schemas: z.array(DatasetSchemaInput).min(1),
});

export interface MappedFieldPlan {
  field: string;
  column: string;
  constant?: string;
  derive?: DeriveSpec;
}


export interface DatasetMappingPlan {
  key: string;
  confidence: number;
  note: string;
  fields: MappedFieldPlan[];
  groupBy?: string;
}

export interface MapColumnsResult {
  documentType: string;
  mappings: DatasetMappingPlan[];
}



export interface ExtractedDataset {
  key: string;
  label: string;
  headers: string[];
  rows: string[][];
  confidence: number; // 0-100
  note: string;
}

export interface ExtractResult {
  documentType: string;
  datasets: ExtractedDataset[];
}

export const extractRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const schemaSpec = data.schemas
      .map((s) => {
        const fields = s.fields
          .map(
            (f) =>
              `      • ${f.name} — ${f.type}${f.mandatory ? ", required" : ""}${f.identifier ? ", customer identifier" : ""}` +
              `${f.description ? `: ${f.description}` : ""}${f.example ? ` (e.g. "${f.example}")` : ""}`,
          )
          .join("\n");
        return `- ${s.key} ("${s.label}" — ${s.description})\n    fields:\n${fields}`;
      })
      .join("\n");

    const instruction = `You are ChAi's data ingestion engine. Read the attached document and extract any data that maps to the customer datasets below. A single document may map to one or more datasets (e.g. an invoice maps to "transactions", and may also yield a "customers" row).

Available datasets and their fields:
${schemaSpec}

Several of these datasets are bespoke retention metrics this specific business chose to track. Their field descriptions tell you exactly what the metric means — use that meaning, not the column name, when deciding whether a document contains the metric. A document rarely uses the same wording: match on meaning (e.g. "no-show", "DNA", "patient did not attend" all populate a missed-appointment metric; "days since last order" can come from order dates).

Rules:
- Only output data you can actually find in the document. Do not invent values.
- Consider EVERY dataset above, custom metrics included, and populate each one the document supports — a single document often feeds several.
- You may derive a metric value from the document when the derivation is unambiguous (count occurrences, sum amounts, compute days between two dates, convert a percentage). Do not guess otherwise.
- Every row must carry at least one customer identifier (customer_id, email or customer_name) — pick whichever the document provides; fill the others with "".
- If a custom metric appears only as a per-customer total with no explicit measurement date, use the document's date (invoice/report/statement date) for the date field.
- Format dates as YYYY-MM-DD. Strip currency symbols and thousands separators from numeric fields.
- For each dataset you populate, return its exact field names as headers and one array of string values per row, in the same order as headers.
- Return EVERY row the document contains — one output row per source record. Never summarise, never stop after the first customer, never write "..." or a note saying rows were omitted. If the document lists 120 customers, return 120 rows.
- If a value is unknown for a row, use an empty string "".
- confidence is your 0-100 certainty for that dataset's extraction.


Return ONLY a JSON object (no markdown, no code fences) of the form:
{"documentType":"...","datasets":[{"key":"transactions","headers":["..."],"rows":[["..."]],"confidence":90,"note":"short note"}]}`;

    const isImage = /^image\//.test(data.mimeType);
    const isPdf = data.mimeType === "application/pdf";

    type Part =
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; data: string; mediaType: string };

    const content: Part[] = [{ type: "text", text: instruction }];

    if (data.base64 && isImage) {
      content.push({ type: "image", image: `data:${data.mimeType};base64,${data.base64}` });
    } else if (data.base64 && isPdf) {
      content.push({ type: "file", data: data.base64, mediaType: data.mimeType });
    } else if (data.text) {
      content.push({
        type: "text",
        text: `Document filename: ${data.fileName}\n\nDocument contents:\n${data.text.slice(0, 200000)}`,
      });
    } else {
      throw new Error("No readable content provided for this file.");
    }

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [{ role: "user", content: content as never }],
    });

    const jsonText = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("ChAi could not read structured data from this document. Try a clearer file.");
    }

    const cell = z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .transform((v) => (v == null ? "" : String(v)));

    const ResultSchema = z.object({
      documentType: z.string().default("Document"),
      datasets: z
        .array(
          z.object({
            key: z.string(),
            headers: z.array(z.string()),
            rows: z.array(z.array(cell)),
            confidence: z.coerce.number().min(0).max(100).default(75),
            note: z.string().default(""),
          }),
        )
        .default([]),
    });

    const result = ResultSchema.parse(parsed);

    const byKey = new Map(data.schemas.map((s) => [s.key, s.label]));
    const datasets: ExtractedDataset[] = result.datasets
      .filter((d) => byKey.has(d.key) && d.rows.length > 0)
      .map((d) => ({
        key: d.key,
        label: byKey.get(d.key)!,
        headers: d.headers,
        rows: d.rows,
        confidence: Math.round(d.confidence),
        note: d.note,
      }));

    return { documentType: result.documentType, datasets };
  });

// ---------------------------------------------------------------------------
// Column mapping — for already-structured files (CSV / Excel). The AI only
// decides which column feeds which dataset field; the client then applies that
// mapping to EVERY row locally, so nothing can be truncated or summarised.
// ---------------------------------------------------------------------------

export const mapColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MapColumnsInput.parse(input))
  .handler(async ({ data }): Promise<MapColumnsResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const schemaSpec = data.schemas
      .map((s) => {
        const fields = s.fields
          .map(
            (f) =>
              `      • ${f.name} — ${f.type}${f.mandatory ? ", required" : ""}${f.identifier ? ", customer identifier" : ""}` +
              `${f.description ? `: ${f.description}` : ""}${f.example ? ` (e.g. "${f.example}")` : ""}`,
          )
          .join("\n");
        return `- ${s.key} ("${s.label}" — ${s.description})\n    fields:\n${fields}`;
      })
      .join("\n");

    const sample = [data.headers, ...data.sampleRows.slice(0, 20)]
      .map((r) => r.map((c) => (c ?? "").slice(0, 80)).join(" | "))
      .join("\n");

    const instruction = `You are ChAi's data ingestion mapper. A spreadsheet has been uploaded. You are shown its header row and the first few data rows ONLY — the full file has ${data.totalRows} data rows and will be processed by ChAi, not by you.

Your job: decide which of ChAi's datasets this file feeds, and which spreadsheet column supplies each dataset field. Do NOT return any data rows.

Available datasets and their fields:
${schemaSpec}

Several datasets are bespoke retention metrics this business chose to track. Their field descriptions say what the metric means — match on meaning, not on column-name wording (e.g. "no-show", "DNA", "did not attend" all feed a missed-appointment metric).

File: ${data.fileName}
Header row and sample rows (pipe-separated):
${sample}

Rules:
- Only map a field when a column genuinely supplies it. Otherwise use "" for column.
- A single file may feed several datasets — consider every dataset above.
- Every dataset you map MUST have at least one customer identifier field mapped (customer_id, email or customer_name).
- Use the EXACT column header text from the header row for "column", and the EXACT ChAi field name for "field".
- If a value is the same for every row and is stated in the file (e.g. a report date) but has no column, you may set "constant" instead of "column".
- Skip a dataset entirely if the file has nothing for it.
- confidence is your 0-100 certainty in the mapping for that dataset.

Return ONLY a JSON object (no markdown, no code fences):
{"documentType":"...","mappings":[{"key":"transactions","confidence":90,"note":"short note","fields":[{"field":"customer_id","column":"Account ID"},{"field":"amount","column":"Total"}]}]}`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [{ role: "user", content: instruction }],
    });

    const jsonText = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const start = jsonText.indexOf("{");
      const end = jsonText.lastIndexOf("}");
      if (start < 0 || end <= start) {
        throw new Error("ChAi could not work out the columns in this file. Try a clearer header row.");
      }
      parsed = JSON.parse(jsonText.slice(start, end + 1));
    }

    const ResultSchema = z.object({
      documentType: z.string().default("Spreadsheet"),
      mappings: z
        .array(
          z.object({
            key: z.string(),
            confidence: z.coerce.number().min(0).max(100).default(80),
            note: z.string().default(""),
            fields: z
              .array(
                z.object({
                  field: z.string(),
                  column: z.string().default(""),
                  constant: z.string().optional(),
                }),
              )
              .default([]),
          }),
        )
        .default([]),
    });

    const result = ResultSchema.parse(parsed);
    const known = new Set(data.schemas.map((s) => s.key));

    return {
      documentType: result.documentType,
      mappings: result.mappings.filter((m) => known.has(m.key) && m.fields.length > 0),
    };
  });
