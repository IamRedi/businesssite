import { describe, expect, it } from "vitest";
import { googleDailyCeiling, monthlyAllowance, parseProviderControlChange, providerControlError, remainingPercent, usageView, type ProviderControlSnapshot } from "./provider-controls";
const settings = { aiEnabled: true, aiModel: "gpt-5.6-luna", aiBudgetEur: 5, googleEnabled: true, googleDailyLimit: 30, googleMonthlyLimit: 1000, geocodingMonthlyLimit: 10_000 };
const requestId = "00000000-0000-4000-8000-000000000001";
const change = { action: "save", revision: 0, requestId, settings };
describe("provider control contracts", () => {
  it("accepts exact settings and a zero budget/pause", () => {
    expect(parseProviderControlChange(change)).toEqual(change);
    expect(parseProviderControlChange({ ...change, settings: { ...settings, aiEnabled: false, aiBudgetEur: 0 } }).settings?.aiBudgetEur).toBe(0);
  });
  it.each([null, "5", -1, 1001, 5.001, Infinity, NaN])("rejects invalid budget %s", budget => expect(() => parseProviderControlChange({ ...change, settings: { ...settings, aiBudgetEur: budget } })).toThrow());
  it.each([{ aiModel: "unpriced-model" }, { aiEnabled: "true" }, { googleEnabled: null }, { googleDailyLimit: 1.2 }, { googleMonthlyLimit: -1 }, { geocodingMonthlyLimit: 100001 }, { secret: "not-allowed" }])("rejects invalid or unknown setting %o", patch => expect(() => parseProviderControlChange({ ...change, settings: { ...settings, ...patch } })).toThrow());
  it("does not accept omitted, malformed identity or revision", () => {
    for (const patch of [{ requestId: "" }, { requestId: "bad" }, { revision: undefined }, { revision: -1 }, { revision: "0" }]) expect(() => parseProviderControlChange({ ...change, ...patch })).toThrow();
    expect(() => parseProviderControlChange({ ...change, settings: { ...settings, aiModel: undefined } })).toThrow();
  });
  it("uses an explicit positive addition without resetting recorded usage", () => {
    expect(parseProviderControlChange({ action: "add_budget", requestId, revision: 2, amountEur: 5 })).toMatchObject({ amountEur: 5 });
    for (const n of [0, -1, 1001, "5"]) expect(() => parseProviderControlChange({ action: "add_budget", requestId, revision: 2, amountEur: n })).toThrow();
    expect(() => parseProviderControlChange({ action: "reset_usage", requestId, revision: 2 })).toThrow();
  });
  it("expires extra allowance at the UTC month boundary", () => {
    const value = { settings: { aiBudgetEur: 5, aiExtraEur: 10, extraMonth: "2026-09" }, monthStart: "2026-09-01T00:00:00Z" } as ProviderControlSnapshot;
    expect(monthlyAllowance(value)).toBe(15);
    expect(monthlyAllowance({ ...value, monthStart: "2026-10-01T00:00:00Z" })).toBe(5);
  });
  it("bounds zero, exceeded and unused quota meters", () => {
    expect(remainingPercent(0, 1000)).toBe(100); expect(remainingPercent(1001, 1000)).toBe(0); expect(remainingPercent(0, 0)).toBe(0); expect(remainingPercent(250, 1000)).toBe(75);
  });
  it("retains unknown costs and separates Google SKUs", () => {
    const zero = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, unknownPriceCalls: 0, pricingVersion: "fixture", estimatedCostUsdMicros: 0 };
    const view = usageView({ generatedAt: "2026-09-13T00:00:00Z", today: { calls: 0, estimatedCostUsdMicros: 0, unknownPriceCalls: 0 }, month: { calls: 10, estimatedCostUsdMicros: 220000, unknownPriceCalls: 2 }, providers: [{ ...zero, provider: "google_maps", service: "places_text_search", calls: 6 }, { ...zero, provider: "google_maps", service: "geocoding", calls: 2 }, { ...zero, provider: "openai", service: "unknown-model", calls: 2, totalTokens: 500, unknownPriceCalls: 2 }], recent: [] });
    expect(view.google.map(row => [row.calls, row.freeCalls])).toEqual([[6, 1000], [2, 10000]]); expect(view.unknownCalls).toBe(2); expect(view.aiTokens).toBe(500);
  });
  it("preserves the server ceiling and sanitizes infrastructure errors", () => {
    expect(googleDailyCeiling(undefined)).toBe(30); expect(googleDailyCeiling("500")).toBe(500); expect(googleDailyCeiling("999")).toBe(30);
    expect(providerControlError(new Error("provider_ai_budget")).status).toBe(429);
    expect(providerControlError(new Error("provider_ai_running")).status).toBe(409);
    expect(providerControlError(new Error("postgres://sensitive-host password=value")).message).not.toMatch(/sensitive|password/);
  });
});
