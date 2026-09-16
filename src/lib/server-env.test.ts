import { afterEach, describe, expect, it } from "vitest";
import { inspectServerEnv, readServerEnv } from "./server-env";

const TEST_NAME = "CHAI_SERVER_ENV_LOOKUP_TEST";

describe("server environment lookup", () => {
  afterEach(() => {
    delete process.env[TEST_NAME];
  });

  it("reports process.env as the source without transforming the value", () => {
    process.env[TEST_NAME] = "configured-value";

    expect(inspectServerEnv(TEST_NAME)).toMatchObject({
      value: "configured-value",
      source: "process.env",
    });
    expect(readServerEnv(TEST_NAME)).toBe("configured-value");
  });

  it("reports a missing variable without inventing a value", () => {
    const result = inspectServerEnv(TEST_NAME);

    expect(result.value).toBeUndefined();
    expect(result.source).toBe("missing");
    expect(result.checkedSources).toContain("process.env");
  });
});