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
          .map((f) => `${f.name} (${f.type}${f.mandatory ? ", required" : ""})`)
          .join(", ");
        return `- ${s.key} ("${s.label}" — ${s.description})\n    fields: ${fields}`;
      })
      .join("\n");

    const instruction = `You are ChAi's data ingestion engine. Read the attached document and extract any data that maps to the customer datasets below. A single document may map to one or more datasets (e.g. an invoice maps to "transactions", and may also yield a "customers" row).

Available datasets and their fields:
${schemaSpec}

Rules:
- Only output data you can actually find in the document. Do not invent values.
- Format dates as YYYY-MM-DD. Strip currency symbols and thousands separators from numeric fields.
- For each dataset you populate, return its exact field names as headers and one array of string values per row, in the same order as headers.
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
        text: `Document filename: ${data.fileName}\n\nDocument contents:\n${data.text.slice(0, 60000)}`,
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
