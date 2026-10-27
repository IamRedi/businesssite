import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PreparedBusinessProfile } from "@platform/website-engine";
import { generateSiteDocument, professionalAboutCopy } from "@platform/website-engine";
import { PostgresSiteRepository, SiteAdminAccountConflictError } from "@platform/site-data";
import {
  passwordHash,
  SITE_ADMIN_SESSION_COOKIE,
  siteAdminSessionCookieOptions,
  siteAdminSessionTokenFromCookieHeader,
  tokenHash,
} from "../../../../lib/site-admin-auth";
import { enforceRateLimit, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { sendTrialWelcome } from "../../../../lib/email";
import { platformConfig } from "../../../../lib/platform-config";
import { previewToken } from "../../../../lib/preview-token";
import { resolveBusinessCategoryKeys, resolveLocale } from "@platform/website-engine";
import { trialStarterContent } from "../../../../lib/trial-starter-content";
import { applyExistingWebsiteToSite, validateExistingWebsiteSubmission } from "../../../../lib/apply-website-import";
import { creationCategoryProfileFields } from "../../../../lib/creation-category";
import { automaticDesignInputFromProfile } from "../../../../lib/automatic-design-input";
import { readJsonBody } from "../../../../lib/request-body";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { customerUiLocaleFromCookieHeader } from "../../../../lib/locale-model";

type TrialRequest = {
  businessName?: unknown;
  category?: unknown;
  categoryKey?: unknown;
  subcategoryKey?: unknown;
  description?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  city?: unknown;
  password?: unknown;
  locale?: unknown;
  website?: unknown;
  existingWebsite?: unknown;
  b2bAttested?: unknown;
  privacyAcknowledged?: unknown;
};

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  const policy = abusePolicy.publicTrial;
  const rateLimit = await enforceRateLimit(request, "public-trial", policy.network.limit, policy.network.windowSeconds);
  if (!rateLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  const body = await readJsonBody<TrialRequest>(request, 24 * 1024);
  if (!body.ok)
    return NextResponse.json({ errorCode: "invalid_request" }, { status: body.status });
  const input = body.value;
  if (text(input.website, 200))
    return NextResponse.json({ errorCode: "trial_unavailable" }, { status: 400 });

  const businessName = text(input.businessName, 120);
  const category = text(input.category, 120);
  // Canonical registry keys from the category combobox; unknown values are
  // dropped (fail-safe) and the free-text category remains the fallback.
  const canonicalCategoryKeys = resolveBusinessCategoryKeys({
    categoryKey: text(input.categoryKey, 60),
    subcategoryKey: text(input.subcategoryKey, 60),
  });
  const description = text(input.description, 1200);
  const email = text(input.email, 160).toLowerCase();
  const password =
    typeof input.password === "string" ? input.password.slice(0, 200) : "";
  const requestedLocale = text(input.locale, 8);
  const locale = platformConfig.website.supportedLocales.includes(requestedLocale as never)
    ? resolveLocale(requestedLocale)
    : "en";
  const preferredLocale = customerUiLocaleFromCookieHeader(request.headers.get("cookie"), platformConfig.brand.locale);
  if (
    !businessName ||
    !category ||
    !email.includes("@") ||
    password.length < 12 ||
    input.b2bAttested !== true ||
    input.privacyAcknowledged !== true
  )
    return NextResponse.json(
      {
        errorCode: "invalid_request",
      },
      { status: 400 },
    );

  const sites = new PostgresSiteRepository({ boundary: "runtime" });
  const emailLimit = await enforceSubjectRateLimit(
    "public_trial_email",
    email,
    policy.email.limit,
    policy.email.windowSeconds,
  );
  if (!emailLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      { status: 429, headers: { "retry-after": String(emailLimit.retryAfterSeconds) } },
    );

  const leadId = `self-${randomUUID()}`;
  const profileId = `prepared-${leadId}-v1`;
  const starter = trialStarterContent(category, locale);
  // Optional reviewed import from the customer's declared previous website;
  // same canonical application as the owner complimentary flow. A fresh
  // review decision (P4-002) replaces the form's category keys in the stored
  // profile and carries the categorySource/categoryConfidence audit fields.
  const existingWebsite = validateExistingWebsiteSubmission(input.existingWebsite);
  const profile: PreparedBusinessProfile = {
    id: profileId,
    version: 1,
    sourceLeadId: leadId,
    locale,
    preparedAt: new Date().toISOString(),
    approvedSources: [],
    business: {
      name: businessName,
      category,
      ...creationCategoryProfileFields({
        formKeys: canonicalCategoryKeys,
        reviewSubmission: existingWebsite,
      }),
      description: description || starter.description,
      phone: text(input.phone, 40) || undefined,
      email,
      address: text(input.address, 200) || undefined,
      city: text(input.city, 100) || undefined,
    },
    services: starter.services,
  };
  // The reviewed import's composition/theme decisions reach generation
  // (BSRC-DESIGN-FOUNDATION-001): templateKey may be a layout archetype name,
  // in which case starter content still resolves through the keyword matcher
  // while design.archetype pins the composition.
  const site = generateSiteDocument(
    profile,
    existingWebsite?.templateKey,
    (existingWebsite?.themeKey as Parameters<typeof generateSiteDocument>[2]) ?? undefined,
    existingWebsite?.design || existingWebsite?.sourceContentHash
      ? {
        ...(existingWebsite.design ? { design: existingWebsite.design } : {}),
        ...(existingWebsite.sourceContentHash ? { sourceContentHash: existingWebsite.sourceContentHash } : {}),
        // P4-003 choice authority + evidence: an explicit owner pick must
        // survive Create; the untouched AI recommendation is stored as evidence.
        ...(existingWebsite.designSource ? { designSource: existingWebsite.designSource } : {}),
        ...(existingWebsite.selectionReason ? { selectionReason: existingWebsite.selectionReason } : {}),
        ...(existingWebsite.archetypeConfidence !== undefined ? { archetypeConfidence: existingWebsite.archetypeConfidence } : {}),
      }
      // P5-001: from-scratch creation goes through the category-driven
      // automatic design planner (reviewed import plans always win).
      : { automatic: automaticDesignInputFromProfile(profile) },
  );
  if (!description) {
    site.content.aboutBody = professionalAboutCopy({
      name: businessName,
      services: site.services,
      locale,
      templateKey: site.templateKey,
    });
  }
  if (existingWebsite) applyExistingWebsiteToSite(site, existingWebsite);
  // Enforced RLS stores the trusted site actor as a PostgreSQL UUID. New
  // self-service tenants must therefore use the canonical identifier directly;
  // a display prefix would make the newly issued admin session unusable.
  site.id = randomUUID();
  try {
    const initialPasswordHash = await passwordHash(password);
    const sessionMaxAge = platformConfig.trialDays * 24 * 60 * 60;
    const sessionToken = randomBytes(32).toString("hex");
    const previousSessionToken = siteAdminSessionTokenFromCookieHeader(request.headers.get("cookie"));
    const trial = await sites.createSelfServiceTrial({
      site,
      profile,
      leadId,
      preparedProfileId: profileId,
      email,
      passwordHash: initialPasswordHash,
      trialDurationDays: platformConfig.trialDays,
      preferredLocale,
      sessionTokenHash: tokenHash(sessionToken),
      previousSessionTokenHash: previousSessionToken ? tokenHash(previousSessionToken) : undefined,
      sessionExpiresAt: new Date(Date.now() + sessionMaxAge * 1000).toISOString(),
    });
    if (!("previewTokenId" in trial) || !trial.previewTokenId)
      throw new Error("Trial preview issuance was rejected.");
    const emailDelivery = await sendTrialWelcome({
      to: email,
      businessName,
      slug: trial.site.slug,
      expiresAt: trial.expiresAt,
      locale: preferredLocale,
    });
    const response = NextResponse.json(
      {
        previewUrl: `/preview/${previewToken(trial.previewTokenId)}`,
        editorUrl: `/site-admin/${trial.site.slug}`,
        expiresAt: trial.expiresAt,
        emailDelivery: emailDelivery.status,
      },
      { status: 201 },
    );
    response.cookies.set(
      SITE_ADMIN_SESSION_COOKIE,
      sessionToken,
      siteAdminSessionCookieOptions(sessionMaxAge),
    );
    return response;
  } catch (error) {
    const conflict =
      error instanceof SiteAdminAccountConflictError ||
      (error as { code?: string })?.code === "SITE_ADMIN_ACCOUNT_CONFLICT";
    return NextResponse.json(
      { errorCode: conflict ? "trial_conflict" : "trial_unavailable" },
      { status: conflict ? 409 : 500 },
    );
  }
}
