import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logAiCall = vi.fn(async (_record: Record<string, unknown>) => {});
vi.mock("./ai-usage.server", () => ({
  logAiCall: (r: Record<string, unknown>) => logAiCall(r),
  resolveAiCaller: async () => null,
}));

import {
  ANTHROPIC_FALLBACK_MODEL,
  buildAnthropicRequest,
  getAiProvider,
  setAiProvider,
} from "./ai-provider.server";

const origLovable = process.env.LOVABLE_API_KEY;
const origAnthropic = process.env.ANTHROPIC_API_KEY;

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Anthropic fallback", () => {
  beforeEach(() => {
    delete process.env.LOVABLE_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    setAiProvider(null);
    logAiCall.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (origLovable === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = origLovable;
    if (origAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origAnthropic;
  });

  it("sends real image, document and text blocks in order, with max_tokens 16000", async () => {
    const fetchFn = stubFetch(200, {
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    await getAiProvider().generateText({
      operation: "smartIngestExtract",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "first" },
            { type: "image", image: "data:image/jpeg;base64,QUJD" },
            { type: "file", data: "UERG", mediaType: "application/pdf" },
            { type: "text", text: "last" },
          ],
        },
      ],
    });
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(body.max_tokens).toBe(16000);
    expect(body.model).toBe(ANTHROPIC_FALLBACK_MODEL);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "first" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } },
      { type: "text", text: "last" },
    ]);
    expect(JSON.stringify(body)).not.toContain('\\"type\\"');
  });

  it("maps Anthropic usage tokens onto the log row", async () => {
    stubFetch(200, {
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 120, output_tokens: 30 },
    });
    const res = await getAiProvider().generateText({ operation: "askChai", prompt: "hello" });
    expect(res.ok).toBe(true);
    expect(logAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        success: true,
        usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 },
      }),
    );
  });

  it("logs failures as provider anthropic and returns a user-safe message", async () => {
    stubFetch(529, "overloaded");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getAiProvider().generateText({ operation: "smartIngestExtract", prompt: "x" });
    expect(res.ok).toBe(false);
    expect(res.message).toBe("The AI service is temporarily unavailable. Please try again in a moment.");
    expect(logAiCall).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", model: ANTHROPIC_FALLBACK_MODEL, success: false }),
    );
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes("status 529"))).toBe(true);
    errSpy.mockRestore();
  });

  it("puts system messages in the top-level system field", () => {
    const body = buildAnthropicRequest({
      operation: "t",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    });
    expect(body.system).toBe("be brief");
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
  });
});
