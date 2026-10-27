import { createAiProvider } from "@platform/ai-assistant";
import { aiExecutionEnabled } from "./execution-gates";

const positiveInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

export const aiConfig = {
  provider: (process.env.AI_PROVIDER ?? "disabled").trim().toLowerCase(),
  get ownerEnabled() { return aiExecutionEnabled() && process.env.AI_OWNER_ENABLED === "true"; },
  get clientEnabled() { return aiExecutionEnabled() && process.env.AI_CLIENT_ENABLED === "true"; },
  get websiteFetchEnabled() { return aiExecutionEnabled() && process.env.AI_WEBSITE_FETCH_ENABLED === "true"; },
  /**
   * Dedicated gate for the existing-website import AI (semantic analysis +
   * site planning). Requires the global provider to be configured plus this
   * flag only — deliberately independent of AI_CLIENT_ENABLED so activating
   * import AI never enables other client AI features.
   */
  get websiteImportAiEnabled() {
    return this.provider === "openai" && process.env.WEBSITE_IMPORT_AI_ENABLED === "true";
  },
  ownerModel: process.env.AI_OWNER_MODEL?.trim() || "gpt-5.6-sol",
  clientModel: process.env.AI_CLIENT_MODEL?.trim() || "gpt-5.6-luna",
  clientDailyLimit: positiveInteger(process.env.AI_CLIENT_DAILY_LIMIT, 10, 500),
  maxWebsiteCharacters: positiveInteger(process.env.AI_MAX_WEBSITE_CHARACTERS, 24_000, 50_000),
  maxWebsitePages: positiveInteger(process.env.AI_MAX_WEBSITE_PAGES, 6, 10),
};

export function configuredAiProvider() {
  if (!aiExecutionEnabled()) throw new Error("AI execution is disabled.");
  if (aiConfig.provider !== "openai") throw new Error("AI is not enabled for this platform.");
  return createAiProvider(process.env);
}
