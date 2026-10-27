import type { WebsiteBuildPlan } from "@platform/ai-assistant";
import { isLayoutArchetypeId, isSiteThemeId } from "@platform/website-engine";

/* Design-option selection for the review (BSRC-DESIGN-P4-003). Client-safe:
 * this module must never touch node builtins or the site-data boundary — it
 * is imported by the browser review component. */

export type WebsiteDesignOption = {
  /** 0 = the plan's recommended design; 1/2 = its alternatives. */
  index: number;
  kind: "recommended" | "alternative";
  /** The engine design input this option applies (archetype owns composition). */
  design: {
    archetype: string;
    heroVariant?: string;
    sectionOrder?: string[];
    sectionVariants?: { services?: string; projects?: string; about?: string; contact?: string };
    density?: string;
    themeId?: string;
    typographyDirection?: string;
    colorDirection?: string;
    imageStrategy?: string;
    ctaStrategy?: string;
  };
  /** Selection evidence shown on the card (why this composition fits). */
  reason: string;
};

/** The design options the review may offer: the plan's recommended design
 * plus its alternatives, each re-validated against the LIVE engine
 * registries. An alternative whose archetype is not a renderer id is dropped
 * entirely (an unsupported composition can never reach the review or the
 * document); unknown theme/variant values resolve to archetype defaults with
 * recorded fallbacks at generation time. Near-identical fillers were already
 * dropped by the plan validator. */
export function planDesignOptions(plan: WebsiteBuildPlan): WebsiteDesignOption[] {
  const options: WebsiteDesignOption[] = [];
  if (plan.design?.layoutArchetype && isLayoutArchetypeId(plan.design.layoutArchetype)) {
    options.push({
      index: 0,
      kind: "recommended",
      design: {
        ...plan.design,
        archetype: plan.design.layoutArchetype,
        themeId: isSiteThemeId((plan.design as { themeId?: string }).themeId) ? (plan.design as { themeId?: string }).themeId : undefined,
      },
      reason: plan.selectionReason ?? "",
    });
  }
  for (const alternative of plan.alternatives ?? []) {
    if (!isLayoutArchetypeId(alternative.archetype)) continue;
    if (options.length >= 3) break;
    options.push({
      index: options.length,
      kind: "alternative",
      design: {
        archetype: alternative.archetype,
        heroVariant: alternative.heroVariant || undefined,
        sectionOrder: alternative.sectionOrder.length ? alternative.sectionOrder : undefined,
        sectionVariants: Object.keys(alternative.sectionVariants).length ? alternative.sectionVariants : undefined,
        themeId: isSiteThemeId(alternative.themeId) ? alternative.themeId : undefined,
        typographyDirection: alternative.typographyDirection || undefined,
        imageStrategy: alternative.imageStrategy || undefined,
        ctaStrategy: alternative.ctaStrategy || undefined,
      },
      reason: alternative.reason,
    });
  }
  return options;
}

/** The engine design input for the user's chosen option. The AI
 * recommendation is the default (choice untouched); an explicit pick — even
 * of the recommendation itself — is an owner decision and travels as
 * designSource "owner". The design is the wire shape (layoutArchetype-keyed
 * for the plan's own design, archetype-keyed for alternatives); the
 * submission validator normalizes both for the engine. */
export function chosenDesignInput(
  plan: WebsiteBuildPlan,
  choice: { optionIndex?: number } | null | undefined,
): { design: Record<string, unknown> | undefined; designSource: "owner" | "ai"; selectionReason?: string } {
  const options = planDesignOptions(plan);
  if (!options.length) return { design: plan.design as Record<string, unknown> | undefined, designSource: "ai" };
  const picked = choice && typeof choice.optionIndex === "number"
    ? options.find((option) => option.index === choice.optionIndex)
    : undefined;
  if (!picked) {
    return { design: plan.design as Record<string, unknown> | undefined, designSource: "ai", selectionReason: plan.selectionReason };
  }
  return { design: picked.design as Record<string, unknown>, designSource: "owner", selectionReason: picked.reason || plan.selectionReason };
}
