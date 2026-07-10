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

// ---------------------------------------------------------------------------
// Recommended metric importance — tailors the onboarding "What matters" step
// to the company's industry, business model and profile answers.
// ---------------------------------------------------------------------------

const MetricCatalogItem = z.object({
  name: z.string(),
  why: z.string(),
});

const RecommendMetricWeightsInput = z.object({
  profile: z.object({
    company: z.string().optional(),
    industry: z.string().optional(),
    model: z.string().optional(),
    size: z.string().optional(),
    customers: z.string().optional(),
    avgValue: z.string().optional(),
    whatBuy: z.string().optional(),
    cadence: z.string().optional(),
    lifespan: z.string().optional(),
    concerns: z.string().optional(),
  }),
  metrics: z.array(MetricCatalogItem).min(1).max(30),
});

export type RecommendMetricWeightsInput = z.infer<typeof RecommendMetricWeightsInput>;

export type MetricRecommendation = { name: string; weight: number; reason: string };

export const recommendMetricWeights = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecommendMetricWeightsInput.parse(input))
  .handler(async ({ data }): Promise<{ recommendations: MetricRecommendation[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const p = data.profile;
    const profileLines = [
      p.company && `Company: ${p.company}`,
      p.industry && `Industry: ${p.industry}`,
      p.model && `Business model: ${p.model}`,
      p.size && `Company size: ${p.size}`,
      p.customers && `Number of customers: ${p.customers}`,
      p.avgValue && `Average customer value: ${p.avgValue}`,
      p.whatBuy && `What customers buy: ${p.whatBuy}`,
      p.cadence && `Purchase/usage cadence: ${p.cadence}`,
      p.lifespan && `Typical customer lifespan: ${p.lifespan}`,
      p.concerns && `Owner's concerns: ${p.concerns}`,
    ]
      .filter(Boolean)
      .join("\n");

    const metricList = data.metrics
      .map((m) => `- ${m.name}: ${m.why}`)
      .join("\n");

    const prompt = `You are ChAi, a customer-retention analyst. A business owner is setting up churn tracking. Based on their business below, recommend how important each retention metric is for THEM specifically, on a 1-5 scale where 1 = Unimportant, 2 = Minor, 3 = Moderate, 4 = Important, 5 = Critical.

Business profile:
${profileLines || "(limited profile provided)"}

Metrics to rate (use these EXACT names):
${metricList}

Tailor the weights to this business. For example, a low-frequency high-value SaaS should weight renewal date and feature adoption highly; a high-frequency e-commerce store should weight days since last purchase and order value highly. Give a short reason (max ~14 words) grounded in THEIR business for each metric.

Return ONLY a JSON array (no markdown, no code fences) where each item is:
{"name": "<exact metric name>", "weight": <integer 1-5>, "reason": "<short reason>"}`;

    const { text, usage } = await generateText({
      model: gateway(MODEL),
      prompt,
    });
    await logAiUsage("recommendMetricWeights", MODEL, usage);

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const validNames = new Set(data.metrics.map((m) => m.name));
    let recommendations: MetricRecommendation[] = [];
    try {
      const parsed = z
        .array(
          z.object({
            name: z.string(),
            weight: z.number(),
            reason: z.string().optional(),
          }),
        )
        .parse(JSON.parse(jsonText));
      recommendations = parsed
        .filter((r) => validNames.has(r.name))
        .map((r) => ({
          name: r.name,
          weight: Math.max(1, Math.min(5, Math.round(r.weight))),
          reason: (r.reason ?? "").trim(),
        }));
    } catch {
      recommendations = [];
    }
    return { recommendations };
  });

// ---------------------------------------------------------------------------
// Generate the actual retention metric SET — ChAi invents the metrics a given
// business should track (not just weights for a fixed list), tailored to the
// industry, business model and profile answers gathered in onboarding.
// ---------------------------------------------------------------------------

const RecommendMetricsInput = z.object({
  profile: z.object({
    company: z.string().optional(),
    industry: z.string().optional(),
    model: z.string().optional(),
    size: z.string().optional(),
    customers: z.string().optional(),
    avgValue: z.string().optional(),
    whatBuy: z.string().optional(),
    cadence: z.string().optional(),
    lifespan: z.string().optional(),
    concerns: z.string().optional(),
    successActions: z.string().optional(),
    disengagement: z.string().optional(),
  }),
});

export type RecommendMetricsInput = z.infer<typeof RecommendMetricsInput>;

export type GeneratedMetric = {
  name: string;
  why: string;
  churn: string;
  category: string;
  weight: number;
  reason: string;
};

export const recommendMetrics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecommendMetricsInput.parse(input))
  .handler(async ({ data }): Promise<{ metrics: GeneratedMetric[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const p = data.profile;
    const profileLines = [
      p.company && `Company: ${p.company}`,
      p.industry && `Industry: ${p.industry}`,
      p.model && `Business model: ${p.model}`,
      p.size && `Company size: ${p.size}`,
      p.customers && `Number of customers: ${p.customers}`,
      p.avgValue && `Average customer value: ${p.avgValue}`,
      p.whatBuy && `What customers buy: ${p.whatBuy}`,
      p.cadence && `Purchase/usage cadence: ${p.cadence}`,
      p.lifespan && `Typical customer lifespan: ${p.lifespan}`,
      p.successActions && `What a successful/engaged customer does: ${p.successActions}`,
      p.disengagement && `Signs of disengagement: ${p.disengagement}`,
      p.concerns && `Owner's concerns: ${p.concerns}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are ChAi, a customer-retention analyst. A business owner is setting up churn tracking. Based ONLY on their business below, decide the 6-8 retention/health metrics THIS specific business should track to predict churn. Invent the metrics that fit their industry and model — do not use a generic template. For an e-commerce store you might pick "Days since last order" or "Repeat purchase rate"; for a gym "Weekly check-ins"; for B2B SaaS "Feature adoption" or "Seats activated". Make the names specific and natural for their business.

Business profile:
${profileLines || "(limited profile provided)"}

For each metric provide:
- name: short metric name (2-4 words), specific to this business
- category: one of Engagement, Transactions, Support, Satisfaction, Retention
- why: one sentence on what it tells them (max ~16 words)
- churn: one sentence on how it signals churn (max ~16 words)
- weight: integer 1-5 importance for THIS business (1=Unimportant, 5=Critical)
- reason: short reason for the weight, grounded in their business (max ~14 words)

Return ONLY a JSON array (no markdown, no code fences) of 6-8 objects with keys: name, category, why, churn, weight, reason.`;

    const { text, usage } = await generateText({
      model: gateway(MODEL),
      prompt,
    });
    await logAiUsage("recommendMetrics", MODEL, usage);

    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    let metrics: GeneratedMetric[] = [];
    try {
      const parsed = z
        .array(
          z.object({
            name: z.string(),
            category: z.string().optional(),
            why: z.string().optional(),
            churn: z.string().optional(),
            weight: z.number(),
            reason: z.string().optional(),
          }),
        )
        .parse(JSON.parse(jsonText));
      const seen = new Set<string>();
      metrics = parsed
        .filter((m) => {
          const k = m.name.trim().toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 8)
        .map((m) => ({
          name: m.name.trim(),
          category: (m.category ?? "Engagement").trim(),
          why: (m.why ?? "").trim(),
          churn: (m.churn ?? "").trim(),
          weight: Math.max(1, Math.min(5, Math.round(m.weight))),
          reason: (m.reason ?? "").trim(),
        }));
    } catch {
      metrics = [];
    }
    return { metrics };
  });
