import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createPreparedBusinessProfile, PostgresFinderRepository } from "@platform/business-finder";
import { businessTemplates } from "@platform/website-engine";
import { validateWebsiteBlueprint, websiteBlueprintSchema } from "@platform/ai-assistant";
import { PostgresSiteRepository } from "@platform/site-data";
import { aiConfig, configuredAiProvider } from "../../../../../lib/ai-config";
import { ownerWebsiteInput, ownerWebsiteInstructions } from "../../../../../lib/ai-prompts";
import { readPublicWebsite } from "../../../../../lib/safe-website-reader";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../../lib/request-body";
import { providerControlError, type ProviderControlSnapshot } from "../../../../../lib/provider-controls";

function approvedSourceMedia(
  urls: string[],
  websiteResearch: Awaited<ReturnType<typeof readPublicWebsite>> | undefined,
  limit: number,
) {
  const allowed = new Set(websiteResearch?.images.map((image) => image.url) ?? []);
  return [...new Set(urls.filter((url) => allowed.has(url)))].slice(0, limit);
}

function visualSourceImages(websiteResearch: Awaited<ReturnType<typeof readPublicWebsite>> | undefined) {
  // A bounded visual set keeps analysis predictable while giving the model enough
  // context to reject unrelated machinery, stock-like banners and decorative media.
  return (websiteResearch?.images ?? [])
    .filter((image) => image.url.startsWith("https://"))
    .slice(0, 10)
    .map((image) => ({ url: image.url, detail: "low" as const }));
}

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "ai.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  if (!aiConfig.ownerEnabled) return NextResponse.json({ error: "Owner AI is not enabled." }, { status: 503 });
  let runId: string | undefined;
  let controlFailure = false;
  try {
    const parsed = await readJsonBody<{ leadId?: string; instructions?: string; analyzeWebsite?: boolean }>(request, 8 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;
    const leadId = body.leadId?.trim();
    const instructions = body.instructions?.trim().slice(0, 4000) ?? "";
    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });
    const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    controlFailure = true;
    const controls = await sites.ownerProviderControl("settings") as unknown as ProviderControlSnapshot;
    if (!controls.settings.aiEnabled) throw new Error("provider_paused");
    controlFailure = false;
    const model = controls.configured ? controls.settings.aiModel : aiConfig.ownerModel;
    const finder = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const lead = await finder.getLead(leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const existing = await finder.listPreparedProfiles(leadId);
    const profile = existing.at(-1)?.profile ?? createPreparedBusinessProfile(lead, existing.length + 1);
    let websiteResearch: Awaited<ReturnType<typeof readPublicWebsite>> | undefined;
    let websiteStatus: "not_requested" | "disabled" | "read" | "unavailable" = "not_requested";
    if (body.analyzeWebsite && lead.website) {
      if (!aiConfig.websiteFetchEnabled) websiteStatus = "disabled";
      else {
        try { websiteResearch = await readPublicWebsite(lead.website, aiConfig.maxWebsiteCharacters, aiConfig.maxWebsitePages); websiteStatus = "read"; }
        catch { websiteStatus = "unavailable"; }
      }
    }
    const provider = configuredAiProvider();
    runId = await sites.startAiRun({
      actorType: "owner", actorId: owner.ownerId,
      operation: "website_blueprint", leadId, provider: aiConfig.provider, model,
      input: { instructions, analyzeWebsite: Boolean(body.analyzeWebsite), websiteStatus, pagesRead: websiteResearch?.pagesRead ?? 0 },
    });
    controlFailure = true;
    const reservationId = randomUUID();
    await sites.ownerProviderControl("reserve_ai", { requestId: reservationId, revision: controls.settings.revision, model });
    controlFailure = false;
    const keys = businessTemplates.map((template) => template.key);
    const result = await provider.structured({
      model,
      maxOutputTokens: 8000,
      onUsage: async (actualModel, usage) => {
        if (usage.pricingKnown && Number.isSafeInteger(usage.estimatedCostUsdMicros) && usage.estimatedCostUsdMicros! >= 0) {
          await sites.ownerProviderControl("settle_ai", { requestId: reservationId, estimatedCostUsdMicros: usage.estimatedCostUsdMicros, model: actualModel });
        }
      },
      instructions: ownerWebsiteInstructions(businessTemplates.map((template) => `${template.key} [${template.match.join(", ")}]`).join("; "), profile.locale),
      input: ownerWebsiteInput(profile, instructions, websiteResearch),
      imageInputs: visualSourceImages(websiteResearch),
      schemaName: "website_blueprint", schema: websiteBlueprintSchema(keys),
      validate: (value) => validateWebsiteBlueprint(value, keys), reasoningEffort: "low",
    });
    const blueprint = {
      ...result.value,
      media: {
        heroImageUrl: approvedSourceMedia([result.value.media.heroImageUrl], websiteResearch, 1)[0] ?? "",
        serviceImageUrls: approvedSourceMedia(result.value.media.serviceImageUrls, websiteResearch, result.value.services.length),
        galleryImageUrls: approvedSourceMedia(result.value.media.galleryImageUrls, websiteResearch, 6),
      },
    };
    const details = blueprint.businessDetails;
    const socialLinks = Object.fromEntries(Object.entries(details.socialLinks).filter(([, value]) => Boolean(value)));
    await finder.upsertLead({
      ...lead,
      category: result.value.businessType || lead.category,
      address: details.address || lead.address,
      phone: details.phone || lead.phone,
      signals: {
        ...lead.signals,
        hasEmail: Boolean(details.email || lead.signals.email),
        hasPhone: Boolean(details.phone || lead.phone),
        email: details.email || lead.signals.email,
        description: blueprint.content.description,
        services: blueprint.services.map((service) => service.title),
        socialLinks: Object.keys(socialLinks).length ? socialLinks : lead.signals.socialLinks,
        openingHours: details.openingHours.length ? details.openingHours : lead.signals.openingHours,
      },
    });
    await sites.completeAiRun(runId, blueprint, result.usage, result.responseId);
    const pipelineEvents = await finder.listPipelineEvents(leadId);
    if (shouldRecordAiAnalysisStatus(pipelineEvents.at(-1)?.status)) {
      await finder.addPipelineEvent({ leadId, status: "analyzed", notes: `AI website blueprint prepared with ${result.model}.` });
    }
    await finder.appendAudit({ entityType: "lead", entityId: leadId, action: "ai_website_blueprint_created", details: { runId, model: result.model, websiteStatus, pagesRead: websiteResearch?.pagesRead ?? 0, enrichedFields: { email: Boolean(details.email), phone: Boolean(details.phone), address: Boolean(details.address), services: blueprint.services.length, openingHours: details.openingHours.length, sourceImages: blueprint.media.serviceImageUrls.length } } });
    return NextResponse.json({ runId, blueprint, websiteStatus, pagesRead: websiteResearch?.pagesRead ?? 0, sourceImagesFound: websiteResearch?.images.length ?? 0, sourceImagesAnalyzed: visualSourceImages(websiteResearch).length, model: result.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze this business with AI.";
    if (runId) await new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).failAiRun(runId, message).catch(() => undefined);
    if (controlFailure) { const failure = providerControlError(error); return NextResponse.json({ error: failure.message }, { status: failure.status }); }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
import { shouldRecordAiAnalysisStatus } from "../../../../../lib/owner-ai-pipeline";
