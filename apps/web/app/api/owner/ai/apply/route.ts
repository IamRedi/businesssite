import { NextResponse } from "next/server";
import { createPreparedBusinessProfile, PostgresFinderRepository } from "@platform/business-finder";
import { validateWebsiteBlueprint } from "@platform/ai-assistant";
import { businessTemplates, generateSiteDocument } from "@platform/website-engine";
import { PostgresSiteRepository } from "@platform/site-data";
import { platformConfig } from "../../../../../lib/platform-config";
import { previewToken } from "../../../../../lib/preview-token";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../../lib/request-body";

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "ai.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  try {
    const parsed = await readJsonBody<{ runId?: string }>(request, 2 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { runId } = parsed.value;
    if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });
    const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const demoSites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const run = await sites.getAiRun(runId);
    if (!run || run.actorType !== "owner" || run.operation !== "website_blueprint" || !run.leadId) return NextResponse.json({ error: "AI website plan was not found." }, { status: 404 });
    if (run.status === "applied" && run.appliedSiteId) {
      const slug = await demoSites.getSlugBySiteId(run.appliedSiteId);
      const tokenId = await demoSites.getOrCreatePreviewTokenId(run.appliedSiteId);
      return NextResponse.json({ siteId: run.appliedSiteId, siteSlug: slug, previewUrl: `/preview/${previewToken(tokenId)}`, idempotent: true });
    }
    if (run.status !== "completed") return NextResponse.json({ error: "AI website plan is not ready to apply." }, { status: 409 });
    const keys = businessTemplates.map((template) => template.key);
    const blueprint = validateWebsiteBlueprint(run.output, keys);
    const finder = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const lead = await finder.getLead(run.leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const existing = await finder.listPreparedProfiles(lead.id);
    const previous = existing.at(-1)?.profile ?? createPreparedBusinessProfile(lead, 1);
    const version = existing.length + 1;
    const profile = {
      ...previous, id: `prepared-${lead.id}-v${version}`, version, preparedAt: new Date().toISOString(),
      business: {
        ...previous.business,
        category: blueprint.businessType,
        description: blueprint.content.description,
        phone: blueprint.businessDetails.phone || previous.business.phone,
        email: blueprint.businessDetails.email || previous.business.email,
        address: blueprint.businessDetails.address || previous.business.address,
        city: blueprint.businessDetails.city || previous.business.city,
        country: blueprint.businessDetails.country || previous.business.country,
        socialLinks: {
          instagram: blueprint.businessDetails.socialLinks.instagram || previous.business.socialLinks?.instagram,
          facebook: blueprint.businessDetails.socialLinks.facebook || previous.business.socialLinks?.facebook,
          tiktok: blueprint.businessDetails.socialLinks.tiktok || previous.business.socialLinks?.tiktok,
        },
        openingHours: blueprint.businessDetails.openingHours.length ? blueprint.businessDetails.openingHours : previous.business.openingHours,
      },
      services: blueprint.services,
      media: {
        ...previous.media,
        heroImageUrl: blueprint.media.heroImageUrl || previous.media?.heroImageUrl,
        serviceImageUrls: blueprint.media.serviceImageUrls.length ? blueprint.media.serviceImageUrls : previous.media?.serviceImageUrls,
        galleryImageUrls: blueprint.media.galleryImageUrls.length ? blueprint.media.galleryImageUrls : previous.media?.galleryImageUrls,
      },
    };
    await finder.createPreparedProfile({ id: profile.id, leadId: lead.id, version, profile, status: "ready_for_handoff", createdAt: profile.preparedAt });
    const generated = generateSiteDocument(profile, blueprint.templateKey, blueprint.themeKey);
    const site = { ...generated, content: { name: lead.name, ...blueprint.content }, services: blueprint.services };
    const saved = await demoSites.saveDemo({ site, leadId: lead.id, preparedProfileId: profile.id, trialDurationDays: platformConfig.trialDays });
    await sites.markAiRunApplied(run.id, saved.id);
    const tokenId = await demoSites.getOrCreatePreviewTokenId(saved.id);
    return NextResponse.json({ siteId: saved.id, siteSlug: saved.slug, previewUrl: `/preview/${previewToken(tokenId)}`, templateKey: site.templateKey, themeKey: site.themeKey }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to apply the AI website plan." }, { status: 500 });
  }
}
