import type { AutomaticDesignInput, PreparedBusinessProfile } from "@platform/website-engine";

/**
 * Builds the P5-001 automatic design planner input from a creation profile
 * (homepage wizard without an import, owner complimentary without an
 * import). The category signal comes from the canonical registry keys when
 * present (P4-001), falling back to the "other" profile. The engine derives
 * CTA intent, imagery strategy and mood from the family profile.
 */
export function automaticDesignInputFromProfile(profile: PreparedBusinessProfile): AutomaticDesignInput {
  return {
    categoryKey: profile.business.categoryKey || "other",
    subcategoryKey: profile.business.subcategoryKey ?? null,
    businessName: profile.business.name,
    locale: profile.locale,
    services: profile.services.map((service) => service.title),
    generatedImageStrategy: profile.media?.heroImageUrl || profile.media?.serviceImageUrls?.length ? "rich" : "moderate",
  };
}
