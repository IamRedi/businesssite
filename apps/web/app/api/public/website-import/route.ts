import { NextResponse } from "next/server";
import type { WebsiteUnderstanding } from "@platform/ai-assistant";
import { resolveBusinessCategoryKeys } from "@platform/website-engine";
import { analyzeWebsiteForImport, classifyWebsiteImportError } from "../../../../lib/website-import";
import { resolveCreationCategory } from "../../../../lib/creation-category";
import {
  buildImageQualityProfile,
  buildPlannerInput,
  buildSourceWebsiteModel,
  enforcePlanGuards,
  PlanLocaleMismatchError,
  readAnalysisCache,
  runPlanPass,
  runUnderstandingPass,
  websiteImportContentHash,
  websiteImportPlanCacheKey,
  websiteImportUnderstandingCacheKey,
  writeAnalysisCache,
} from "../../../../lib/website-understanding";
import { configuredAiProvider, aiConfig } from "../../../../lib/ai-config";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { clientAddress, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { readJsonBody } from "../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../lib/same-origin";

const unavailable = (errorCode: string) =>
  NextResponse.json(
    { errorCode },
    { status: 422 },
  );

function attachUrls(understanding: WebsiteUnderstanding, images: Array<{ index: number; url: string }>): WebsiteUnderstanding {
  for (const image of understanding.images) {
    const resolved = images[image.index];
    if (resolved) image.url = resolved.url;
  }
  return understanding;
}

/**
 * Shared read-only analyzer for both creation flows (homepage wizard and
 * owner complimentary). Fetches only the customer-declared public website
 * through the canonical safe reader, extracts deterministic facts, and — when
 * the dedicated import-AI flag allows it — runs the two locale-aware semantic
 * passes: understanding is cached language-neutral per source website, while
 * the plan/copy is cached per source + locale, so SQ/IT/DE requests never
 * receive each other's copy. The deterministic pipeline keeps working without
 * AI and never claims to be AI analyzed.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return unavailable("import_unavailable");
  const body = await readJsonBody<{ url?: unknown; siteLocale?: unknown; categoryKey?: unknown; subcategoryKey?: unknown }>(request, 512);
  if (!body.ok)
    return NextResponse.json({ errorCode: "invalid_request" }, { status: body.status });
  const candidate = typeof body.value.url === "string" ? body.value.url.trim() : "";
  let targetHost: string;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes("."))
      return NextResponse.json({ errorCode: "invalid_request" }, { status: 400 });
    targetHost = url.hostname.toLowerCase();
  } catch {
    return NextResponse.json({ errorCode: "invalid_request" }, { status: 400 });
  }
  const policy = abusePolicy.websiteImport;
  const [networkLimit, targetLimit] = await Promise.all([
    enforceSubjectRateLimit("website_import_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("website_import_target", targetHost, policy.target.limit, policy.target.windowSeconds),
  ]);
  if (!networkLimit.allowed || !targetLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.max(networkLimit.retryAfterSeconds, targetLimit.retryAfterSeconds)),
        },
      },
    );
  const siteLocale = typeof body.value.siteLocale === "string" ? body.value.siteLocale.trim().slice(0, 8) : "en";
  // Optional owner-selected canonical keys from the creation form; unknown
  // keys are dropped (fail-safe) and are authority level 1 on this endpoint.
  const ownerKeys = resolveBusinessCategoryKeys({
    categoryKey: typeof body.value.categoryKey === "string" ? body.value.categoryKey.trim().slice(0, 60) : undefined,
    subcategoryKey: typeof body.value.subcategoryKey === "string" ? body.value.subcategoryKey.trim().slice(0, 60) : undefined,
  });
  try {
    const { preview, research } = await analyzeWebsiteForImport(candidate);
    const sourceModel = buildSourceWebsiteModel(research);
    const contentHash = websiteImportContentHash(research);
    const understandingKey = websiteImportUnderstandingCacheKey(research, aiConfig.clientModel);
    const aiAllowed = aiConfig.websiteImportAiEnabled;

    const usageTrail: Array<{ model: string; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; estimatedCostUsdMicros: number | null }> = [];
    let understanding: WebsiteUnderstanding | undefined;
    let plan;
    let cachedUnderstanding = false;
    let cachedPlan = false;

    if (aiAllowed) {
      const cachedUnderstandingRow = await readAnalysisCache(understandingKey);
      if (cachedUnderstandingRow?.understanding) {
        // Language-neutral facts: resolved source URLs re-attached per request
        // (they are not part of the cached payload's contract).
        understanding = attachUrls(cachedUnderstandingRow.understanding, sourceModel.images);
        cachedUnderstanding = true;
      }
    }

    if (!aiAllowed) {
      return NextResponse.json({ preview, cacheKey: contentHash, engine: "deterministic" as const }, { status: 200 });
    }

    try {
      const provider = configuredAiProvider();
      if (!understanding) {
        const understandingPass = await runUnderstandingPass(provider, aiConfig.clientModel, research, sourceModel);
        understanding = attachUrls(understandingPass.understanding, sourceModel.images);
        usageTrail.push(...understandingPass.usage);
        await writeAnalysisCache({
          cacheKey: understandingKey, sourceUrl: research.sourceUrl, model: aiConfig.clientModel,
          understanding, plan: null, createdAt: new Date().toISOString(),
        });
      }
      // Category authority ladder (P4-002): fresh owner form keys outrank the
      // AI detection; no profile/legacy context exists on this endpoint.
      const categorySignal = resolveCreationCategory({
        ownerApproved: ownerKeys.categoryKey
          ? { categoryKey: ownerKeys.categoryKey, subcategoryKey: ownerKeys.subcategoryKey }
          : null,
        aiSuggested: understanding?.suggestedCategory ?? null,
      });
      // The plan is cached per source + locale + category: a plan built under
      // one category is never served for another.
      const planKey = websiteImportPlanCacheKey(research, aiConfig.clientModel, siteLocale, categorySignal);
      const cachedPlanRow = await readAnalysisCache(planKey);
      if (cachedPlanRow?.plan) {
        plan = cachedPlanRow.plan;
        cachedPlan = true;
      }
      if (!plan) {
        const plannerInput = buildPlannerInput(understanding!, siteLocale, categorySignal);
        const planPass = await runPlanPass(provider, aiConfig.clientModel, plannerInput, understanding!);
        plan = planPass.plan;
        usageTrail.push(...planPass.usage);
        await writeAnalysisCache({
          cacheKey: planKey, sourceUrl: research.sourceUrl, model: aiConfig.clientModel,
          understanding: null, plan, createdAt: new Date().toISOString(),
        });
      }
      const { plan: guardedPlan, heroDroppedReason } = enforcePlanGuards(plan, understanding, sourceModel.images);
      if (heroDroppedReason && guardedPlan.notes.length < 8) guardedPlan.notes = [...guardedPlan.notes, `Hero image dropped: ${heroDroppedReason}.`];
      return NextResponse.json(
        {
          preview, cacheKey: planKey, contentHash,
          // Label reflects the expensive artifact: a cached plan is a full
          // cache hit; a cached understanding with a fresh plan still did AI work.
          engine: (cachedPlan ? "ai-cached" : "ai") as "ai" | "ai-cached",
          model: aiConfig.clientModel,
          understanding,
          plan: guardedPlan,
          // Auditable structured signals the plan was built under (P4-002).
          plannerSignals: { category: categorySignal, imageQualityProfile: buildImageQualityProfile(understanding!) },
          aiUsage: { calls: usageTrail.length, visionInputs: sourceModel.visionCandidates.length, usage: usageTrail },
        },
        { status: 200 },
      );
    } catch (aiError) {
      // AI failure (including locale-mixing refusal) degrades to the
      // deterministic pipeline, clearly labeled. Server-side log keeps the
      // cause diagnosable without exposing internals.
      console.error("[website-import] AI stage failed:", aiError instanceof Error ? aiError.message : aiError);
      return NextResponse.json({ preview, cacheKey: contentHash, engine: "deterministic" as const }, { status: 200 });
    }
  } catch (error) {
    return unavailable(classifyWebsiteImportError(error));
  }
}
