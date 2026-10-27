import { NextResponse } from "next/server";
import { PostgresSiteRepository, businessTypes, normalizeVatIdSyntax } from "@platform/site-data";
import { customerPublicLegalIdentityComplete } from "@platform/website-engine";
import { getProductPlan, planIsPurchasable } from "@platform/product-catalog";
import {
  checkoutIdempotencyKey,
  stripeClient,
  stripeLaunchPromotionCode,
  stripePrice,
} from "../../../lib/stripe";
import {
  configuredBillingCurrency,
  plansForCurrency,
  platformConfig,
  type BillingCurrency,
} from "../../../lib/platform-config";
import { billingProviderEnabled } from "../../../lib/billing-providers";
import { enforceRateLimit, enforceSubjectRateLimit } from "../../../lib/rate-limit";
import { readJsonBody } from "../../../lib/request-body";
import { abusePolicy } from "../../../lib/abuse-policy";
import { requireSiteAdminSession, trustedSiteAdminSessionHash } from "../../../lib/site-admin-auth";
import { isSameOriginRequest } from "../../../lib/same-origin";
import { checkoutLegalContext, priceTaxPresentation } from "../../../lib/legal-config";
import { b2bContractVersions } from "../../../lib/b2b-policy";

const unavailable = () =>
  NextResponse.json(
    { errorCode: "checkout_unavailable" },
    { status: 403 },
  );

export async function POST(request: Request) {
  const policy = abusePolicy.checkout;
  const rateLimit = await enforceRateLimit(
    request,
    "subscription-checkout",
    policy.network.limit,
    policy.network.windowSeconds,
  );
  if (!rateLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );

  if (!isSameOriginRequest(request)) return unavailable();
  const adminSession = await requireSiteAdminSession();
  if (!adminSession) return unavailable();
  const sessionHash = trustedSiteAdminSessionHash(adminSession);

  const body = await readJsonBody<{
    demoSlug?: unknown;
    planKey?: unknown;
    termsAccepted?: unknown;
    legalBusinessName?: unknown;
    countryCode?: unknown;
    businessType?: unknown;
    vatId?: unknown;
    b2bAttested?: unknown;
    authorityAttested?: unknown;
    renewalAcknowledged?: unknown;
    privacyAcknowledged?: unknown;
    promotionAcknowledged?: unknown;
    billingProvider?: unknown;
    currency?: unknown;
  }>(request, 4 * 1024);
  if (!body.ok)
    return NextResponse.json(
      { errorCode: "invalid_request" },
      { status: body.status },
    );

  const input = body.value;
  const requestedPlan = getProductPlan(input.planKey);
  const requestedProvider = input.billingProvider === undefined ? "stripe" : input.billingProvider;
  const legalBusinessName = typeof input.legalBusinessName === "string" ? input.legalBusinessName.trim().slice(0, 160) : "";
  const countryCode = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
  const businessType = input.businessType;
  const normalizedVat = normalizeVatIdSyntax(input.vatId);
  const promotionCode = stripeLaunchPromotionCode();
  if (
    !requestedPlan ||
    !planIsPurchasable(requestedPlan.key, "stripe") ||
    !legalBusinessName ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    !businessTypes.includes(businessType as never) ||
    input.b2bAttested !== true ||
    input.authorityAttested !== true ||
    input.termsAccepted !== true ||
    input.renewalAcknowledged !== true ||
    input.privacyAcknowledged !== true ||
    (promotionCode && input.promotionAcknowledged !== true) ||
    requestedProvider !== "stripe"
  )
    return NextResponse.json(
      { errorCode: "invalid_request" },
      { status: 400 },
    );

  const sites = new PostgresSiteRepository({ boundary: "runtime" });
  const requestedSlug =
    typeof input.demoSlug === "string" ? input.demoSlug.trim() : undefined;
  const checkoutContext = await sites.getAuthenticatedCheckoutContext(
    sessionHash,
    adminSession.siteId,
    requestedSlug,
  );
  if (!checkoutContext) return unavailable();
  const { slug } = checkoutContext;

  // Publication boundary: checkout leads to billing activation and public
  // visibility, so the stored site must carry a complete customer legal
  // identity first. Otherwise the newly public site would silently 404.
  const storedSite = await new PostgresSiteRepository({ boundary: "site_admin", sessionHash }).getStoredBySlug(slug);
  if (!storedSite || !customerPublicLegalIdentityComplete(storedSite))
    return NextResponse.json(
      { errorCode: "legal_identity_incomplete" },
      { status: 422 },
    );

  if (!billingProviderEnabled("stripe"))
    return NextResponse.json(
      { errorCode: "provider_unavailable" },
      { status: 503 },
    );
  const access = checkoutContext.access;
  if (!access || (!access.canReactivate && access.reason !== "active_trial"))
    return NextResponse.json(
      { errorCode: "checkout_unavailable" },
      { status: 409 },
    );
  const billingIdentity = await sites.getSubscriptionBillingIdentity(adminSession.siteId, sessionHash);
  if (billingIdentity && !["canceled", "incomplete_expired"].includes(billingIdentity.status))
    return NextResponse.json(
      { errorCode: "checkout_unavailable" },
      { status: 409 },
    );

  const resourceLimit = await enforceSubjectRateLimit(
    "subscription_resource",
    `${adminSession.siteId}:${adminSession.accountId}`,
    policy.resource.limit,
    policy.resource.windowSeconds,
    sites,
  );
  if (!resourceLimit.allowed)
    return NextResponse.json(
      { errorCode: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(resourceLimit.retryAfterSeconds) },
      },
    );

  let origin: string;
  try {
    const publicUrl = process.env.PUBLIC_APP_URL?.trim();
    if (process.env.NODE_ENV === "production" && !publicUrl)
      throw new Error("PUBLIC_APP_URL is required in production.");
    origin = new URL(publicUrl || request.url).origin;
  } catch {
    return NextResponse.json({ errorCode: "checkout_unavailable" }, { status: 503 });
  }

  try {
    const currency: BillingCurrency = configuredBillingCurrency(
      typeof input.currency === "string" ? input.currency : undefined,
    );
    const legalContext = await checkoutLegalContext(adminSession.preferredLocale, currency, sessionHash);
    if (!legalContext.ok)
      return NextResponse.json(
        { errorCode: "legal_locale_unavailable" },
        { status: 503 },
      );
    const terms = legalContext.documents.find((document) => document.documentKey === "terms");
    const privacy = legalContext.documents.find((document) => document.documentKey === "privacy");
    if (!terms || !privacy)
      return NextResponse.json({ errorCode: "legal_locale_unavailable" }, { status: 503 });
    const price = stripePrice(requestedPlan.key, currency);
    const intake = await sites.createSubscriberIntake({
      email: adminSession.email,
      businessName: legalBusinessName,
      demoSiteId: adminSession.siteId,
      siteAdminAccountId: adminSession.accountId,
      planKey: requestedPlan.key,
      billingProvider: "stripe",
      checkoutPriceId: price,
      sessionHash,
      expectedSlug: slug,
      b2bEvidence: {
        legalBusinessName,
        countryCode,
        businessType: businessType as (typeof businessTypes)[number],
        vatIdNormalized: normalizedVat.normalized,
        vatSyntaxPlausible: normalizedVat.syntacticallyPlausible,
        locale: adminSession.preferredLocale,
        terms: { ...terms, documentKey: "terms" },
        privacy: { ...privacy, documentKey: "privacy" },
        b2bAttestationVersion: b2bContractVersions.b2bAttestation,
        authorityAttestationVersion: b2bContractVersions.authorityAttestation,
        automaticRenewalVersion: b2bContractVersions.automaticRenewal,
        privacyAcknowledgementVersion: b2bContractVersions.privacyAcknowledgement,
        promotionTermsVersion: promotionCode ? b2bContractVersions.launchPromotion : undefined,
        commercialConfigVersion: legalContext.config.version,
        currency,
        taxDisplayMode: legalContext.config.taxDisplayMode,
        priceTaxLabelSnapshot: priceTaxPresentation(legalContext.config),
        normalPriceDisplaySnapshot: plansForCurrency(currency).find((plan) => plan.key === requestedPlan.key)!.price,
        trialDurationDays: platformConfig.trialDays,
        billingInterval: "month",
      },
    });
    if (!intake.contractAcceptanceId || !intake.businessIdentityId)
      throw new Error("Checkout acceptance evidence was not persisted.");
    const stripe = stripeClient();
    const metadata = {
      intakeId: intake.id,
      siteId: adminSession.siteId,
      planKey: requestedPlan.key,
      priceId: price,
      currency,
      termsAccepted: "true",
      termsVersion: terms.version,
      privacyVersion: privacy.version,
      contractAcceptanceId: intake.contractAcceptanceId,
      businessIdentityId: intake.businessIdentityId,
      b2bAttestationVersion: b2bContractVersions.b2bAttestation,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        ...(billingIdentity?.billingProvider === "stripe" && billingIdentity.providerCustomerId
          ? { customer: billingIdentity.providerCustomerId, customer_update: { address: "auto" as const, name: "auto" as const } }
          : { customer_email: adminSession.email }),
        client_reference_id: intake.id,
        line_items: [{ price, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${origin}/subscribe/success?demo=${encodeURIComponent(slug)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/subscribe?demo=${encodeURIComponent(slug)}`,
        ...(promotionCode
          ? { discounts: [{ promotion_code: promotionCode }] }
          : {}),
      },
      {
        idempotencyKey: checkoutIdempotencyKey(
          intake.id,
          requestedPlan.key,
          currency,
          intake.checkoutAttempt,
        ),
      },
    );
    if (!session.url)
      throw new Error("Stripe did not return a checkout URL.");
    await sites.attachCheckoutSession(intake.id, session.id, sessionHash);
    return NextResponse.json(
      {
        intakeId: intake.id,
        status: intake.status,
        provider: "stripe",
        checkoutUrl: session.url,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ errorCode: "checkout_unavailable" }, { status: 503 });
  }
}
