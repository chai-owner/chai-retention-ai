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

Produce:
- riskLevel: one of Low, Medium, High, Critical
- probability: your own 0-100 churn probability estimate over the next 90 days
- summary: 1-2 sentences explaining the risk in plain language
- topDrivers: 2-4 short bullet phrases naming what's driving the risk
- recommendedActions: 2-3 concrete actions, each with a brief "why"`;

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      output: Output.object({ schema: RiskOutput }),
      prompt,
    });

    return output;
  });
