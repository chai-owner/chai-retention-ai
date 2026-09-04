import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAiProvider, DEFAULT_AI_MODEL } from "./ai-provider.server";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";

const MODEL = DEFAULT_AI_MODEL;

const FALLBACK_REPLY =
  "I couldn't reach the analysis service just now. In the meantime, check the Risk Center for your highest-risk accounts and the Data Quality page for gaps worth filling.";

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
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => AskChAiInput.parse(input))
  .handler(async ({ data }): Promise<{ reply: string }> => {
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

    const result = await getAiProvider().generateText({
      operation: "askChai",
      model: MODEL,
      prompt: `${system}\n\nConversation so far:\n${convo}\n\nChAi:`,
    });
    if (!result.ok) return { reply: result.message ?? FALLBACK_REPLY };

    return { reply: result.text.trim() || FALLBACK_REPLY };
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
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => RiskSummaryInput.parse(input))
  .handler(async ({ data }): Promise<Record<string, string>> => {
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

    const result = await getAiProvider().generateSummary({
      operation: "summarizeRiskReasons",
      model: MODEL,
      instructions: prompt,
      content: "",
    });
    if (!result.ok) return {};

    const jsonText = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try {
      return z.record(z.string(), z.string()).parse(JSON.parse(jsonText));
    } catch {
      return {};
    }
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
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => CollectiveInsightsInput.parse(input))
  .handler(async ({ data }): Promise<{ insights: string[] }> => {
    const prompt = `You are ChAi, a customer-retention analyst. Based on the workspace analysis below, write the TOP 5 most interesting, high-level collective insights a business owner would most want to know about their customer base and retention. Each insight is ONE punchy plain-language sentence (max ~18 words), specific and useful. Do not invent precise numbers that aren't given.

Workspace analysis:
${data.summary}

Return ONLY a JSON array of 5 strings (no markdown, no code fences).`;

    const result = await getAiProvider().generateSummary({
      operation: "generateCollectiveInsights",
      model: MODEL,
      instructions: prompt,
      content: "",
    });
    if (!result.ok) return { insights: [] };

    const jsonText = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
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
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => RecommendMetricWeightsInput.parse(input))
  .handler(async ({ data }): Promise<{ recommendations: MetricRecommendation[] }> => {
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

    const result = await getAiProvider().generateRecommendations({
      operation: "recommendMetricWeights",
      model: MODEL,
      instructions: prompt,
      context: "",
    });
    if (!result.ok) return { recommendations: [] };

    const jsonText = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
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
    mustTrack: z.string().optional(),
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
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => RecommendMetricsInput.parse(input))
  .handler(async ({ data }): Promise<{ metrics: GeneratedMetric[]; error?: string }> => {
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
      p.mustTrack && `Metrics the owner explicitly wants tracked: ${p.mustTrack}`,
    ]
      .filter(Boolean)
      .join("\n");

    const industry = (p.industry ?? "").trim();
    const model = (p.model ?? "").trim();

    const prompt = `You are ChAi, a customer-retention analyst. A business owner is setting up churn tracking. Based ONLY on their business below, decide the 6-8 retention/health metrics THIS specific business should track to predict churn.

CRITICAL: the metrics must be written in the everyday vocabulary of ${industry ? `the ${industry} industry` : "their industry"}${model ? ` and a ${model} business` : ""}, using the words that industry actually uses for its customers, visits, orders or appointments. Never return a generic SaaS/engagement template. Examples of the right level of specificity: a medical or dental practice → "Missed appointment rate", "Days since last visit", "Recall appointment booked", "Treatment plan completion"; an e-commerce store → "Days since last order", "Repeat purchase rate"; a gym → "Weekly check-ins"; B2B SaaS → "Feature adoption", "Seats activated". At least 4 of the metrics must be ones that would only make sense for ${industry || "this specific industry"}.

Business profile:
${profileLines || "(limited profile provided)"}

${(p.mustTrack ?? "").trim() ? `MUST INCLUDE: the owner explicitly asked to track "${p.mustTrack}". Represent every one of those as its own metric in your answer (clean up the wording into a proper 2-4 word metric name), then fill the remaining slots with metrics you choose.` : ""}

For each metric provide:
- name: short metric name (2-4 words), specific to this business and industry
- category: one of Engagement, Transactions, Support, Satisfaction, Retention
- why: one sentence on what it tells them (max ~16 words)
- churn: one sentence on how it signals churn (max ~16 words)
- weight: WHOLE NUMBER from 1 to 5 — importance for THIS business (1=Unimportant, 5=Critical). Never a decimal or a percentage.
- reason: short reason for the weight, grounded in their business (max ~14 words)

Return ONLY a JSON array (no prose, no markdown, no code fences) of 6-8 objects with keys: name, category, why, churn, weight, reason.`;

    const metricRow = z.object({
      name: z.string(),
      category: z.string().optional(),
      why: z.string().optional(),
      churn: z.string().optional(),
      weight: z.union([z.number(), z.string()]).optional(),
      reason: z.string().optional(),
    });

    // Models sometimes wrap the array in prose, fences or an object — pull the
    // first JSON array out of the text rather than failing to a generic set.
    function extractMetrics(raw: string): GeneratedMetric[] {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const candidates: string[] = [cleaned];
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1));
      const objStart = cleaned.indexOf("{");
      const objEnd = cleaned.lastIndexOf("}");
      if (objStart !== -1 && objEnd > objStart) candidates.push(cleaned.slice(objStart, objEnd + 1));

      for (const candidate of candidates) {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(candidate);
        } catch {
          continue;
        }
        // Accept either a bare array or an object with an array property.
        let arr: unknown = parsedJson;
        if (!Array.isArray(arr) && parsedJson && typeof parsedJson === "object") {
          arr = Object.values(parsedJson as Record<string, unknown>).find(Array.isArray);
        }
        const rows = z.array(metricRow).safeParse(arr);
        if (!rows.success) continue;

        const seen = new Set<string>();
        const out = rows.data
          .filter((m) => {
            const k = m.name.trim().toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 8)
          .map((m) => {
            // Some models answer with fractional "importance shares" (0.35) or
            // 0-100 scores; normalise everything onto the 1-5 scale.
            const rawWeight = typeof m.weight === "string" ? Number(m.weight) : (m.weight ?? 3);
            let w = Number.isFinite(rawWeight) ? (rawWeight as number) : 3;
            if (w > 0 && w <= 1) w = w * 5;
            else if (w > 5) w = (w / 100) * 5;
            return {
              name: m.name.trim(),
              category: (m.category ?? "Engagement").trim(),
              why: (m.why ?? "").trim(),
              churn: (m.churn ?? "").trim(),
              weight: Math.max(1, Math.min(5, Math.round(w) || 3)),
              reason: (m.reason ?? "").trim(),
            };
          });
        if (out.length >= 4) return out;
      }
      return [];
    }

    const ai = getAiProvider();
    const first = await ai.generateRecommendations({
      operation: "recommendMetrics",
      model: MODEL,
      instructions: prompt,
      context: "",
    });
    if (!first.ok) {
      console.error(
        `[recommendMetrics] provider call failed (industry="${industry}", model="${model}"): ${first.message ?? "no message"}`,
      );
      return { metrics: [], error: first.message ?? "The AI service did not respond." };
    }
    let metrics = extractMetrics(first.text);
    if (metrics.length === 0) {
      console.error(
        `[recommendMetrics] could not parse metrics from first response (industry="${industry}"). Raw text (first 800 chars): ${first.text.slice(0, 800)}`,
      );
    }

    // One strict retry before we give up and show the generic fallback set.
    if (metrics.length === 0) {
      const retry = await ai.generateRecommendations({
        operation: "recommendMetrics",
        model: MODEL,
        instructions: `${prompt}

Your previous answer could not be parsed. Reply with the raw JSON array only — start with "[" and end with "]".`,
        context: "",
      });
      if (!retry.ok) {
        console.error(
          `[recommendMetrics] retry call failed (industry="${industry}"): ${retry.message ?? "no message"}`,
        );
        return { metrics: [], error: retry.message ?? "The AI service did not respond." };
      }
      metrics = extractMetrics(retry.text);
      if (metrics.length === 0) {
        console.error(
          `[recommendMetrics] retry response also unparseable (industry="${industry}"). Raw text (first 800 chars): ${retry.text.slice(0, 800)}`,
        );
      }
    }

    console.info(
      `[recommendMetrics] generated ${metrics.length} metrics (industry="${industry}", businessModel="${model}")`,
    );
    if (metrics.length === 0) {
      return {
        metrics: [],
        error: "The AI service replied, but its answer couldn't be read as a metric list.",
      };
    }
    return { metrics };
  });

