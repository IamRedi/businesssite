import { describe, expect, it } from "vitest";
import { priceOpenAiUsage } from "../src/index";

describe("OpenAI usage pricing", () => {
  it("prices uncached, cached and output tokens for the actual model", () => {
    expect(priceOpenAiUsage("gpt-5.6-sol-2026-09-01", {
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 100_000,
      reasoningTokens: 75_000,
      totalTokens: 1_100_000,
    })).toMatchObject({
      estimatedCostUsdMicros: 9_200_000,
      pricingKnown: true,
      reasoningTokens: 75_000,
      pricingVersion: "openai-standard-2026-09-13",
    });
  });

  it("applies long-context rates without changing token accounting", () => {
    expect(priceOpenAiUsage("gpt-5.6-luna", {
      inputTokens: 300_000,
      cachedInputTokens: 100_000,
      outputTokens: 10_000,
    }).estimatedCostUsdMicros).toBe(102_000);
  });

  it("does not invent a price for an unknown model", () => {
    expect(priceOpenAiUsage("future-model", { inputTokens: 12, outputTokens: 4 })).toMatchObject({
      inputTokens: 12,
      outputTokens: 4,
      estimatedCostUsdMicros: null,
      pricingKnown: false,
    });
  });
});
