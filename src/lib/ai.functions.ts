import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { logAiUsage } from "./ai-usage.server";

const MODEL = "google/gemini-3-flash-preview";

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

    const { text, usage } = await generateText({
      model: gateway(MODEL),
      prompt: `${system}\n\nConversation so far:\n${convo}\n\nChAi:`,
    });
    await logAiUsage("askChai", MODEL, usage);

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

    const { text, usage } = await generateText({
      model: gateway(MODEL),
      prompt,
    });
    await logAiUsage("summarizeRiskReasons", MODEL, usage);

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = z.record(z.string(), z.string()).parse(JSON.parse(jsonText));
    return parsed;
  });

// ---------------------------------------------------------------------------
// Collective insights — the top findings shown on the post-onboarding welcome
// screen before a user's full dashboard is unlocked.
// ---------------------------------------------------------------------------

const CollectiveInsightsInput = z.object({
  summary: z.string().min(1),
});

export type CollectiveInsightsInput = z.infer<typeof CollectiveInsightsInput>;

export const generateCollectiveInsights = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CollectiveInsightsInput.parse(input))
  .handler(async ({ data }): Promise<{ insights: string[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `You are ChAi, a customer-retention analyst. Based on the workspace analysis below, write the TOP 5 most interesting, high-level collective insights a business owner would most want to know about their customer base and retention. Each insight is ONE punchy plain-language sentence (max ~18 words), specific and useful. Do not invent precise numbers that aren't given.

Workspace analysis:
${data.summary}

Return ONLY a JSON array of 5 strings (no markdown, no code fences).`;

    const { text, usage } = await generateText({
      model: gateway(MODEL),
      prompt,
    });
    await logAiUsage("generateCollectiveInsights", MODEL, usage);

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    let insights: string[] = [];
    try {
      insights = z.array(z.string()).parse(JSON.parse(jsonText));
    } catch {
      insights = [];
    }
    return { insights: insights.slice(0, 5) };
  });
