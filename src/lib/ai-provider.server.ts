// Single provider abstraction for every AI call in the app.
//
// Everything AI-related goes through `getAiProvider()`. Swapping vendors means
// adding another implementation of `AiProvider` here — no other file changes.
//
// Each call is additionally:
//   * rate limited per user per hour (configurable per subscription plan)
//   * logged to ai_usage_log (user, provider, model, tokens, success, time)
//   * wrapped in a graceful fallback so failures never throw at the user
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { readServerEnv } from "./server-env";
import { logAiCall, resolveAiCaller, type AiCaller, type AiUsage } from "./ai-usage.server";
import {
  aiHourlyLimitForPlan,
  evaluateRateLimit,
  isRateLimitExempt,
  rateLimitMessage,
  type RateLimitDecision,
} from "./ai-rate-limit";

export const DEFAULT_AI_MODEL = "google/gemini-3-flash-preview";

export type AiMessageContent = string | unknown[];

export interface AiTextRequest {
  /** Short identifier for the feature making the call (stored on the log row). */
  operation: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: AiMessageContent }>;
  model?: string;
}

export interface AiTextResult {
  text: string;
  usage?: AiUsage;
  /** False when the provider failed or the caller was rate limited. */
  ok: boolean;
  /** Present when ok === false — safe to show to the user. */
  message?: string;
}

export interface AiSummaryRequest {
  operation: string;
  /** The material to summarise. */
  content: string;
  /** Extra shaping instructions (tone, length, output format). */
  instructions?: string;
  model?: string;
}

export interface AiRecommendationsRequest {
  operation: string;
  /** Context the recommendations should be grounded in. */
  context: string;
  instructions?: string;
  model?: string;
}

export interface AiProvider {
  readonly name: string;
  generateText(req: AiTextRequest): Promise<AiTextResult>;
  generateSummary(req: AiSummaryRequest): Promise<AiTextResult>;
  generateRecommendations(req: AiRecommendationsRequest): Promise<AiTextResult>;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(caller: AiCaller | null): Promise<RateLimitDecision | null> {
  if (!caller) return null; // unauthenticated/demo calls aren't tracked
  try {
    const { data: sub } = await caller.supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("user_id", caller.userId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const limit = aiHourlyLimitForPlan(sub?.plan_id ?? null);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await caller.supabase
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", caller.userId)
      .gte("created_at", since);

    return evaluateRateLimit(count ?? 0, limit);
  } catch {
    // Never block a user because the limiter itself failed.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lovable AI Gateway implementation
// ---------------------------------------------------------------------------

class LovableAiProvider implements AiProvider {
  readonly name = "lovable";

  async generateText(req: AiTextRequest): Promise<AiTextResult> {
    const model = req.model ?? DEFAULT_AI_MODEL;
    const caller = await resolveAiCaller();

    const exempt = isRateLimitExempt(req.operation);
    const decision = exempt ? null : await checkRateLimit(caller);
    if (decision && !decision.allowed) {
      const message = rateLimitMessage(decision);
      await logAiCall({
        operation: req.operation,
        model,
        provider: this.name,
        success: false,
        errorMessage: "rate_limited",
        caller,
      });
      return { text: "", ok: false, message };
    }

    const key = readServerEnv("LOVABLE_API_KEY");
    if (!key) {
      console.error(
        `[ai] ${req.operation} failed: LOVABLE_API_KEY is not set (model ${model}, user ${caller?.userId ?? "anonymous"})`,
      );
      await logAiCall({
        operation: req.operation,
        model,
        provider: this.name,
        success: false,
        errorMessage: "missing_api_key",
        caller,
      });
      return { text: "", ok: false, message: "The AI service isn't configured right now." };
    }

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const result = await generateText({
        model: gateway(model),
        ...(req.messages
          ? { messages: req.messages as never }
          : { prompt: req.prompt ?? "" }),
      });
      await logAiCall({
        operation: req.operation,
        model,
        provider: this.name,
        usage: result.usage,
        success: true,
        caller,
      });
      return { text: result.text, usage: result.usage, ok: true };
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const status = (error as { statusCode?: number; status?: number } | null)?.statusCode ??
        (error as { status?: number } | null)?.status;
      console.error(
        `[ai] ${req.operation} failed (model ${model}, user ${caller?.userId ?? "anonymous"}, status ${status ?? "n/a"}): ${detail}`,
        error instanceof Error ? error.stack : undefined,
      );
      await logAiCall({
        operation: req.operation,
        model,
        provider: this.name,
        success: false,
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
        caller,
      });
      return {
        text: "",
        ok: false,
        message: "The AI service is temporarily unavailable. Please try again in a moment.",
      };
    }
  }

  generateSummary(req: AiSummaryRequest): Promise<AiTextResult> {
    const prompt = [
      req.instructions?.trim() ||
        "Summarise the following clearly and concisely in plain business language.",
      req.content.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    return this.generateText({ operation: req.operation, prompt, model: req.model });
  }

  generateRecommendations(req: AiRecommendationsRequest): Promise<AiTextResult> {
    const prompt = [
      req.instructions?.trim() ||
        "Based on the context below, give specific, actionable recommendations.",
      req.context.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    return this.generateText({ operation: req.operation, prompt, model: req.model });
  }
}

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!provider) provider = new LovableAiProvider();
  return provider;
}

/** Test seam — lets tests swap in a stub provider. */
export function setAiProvider(next: AiProvider | null) {
  provider = next;
}
