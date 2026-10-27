import {
  resolveBusinessCategoryKeys,
  resolveLegacyBusinessCategory,
} from "@platform/website-engine";
import type { PlannerCategorySignal, PlannerCategorySource } from "./website-understanding";

/**
 * Canonical category authority ladder for creation flows (BSRC-DESIGN-P4-002).
 * The first level with a valid canonical key wins:
 *   1. owner/user-approved in this flow   → source "owner"
 *   2. AI suggestion from the analysis    → source "ai"
 *   3. existing canonical keys in profile → source "legacy"
 *   4. legacy free-text resolution        → source "legacy"
 *   5. the "other" family                 → source "legacy"
 * "legacy" therefore means "inherited or resolved without a fresh decision";
 * an explicit owner decision always outranks the AI detection.
 */
export function resolveCreationCategory(input: {
  ownerApproved?: { categoryKey?: unknown; subcategoryKey?: unknown } | null;
  aiSuggested?: { categoryKey?: unknown; subcategoryKey?: unknown; confidence?: unknown } | null;
  profileKeys?: { categoryKey?: unknown; subcategoryKey?: unknown } | null;
  legacyCategory?: string | null;
}): PlannerCategorySignal {
  const asKeys = (keys: { categoryKey?: unknown; subcategoryKey?: unknown }) => ({
    categoryKey: typeof keys.categoryKey === "string" ? keys.categoryKey : undefined,
    subcategoryKey: typeof keys.subcategoryKey === "string" ? keys.subcategoryKey : undefined,
  });
  const owner = input.ownerApproved ? resolveBusinessCategoryKeys(asKeys(input.ownerApproved)) : { categoryKey: undefined, subcategoryKey: undefined };
  if (owner.categoryKey) {
    return {
      categoryKey: owner.categoryKey,
      subcategoryKey: (owner.subcategoryKey ?? null) as string | null,
      confidence: null,
      source: "owner" satisfies PlannerCategorySource,
    };
  }
  const ai = input.aiSuggested ? resolveBusinessCategoryKeys(asKeys(input.aiSuggested)) : { categoryKey: undefined, subcategoryKey: undefined };
  if (ai.categoryKey) {
    const confidence = typeof input.aiSuggested?.confidence === "number" && Number.isFinite(input.aiSuggested.confidence)
      ? Math.min(1, Math.max(0, input.aiSuggested.confidence))
      : null;
    return {
      categoryKey: ai.categoryKey,
      subcategoryKey: (ai.subcategoryKey ?? null) as string | null,
      confidence,
      source: "ai" satisfies PlannerCategorySource,
    };
  }
  const profile = input.profileKeys ? resolveBusinessCategoryKeys(asKeys(input.profileKeys)) : { categoryKey: undefined, subcategoryKey: undefined };
  if (profile.categoryKey) {
    return {
      categoryKey: profile.categoryKey,
      subcategoryKey: (profile.subcategoryKey ?? null) as string | null,
      confidence: null,
      source: "legacy" satisfies PlannerCategorySource,
    };
  }
  const legacy = resolveLegacyBusinessCategory(input.legacyCategory ?? undefined);
  if (legacy.categoryKey && legacy.categoryKey !== "other") {
    return {
      categoryKey: legacy.categoryKey,
      subcategoryKey: (legacy.subcategoryKey ?? null) as string | null,
      confidence: null,
      source: "legacy" satisfies PlannerCategorySource,
    };
  }
  return { categoryKey: "other", subcategoryKey: null as string | null, confidence: null, source: "legacy" };
}

/**
 * Final stored-profile category fields for a creation flow (BSRC-DESIGN-P4-002).
 * A fresh review decision (categorySource "owner") REPLACES the creation
 * form's combobox keys wholesale — a family-only review change must never
 * leave a stale form subcategory beneath it — and carries the audit fields
 * only when a review decision exists. Without one, the form keys stand alone.
 */
export function creationCategoryProfileFields(input: {
  formKeys?: { categoryKey?: unknown; subcategoryKey?: unknown } | null;
  reviewSubmission?: {
    categoryKey?: string;
    subcategoryKey?: string;
    categorySource?: "owner";
    categoryConfidence?: number;
  } | null;
}): { categoryKey?: string; subcategoryKey?: string; categorySource?: string; categoryConfidence?: number } {
  const review = input.reviewSubmission?.categoryKey
    ? resolveBusinessCategoryKeys({
      categoryKey: input.reviewSubmission.categoryKey,
      subcategoryKey: input.reviewSubmission.subcategoryKey,
    })
    : { categoryKey: undefined, subcategoryKey: undefined };
  if (review.categoryKey) {
    return {
      categoryKey: review.categoryKey,
      ...(review.subcategoryKey ? { subcategoryKey: review.subcategoryKey } : {}),
      ...(input.reviewSubmission?.categorySource ? { categorySource: input.reviewSubmission.categorySource } : {}),
      ...(input.reviewSubmission?.categoryConfidence !== undefined
        ? { categoryConfidence: input.reviewSubmission.categoryConfidence }
        : {}),
    };
  }
  const form = resolveBusinessCategoryKeys(input.formKeys ?? {});
  return {
    ...(form.categoryKey ? { categoryKey: form.categoryKey } : {}),
    ...(form.subcategoryKey ? { subcategoryKey: form.subcategoryKey } : {}),
  };
}
