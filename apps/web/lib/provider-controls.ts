import type { ProviderUsageSnapshot } from "@platform/site-data";

export const providerModels = [
  { id: "gpt-5.6-luna", name: "Luna", description: "Everyday drafts, lowest cost", input: 0.2, output: 1.2 },
  { id: "gpt-5.6-terra", name: "Terra", description: "A balance of quality and cost", input: 2, output: 12 },
  { id: "gpt-5.6-sol", name: "Sol", description: "Detailed analysis and complex work", input: 4, output: 20 },
] as const;

export type ProviderSettings = {
  revision: number;
  aiEnabled: boolean;
  aiModel: string;
  aiBudgetEur: number;
  aiExtraEur: number;
  extraMonth: string;
  usdPerEur: number;
  fxAsOf: string;
  googleEnabled: boolean;
  googleDailyLimit: number;
  googleMonthlyLimit: number;
  geocodingMonthlyLimit: number;
};
export type ProviderControlSnapshot = {
  configured: boolean;
  settings: ProviderSettings;
  monthStart: string;
  resetAt: string;
  aiUsedUsdMicros: number;
  aiCommittedUsdMicros: number;
  aiPending: number;
  aiUncertain: number;
  googleCalls: number;
  geocodingCalls: number;
  googleToday: number;
};
export type ProviderCapabilities = {
  aiReady: boolean;
  aiModel: string;
  googleReady: boolean;
  googleDailyCeiling: number;
  customAiEndpoint: boolean;
  canManage: boolean;
};
export type ProviderControlChange = {
  action: "save" | "add_budget";
  requestId: string;
  revision: number;
  settings?: Pick<ProviderSettings, "aiEnabled" | "aiModel" | "aiBudgetEur" | "googleEnabled" | "googleDailyLimit" | "googleMonthlyLimit" | "geocodingMonthlyLimit">;
  amountEur?: number;
};
export const googleDailyCeiling = (value: string | undefined) => {
  const n = Number.parseInt(value ?? "30", 10);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 30;
};
const money = (n: unknown, max = 1000) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
const count = (n: unknown, max: number) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;
export function parseProviderControlChange(input: unknown): ProviderControlChange {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid settings request.");
  const value = input as Record<string, unknown>;
  if (typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId) || !count(value.revision, 1_000_000_000)) throw new Error("Refresh the page before saving settings.");
  if (value.action === "add_budget" && money(value.amountEur) && Number(value.amountEur) > 0) {
    return { action: "add_budget", requestId: value.requestId, revision: Number(value.revision), amountEur: Number(value.amountEur) };
  }
  if (value.action !== "save" || !value.settings || typeof value.settings !== "object" || Array.isArray(value.settings)) throw new Error("Invalid settings request.");
  const settings = value.settings as Record<string, unknown>;
  if (Object.keys(settings).sort().join(",") !== "aiBudgetEur,aiEnabled,aiModel,geocodingMonthlyLimit,googleDailyLimit,googleEnabled,googleMonthlyLimit" ||
      typeof settings.aiEnabled !== "boolean" || typeof settings.googleEnabled !== "boolean" ||
      !providerModels.some(model => model.id === settings.aiModel) || !money(settings.aiBudgetEur) ||
      !count(settings.googleDailyLimit, 500) || !count(settings.googleMonthlyLimit, 100_000) || !count(settings.geocodingMonthlyLimit, 100_000)) throw new Error("Check the model, budget and request limits.");
  return { action: "save", requestId: value.requestId, revision: Number(value.revision), settings: settings as ProviderControlChange["settings"] };
}

export function providerControlError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("provider_settings_changed")) return { status: 409, message: "Settings changed in another session. Refresh and try again." };
  if (message.includes("provider_ai_running")) return { status: 409, message: "An owner AI request is already running. Please wait for it to finish." };
  if (message.includes("provider_ai_budget")) return { status: 429, message: "Owner AI budget reached. Add allowance in Usage & providers to continue." };
  if (message.includes("provider_google_limit")) return { status: 429, message: "Google request limit reached. Cached searches still work. Manage limits in Usage & providers." };
  if (message.includes("provider_paused")) return { status: 503, message: "This provider is paused in Usage & providers." };
  return { status: 503, message: "Provider controls are unavailable. No new provider request was started." };
}

export const googleAllowances = [
  { service: "places_text_search", name: "Business search", detail: "Google Places", freeCalls: 1000, unitUsd: 0.035 },
  { service: "geocoding", name: "Address lookups", detail: "Google Geocoding", freeCalls: 10_000, unitUsd: 0.005 },
] as const;
export const remainingPercent = (used: number, limit: number) => limit <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((1 - used / limit) * 100)));
export const monthlyAllowance = (snapshot: ProviderControlSnapshot) => snapshot.settings.aiBudgetEur + (snapshot.settings.extraMonth === snapshot.monthStart.slice(0, 7) ? snapshot.settings.aiExtraEur : 0);
export const modelLabel = (id: string) => providerModels.find(model => id === model.id || id.startsWith(`${model.id}-`))?.name ?? id;
export function usageView(usage: ProviderUsageSnapshot) {
  const ai = usage.providers.filter(row => row.provider === "openai");
  return {
    aiCalls: ai.reduce((n, row) => n + row.calls, 0),
    aiTokens: ai.reduce((n, row) => n + row.totalTokens, 0),
    unknownCalls: usage.month.unknownPriceCalls,
    google: googleAllowances.map(sku => ({ ...sku, calls: usage.providers.filter(row => row.provider === "google_maps" && row.service === sku.service).reduce((n, row) => n + row.calls, 0) })),
  };
}
