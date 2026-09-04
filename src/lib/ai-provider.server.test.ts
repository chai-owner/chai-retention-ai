import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAiCredentials } from "./ai-provider.server";

const originalLovableKey = process.env.LOVABLE_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

describe("AI credential resolution", () => {
  beforeEach(() => {
    delete process.env.LOVABLE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalLovableKey === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = originalLovableKey;

    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  it("keeps Lovable as the preferred provider when both keys exist", async () => {
    process.env.LOVABLE_API_KEY = "lovable-test-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";

    const credentials = await resolveAiCredentials();

    expect(credentials).toMatchObject({
      vendor: "lovable",
      key: "lovable-test-key",
      lookup: { source: "process.env" },
    });
  });

  it("uses Anthropic only when the Lovable key is absent", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";

    const credentials = await resolveAiCredentials();

    expect(credentials).toMatchObject({
      vendor: "anthropic",
      key: "anthropic-test-key",
      lookup: { source: "process.env" },
    });
  });
});