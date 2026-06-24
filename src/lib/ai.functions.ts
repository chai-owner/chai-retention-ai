import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const RiskInput = z.object({
  name: z.string(),
  segment: z.string(),
  health: z.number(),
  churnProbability: z.number(),
  revenue: z.number(),
  sentiment: z.number(),
  lastActivity: z.string(),
  factors: z.array(z.object({ label: z.string(), detail: z.string(), weight: z.number() })),
  subScores: z.record(z.string(), z.number()).optional(),
});

export type RiskInput = z.infer<typeof RiskInput>;

const RiskOutput = z.object({
  riskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
  probability: z.number(),
  summary: z.string(),
  topDrivers: z.array(z.string()),
  recommendedActions: z.array(z.object({ action: z.string(), why: z.string() })),
});

export type RiskAssessment = z.infer<typeof RiskOutput>;

export const assessCustomerRisk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RiskInput.parse(input))
  .handler(async ({ data }): Promise<RiskAssessment> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const subScoreLines = data.subScores
      ? Object.entries(data.subScores)
          .map(([k, v]) => `- ${k}: ${v}/100`)
          .join("\n")
      : "(none provided)";

    const factorLines =
      data.factors.length > 0
        ? data.factors.map((f) => `- ${f.label} (${f.weight}% of risk): ${f.detail}`).join("\n")
        : "(no significant risk factors)";

    const prompt = `You are a B2B SaaS customer-retention analyst. Assess the churn risk for this account and respond concisely.

Account: ${data.name}
Segment: ${data.segment}
Health score: ${data.health}/100
Current churn probability estimate: ${data.churnProbability}%
Annual revenue: $${data.revenue}
Sentiment: ${data.sentiment}/100
Last active: ${data.lastActivity}

Metric sub-scores:
${subScoreLines}

Detected risk factors:
${factorLines}

Return ONLY a JSON object (no markdown, no code fences) with exactly these keys:
- riskLevel: one of "Low", "Medium", "High", "Critical"
- probability: number 0-100 (your churn probability estimate over the next 90 days)
- summary: 1-2 sentences explaining the risk in plain language
- topDrivers: array of 2-4 short bullet phrases naming what's driving the risk
- recommendedActions: array of 2-3 objects, each with "action" and "why"`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
    });

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = RiskOutput.parse(JSON.parse(jsonText));
    return parsed;
  });

// ---------------------------------------------------------------------------
// Ask ChAi — conversational retention analyst
// ---------------------------------------------------------------------------

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

const AskChAiInput = z.object({
  messages: z.array(ChatMessage).min(1),
  context: z.string().optional(),
});

export type AskChAiInput = z.infer<typeof AskChAiInput>;

export const askChai = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskChAiInput.parse(input))
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are ChAi, an AI customer-retention analyst inside a churn-intelligence app.
Answer in plain, friendly language for a non-technical business owner. Be concise (2-4 sentences).
Focus on customer health, churn risk, what data to track, and concrete next steps.
When relevant, point users to the Risk Center, Insights, or Data Quality pages.
Use the workspace context below if helpful; never invent specific numbers that aren't given.

Workspace context:
${data.context?.trim() || "(no live workspace data provided)"}`;

    const convo = data.messages
      .map((m) => `${m.role === "user" ? "User" : "ChAi"}: ${m.text}`)
      .join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt: `${system}\n\nConversation so far:\n${convo}\n\nChAi:`,
    });

    return { reply: text.trim() };
  });

// ---------------------------------------------------------------------------
// Risk reason summaries — one-liners for the dashboard "Needs attention" list
// ---------------------------------------------------------------------------

const RiskSummaryInput = z.object({
  customers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        churnProbability: z.number(),
        revenue: z.number(),
        health: z.number(),
        factors: z.array(z.string()),
      }),
    )
    .min(1)
    .max(8),
});

export type RiskSummaryInput = z.infer<typeof RiskSummaryInput>;

export const summarizeRiskReasons = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RiskSummaryInput.parse(input))
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const lines = data.customers
      .map(
        (c) =>
          `- id ${c.id}: ${c.name}, ${c.churnProbability}% churn risk, health ${c.health}/100, $${c.revenue} revenue. Factors: ${
            c.factors.length ? c.factors.join("; ") : "none recorded"
          }`,
      )
      .join("\n");

    const prompt = `You are a B2B SaaS retention analyst. For each account below, write ONE short plain-language sentence (max ~14 words) explaining why it needs attention and the single best next step.

Accounts:
${lines}

Return ONLY a JSON object (no markdown, no code fences) mapping each account id to its one-sentence summary string.`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
    });

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = z.record(z.string(), z.string()).parse(JSON.parse(jsonText));
    return parsed;
  });
