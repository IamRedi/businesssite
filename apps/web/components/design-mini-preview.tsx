"use client";

import { useMemo } from "react";
import { generateSiteDocument, type PreparedBusinessProfile, type SupportedLocale } from "@platform/website-engine";
import type { ExistingWebsiteSubmission } from "../lib/apply-website-import";
import { applyExistingWebsiteToSite } from "../lib/apply-website-import";
import { SitePreview } from "./site-preview";

/**
 * One design-option card preview (BSRC-DESIGN-P4-003). NOT a screenshot: the
 * option's design input runs through the SAME engine path Create uses —
 * generateSiteDocument with that design, then the shared reviewed-content
 * application — and the result renders through SitePreview, the exact
 * renderer a created site is served with (ds/1 pipeline, premium archetypes,
 * frozen legacy path). The full render is scaled into a small fixed window,
 * so hero, typography, section rhythm, image treatment and theme are the
 * real ones the chosen design will produce.
 */
export function DesignMiniPreview({
  businessName,
  locale,
  submission,
  design,
}: {
  businessName: string;
  locale: SupportedLocale;
  /** The live reviewed submission (built by submissionFromSelections); the
   * preview applies it with the acknowledgement forced — Create itself still
   * refuses unacknowledged imports. */
  submission: Record<string, unknown>;
  design: Record<string, unknown>;
}) {
  const site = useMemo(() => {
    const profile: PreparedBusinessProfile = {
      id: "design-choice-preview",
      version: 1,
      sourceLeadId: "design-choice-preview",
      locale,
      preparedAt: new Date().toISOString(),
      approvedSources: [],
      business: { name: businessName.slice(0, 120) || "Preview", category: "" },
      services: [],
    };
    const document = generateSiteDocument(profile, submission.templateKey as string | undefined, (submission.themeKey ?? undefined) as never, {
      design,
      designSource: "ai",
    });
    applyExistingWebsiteToSite(document, { ...submission, importAcknowledged: true } as ExistingWebsiteSubmission);
    return document;
  }, [businessName, locale, submission, design]);
  return (
    <div className="design-mini-preview" aria-hidden="true">
      <div className="design-mini-preview-scale">
        <SitePreview site={site} />
      </div>
    </div>
  );
}
