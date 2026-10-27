import { NextResponse } from "next/server";
import {
  createPreparedBusinessProfile,
  PostgresFinderRepository,
} from "@platform/business-finder";
import { generateSiteDocument, getBusinessTemplate, resolveLocale, selectBusinessTemplate, type SupportedLocale } from "@platform/website-engine";
import { PostgresSiteRepository } from "@platform/site-data";
import { platformConfig } from "../../../../lib/platform-config";
import { previewToken } from "../../../../lib/preview-token";
import { trialStarterContent } from "../../../../lib/trial-starter-content";
import { authorizeOwnerRequest } from "../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../lib/request-body";

function hasOnlyFinderPlaceholders(services: Array<{ title: string }>) {
  return services.map((service) => service.title.trim().toLowerCase()).join("|") === "consultation|tailored service|customer support";
}
export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "demos.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  try {
    const parsed = await readJsonBody<{
      leadId?: string;
      templateKey?: string;
      themeKey?: "auto" | "studio" | "clarity" | "forge" | "gold";
      locale?: SupportedLocale;
    }>(request, 8 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { leadId, templateKey, themeKey, locale: requestedLocale } = parsed.value;
    if (!leadId)
      return NextResponse.json(
        { error: "leadId is required." },
        { status: 400 },
      );
    const finder = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const lead = await finder.getLead(leadId);
    if (!lead)
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const existing = await finder.listPreparedProfiles(lead.id);
    const latest = existing.at(-1);
    const profile =
      latest?.profile ??
      createPreparedBusinessProfile(lead, existing.length + 1, resolveLocale(requestedLocale));
    if (!latest)
      await finder.createPreparedProfile({
        id: profile.id,
        leadId: lead.id,
        version: profile.version,
        profile,
        status: "ready_for_handoff",
        createdAt: profile.preparedAt,
      });
    const locale = resolveLocale(requestedLocale ?? profile.locale);
    const resolvedTemplate = getBusinessTemplate(templateKey) ?? selectBusinessTemplate(profile.business.category, profile.business.subcategory, profile.business.name, profile.business.description);
    const starter = trialStarterContent(profile.business.category ?? "", locale, resolvedTemplate.key);
    const demoProfile = {
      ...profile,
      locale,
      business: {
        ...profile.business,
        description: profile.business.description?.trim() || starter.description,
      },
      services: hasOnlyFinderPlaceholders(profile.services) ? starter.services : profile.services,
    };
    const site = generateSiteDocument(demoProfile, templateKey, themeKey);
    const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const savedSite = await sites.saveDemo({
      site,
      leadId: lead.id,
      preparedProfileId: profile.id,
      trialDurationDays: platformConfig.trialDays,
    });
    const tokenId = await sites.getOrCreatePreviewTokenId(savedSite.id);
    return NextResponse.json(
      {
        profileId: profile.id,
        siteId: savedSite.id,
        previewUrl: `/preview/${previewToken(tokenId)}`,
        siteSlug: savedSite.slug,
        templateKey: site.templateKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create demo.",
      },
      { status: 500 },
    );
  }
}
