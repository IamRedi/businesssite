import type {
  PreparedBusinessProfile,
  SiteDocument,
} from "@platform/website-engine";
import {
  customerPublicLegalIdentityComplete,
  customerPublicLegalIdentityMissingFields,
  resolveLocale,
  supportedLocales,
} from "@platform/website-engine";
import { randomUUID } from "node:crypto";
import {
  databaseRlsMode,
  getPostgresPool,
  getOwnerPostgresPool,
  getRuntimePostgresPool,
  getSystemPostgresPool,
  withAuthenticatedSiteAdminContext,
  type AuthenticatedSiteAdmin,
  type DatabaseContextClient,
  type Pool,
} from "@platform/database";
import {
  capabilityIsPubliclyActive,
  configuredLifecycleDurations,
  lifecycleSubscriptionStatuses,
  planHasEntitlement,
  planIsPurchasable,
  resolveSubscriptionAccess,
  trialHasEntitlement,
  type EntitlementCapability,
  type LifecycleDurations,
  type LifecycleSubscriptionStatus,
  type PlanKey,
  type SubscriptionAccessPolicy,
  type SubscriptionAccessSnapshot,
} from "@platform/product-catalog";
import type { BusinessType, CheckoutDocumentEvidence, TaxDisplayMode } from "./legal";
export * from "./articles";
export * from "./custom-design";
export * from "./site-admin-custom-content";
export * from "./appointments";
export * from "./booking";
import { appointmentFingerprintKeys, appointmentFingerprints, appointmentReceiptDigest, type AppointmentV1Input, type AppointmentV1Result } from "./appointments";
export * from "./owner-auth";
export * from "./owner-team";
export * from "./legal";
export * from "./privacy";
export * from "./privacy-export";
export * from "./provider-cleanup";
export * from "./monitoring";
export type DemoPersistenceInput = {
  site: SiteDocument;
  leadId: string;
  preparedProfileId: string;
  trialDurationDays: number;
};
export type SelfServiceTrialInput = DemoPersistenceInput & {
  profile: PreparedBusinessProfile;
  email: string;
  passwordHash: string;
  preferredLocale: "en" | "de";
  sessionTokenHash?: string;
  previousSessionTokenHash?: string;
  sessionExpiresAt?: string;
};
export interface SiteRepository {
  saveDemo(input: DemoPersistenceInput): Promise<SiteDocument>;
  getBySlug(slug: string): Promise<SiteDocument | null>;
}
export type SiteAdminAccount = {
  id: string;
  siteId: string;
  email: string;
  passwordHash: string;
  preferredLocale: "en" | "de";
};
export class SiteAdminAccountConflictError extends Error {
  readonly code = "SITE_ADMIN_ACCOUNT_CONFLICT";

  constructor() {
    super("An account cannot be created with these credentials.");
    this.name = "SiteAdminAccountConflictError";
  }
}
export class ComplimentaryLegalIdentityIncompleteError extends Error {
  readonly code = "COMPLIMENTARY_LEGAL_IDENTITY_INCOMPLETE";
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    super("A complimentary website cannot be published without a complete customer legal identity.");
    this.name = "ComplimentaryLegalIdentityIncompleteError";
    this.missingFields = missingFields;
  }
}
export type SiteAppointment = {
  id: string;
  siteId: string;
  customerName: string;
  phone: string;
  email?: string;
  serviceTitle?: string;
  preferredDate?: string;
  preferredTime?: string;
  note?: string;
  status: "requested" | "confirmed" | "declined" | "cancelled";
  createdAt: string;
};
export type SubscriberIntake = {
  id: string;
  email: string;
  businessName?: string;
  demoSiteId?: string;
  siteAdminAccountId?: string;
  checkoutPriceId?: string;
  planKey: "starter" | "professional" | "premium";
  billingProvider: BillingProvider;
  status: "pending_payment" | "paid" | "cancelled";
  checkoutAttempt: number;
  businessIdentityId?: string;
  contractAcceptanceId?: string;
  createdAt: string;
};
export type B2BCheckoutEvidenceInput = {
  legalBusinessName: string;
  countryCode: string;
  businessType: BusinessType;
  vatIdNormalized?: string;
  vatSyntaxPlausible: boolean;
  locale: "de" | "en" | "fr" | "es" | "it" | "sq";
  terms: CheckoutDocumentEvidence;
  privacy: CheckoutDocumentEvidence;
  b2bAttestationVersion: string;
  authorityAttestationVersion: string;
  automaticRenewalVersion: string;
  privacyAcknowledgementVersion: string;
  promotionTermsVersion?: string;
  commercialConfigVersion: number;
  currency: "EUR" | "USD" | "ALL";
  taxDisplayMode: TaxDisplayMode;
  priceTaxLabelSnapshot: string;
  normalPriceDisplaySnapshot: string;
  trialDurationDays: number;
  billingInterval: "month";
};
export type SiteAccess = {
  siteId: string;
  demoExpiresAt: string;
  activatedAt?: string;
  customDomain?: string;
  customDomainStatus: "not_requested" | "pending_dns" | "verified" | "failed";
  customDomainVerification?: unknown;
  customDomainCheckedAt?: string;
  publicationIntent: "private" | "public";
  subscription: SubscriptionAccessPolicy;
};
export type SubscriptionStatus = LifecycleSubscriptionStatus;
export type BillingProvider = "stripe" | "paddle";
export type OwnerCustomerRecord = {
  siteId: string;
  slug: string;
  businessName: string;
  visibility: "private" | "public";
  onboardingSource: "owner_outreach" | "self_service" | "owner_comp";
  email?: string;
  demoExpiresAt: string;
  activatedAt?: string;
  createdAt: string;
  customDomain?: string;
  customDomainStatus: SiteAccess["customDomainStatus"];
  planKey?: "starter" | "professional" | "premium";
  subscriptionStatus?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billingProvider?: BillingProvider;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  intakeStatus?: SubscriberIntake["status"];
  socialControlStatus?: SocialControlLink["status"];
  socialControlWorkspaceId?: string;
  socialAddonStatus?: SubscriptionStatus;
  socialAddonSubscriptionId?: string;
  accessState: SubscriptionAccessPolicy["state"];
  accessReason: string;
  accessEffectiveAt?: string;
  accessReadOnlyEndsAt?: string;
  complimentaryStatus?: "complimentary_active" | "revoked" | "converted";
  complimentaryGrantedAt?: string;
  complimentaryPlanKey?: "starter" | "professional" | "premium";
};
export type SocialControlLink = {
  siteId: string;
  provider: "redi_control";
  installationId?: string;
  tenantId?: string;
  workspaceId?: string;
  status: "disconnected" | "provisioning" | "active" | "degraded" | "suspended" | "error";
  lastSyncedAt?: string;
  lastErrorCode?: string;
};
export type SubscriptionEvent = {
  eventId: string;
  eventType: string;
  siteId?: string;
  intakeId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  checkoutSessionId?: string;
  planKey?: "starter" | "professional" | "premium";
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  providerEventCreatedAt?: string;
};
export type BillingSubscriptionEvent = {
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  siteId?: string;
  intakeId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerPriceId?: string;
  checkoutSessionId?: string;
  planKey?: "starter" | "professional" | "premium";
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  providerEventCreatedAt?: string;
};
export type AddonSubscriptionEvent = Omit<SubscriptionEvent, "intakeId" | "planKey"> & {
  addonKey: "social_media";
};
export type AiRun = {
  id: string;
  actorType: "owner" | "site_admin";
  actorId: string;
  operation: "website_blueprint" | "text_rewrite";
  leadId?: string;
  siteId?: string;
  provider: string;
  model: string;
  status: "pending" | "completed" | "failed" | "applied";
  input: Record<string, unknown>;
  output?: unknown;
  usage: Record<string, unknown>;
  providerResponseId?: string;
  error?: string;
  appliedSiteId?: string;
  createdAt: string;
};
export type TenantUsageWindow = "minute" | "hour" | "day" | "month";
export type TenantUsageState =
  | "normal"
  | "warning"
  | "throttled"
  | "temporarily_restricted";
export type TenantUsageResult = {
  allowed: boolean;
  state: TenantUsageState;
  retryAfterSeconds?: number;
  reasonCode?: string;
};
export type TenantUsageSnapshot = {
  state: TenantUsageState;
  reasonCode?: string;
  stateUntil?: string;
  overrideState?: TenantUsageState;
  overrideReason?: string;
  overrideUntil?: string;
  counters: Array<{
    metric: string;
    window: TenantUsageWindow;
    windowStart: string;
    quantity: number;
  }>;
  events: Array<{
    id: string;
    metric: string;
    decision: "warning" | "throttled" | "restricted" | "override";
    reasonCode: string;
    createdAt: string;
  }>;
};

export type ProviderUsageSnapshot = {
  generatedAt: string;
  today: { calls: number; estimatedCostUsdMicros: number; unknownPriceCalls: number };
  month: { calls: number; estimatedCostUsdMicros: number; unknownPriceCalls: number };
  providers: Array<{ provider: string; service: string; calls: number; estimatedCostUsdMicros: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number; unknownPriceCalls: number; pricingVersion: string }>;
  recent: Array<{ provider: string; service: string; estimatedCostUsdMicros: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number; unknownPrice: boolean; pricingVersion: string; createdAt: string }>;
};

const mapProviderUsageSnapshot = (value: Record<string, unknown>): ProviderUsageSnapshot => {
  const aggregate = (candidate: unknown) => {
    const item = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    return { calls: Number(item.calls ?? 0), estimatedCostUsdMicros: Number(item.estimatedCostUsdMicros ?? 0), unknownPriceCalls: Number(item.unknownPriceCalls ?? 0) };
  };
  const rows = (candidate: unknown) => Array.isArray(candidate) ? candidate.map((entry) => entry as Record<string, unknown>) : [];
  return {
    generatedAt: String(value.generatedAt ?? ""), today: aggregate(value.today), month: aggregate(value.month),
    providers: rows(value.providers).map((item) => ({ provider: String(item.provider ?? "unknown"), service: String(item.service ?? "unknown"), calls: Number(item.calls ?? 0), estimatedCostUsdMicros: Number(item.estimatedCostUsdMicros ?? 0), inputTokens: Number(item.inputTokens ?? 0), cachedInputTokens: Number(item.cachedInputTokens ?? 0), outputTokens: Number(item.outputTokens ?? 0), reasoningTokens: Number(item.reasoningTokens ?? 0), totalTokens: Number(item.totalTokens ?? 0), unknownPriceCalls: Number(item.unknownPriceCalls ?? 0), pricingVersion: String(item.pricingVersion ?? "unknown") })),
    recent: rows(value.recent).map((item) => ({ provider: String(item.provider ?? "unknown"), service: String(item.service ?? "unknown"), estimatedCostUsdMicros: Number(item.estimatedCostUsdMicros ?? 0), inputTokens: Number(item.inputTokens ?? 0), cachedInputTokens: Number(item.cachedInputTokens ?? 0), outputTokens: Number(item.outputTokens ?? 0), reasoningTokens: Number(item.reasoningTokens ?? 0), totalTokens: Number(item.totalTokens ?? 0), unknownPrice: item.unknownPrice === true, pricingVersion: String(item.pricingVersion ?? "unknown"), createdAt: String(item.createdAt ?? "") })),
  };
};

const mapOwnerUsageSnapshot = (value: Record<string, unknown>): TenantUsageSnapshot => ({
  state: String(value.state ?? "normal") as TenantUsageState,
  reasonCode: value.reasonCode ? String(value.reasonCode) : undefined,
  stateUntil: value.stateUntil ? String(value.stateUntil) : undefined,
  overrideState: value.overrideState ? String(value.overrideState) as TenantUsageState : undefined,
  overrideReason: value.overrideReason ? String(value.overrideReason) : undefined,
  overrideUntil: value.overrideUntil ? String(value.overrideUntil) : undefined,
  counters: Array.isArray(value.counters) ? value.counters.map((counter) => {
    const item = counter as Record<string, unknown>;
    return { metric: String(item.metric), window: String(item.window) as TenantUsageWindow, windowStart: String(item.windowStart), quantity: Number(item.quantity) };
  }) : [],
  events: Array.isArray(value.events) ? value.events.map((event) => {
    const item = event as Record<string, unknown>;
    return {
      id: String(item.id), metric: String(item.metric),
      decision: String(item.decision) as TenantUsageSnapshot["events"][number]["decision"],
      reasonCode: String(item.reasonCode), createdAt: String(item.createdAt),
    };
  }) : [],
});

export type SiteFeatureKey = EntitlementCapability | "booking" | "custom_domain";

export type CoreEditorSection = "identity" | "content" | "services" | "design" | "contact" | "media";

const lifecycleDurationsFromEnvironment = (): LifecycleDurations => configuredLifecycleDurations({
  paymentGraceDays: process.env.SUBSCRIPTION_PAYMENT_GRACE_DAYS,
  paidReadOnlyDays: process.env.SUBSCRIPTION_READ_ONLY_DAYS,
  trialRecoveryDays: process.env.TRIAL_RECOVERY_DAYS,
});

const validSubscriptionStatus = (value: unknown): value is SubscriptionStatus =>
  typeof value === "string" && lifecycleSubscriptionStatuses.includes(value as SubscriptionStatus);

const complimentaryStatuses = ["complimentary_active", "revoked", "converted"] as const;
export type ComplimentaryAccessStatus = (typeof complimentaryStatuses)[number];
const complimentaryStatusOf = (value: unknown): ComplimentaryAccessStatus | undefined =>
  complimentaryStatuses.includes(value as ComplimentaryAccessStatus) ? (value as ComplimentaryAccessStatus) : undefined;

const addDays = (value: Date, days: number) =>
  new Date(value.getTime() + days * 86_400_000);

export const subscriptionEntitlementsFor = (plan: PlanKey) => ({
  website: planHasEntitlement(plan, "website"),
  editor: planHasEntitlement(plan, "editor"),
  media: planHasEntitlement(plan, "media"),
  ai_rewrite: planHasEntitlement(plan, "ai_rewrite"),
  appointment_requests: planHasEntitlement(plan, "appointment_requests"),
  booking_calendar: planHasEntitlement(plan, "booking_calendar"),
  custom_domain_existing: planHasEntitlement(plan, "custom_domain_existing"),
  social_media: false,
  // Compatibility aliases only. `booking` never means a real calendar.
  booking: planHasEntitlement(plan, "appointment_requests"),
  custom_domain: planHasEntitlement(plan, "custom_domain_existing"),
});
export class MemorySiteRepository implements SiteRepository {
  private sites = new Map<string, SiteDocument>();
  async saveDemo({ site }: DemoPersistenceInput) {
    this.sites.set(site.slug, site);
    return site;
  }
  async getBySlug(slug: string) {
    return this.sites.get(slug) ?? null;
  }
}
export class PostgresSiteRepository implements SiteRepository {
  private pool: Pool;
  private runtimePool?: Pool;
  private systemPool?: Pool;
  private operationBoundary: "compatibility" | "owner" | "runtime" | "system" | "site_admin" = "compatibility";
  private operationSessionHash?: string;
  private operationIntegrationId?: string;
  private operationCorrelationId = "";
  constructor(urlOrBoundary?: string | {
    boundary: "owner" | "runtime" | "system" | "site_admin";
    sessionHash?: string;
    integrationId?: string;
    correlationId?: string;
  }) {
    if (typeof urlOrBoundary === "string") this.pool = getPostgresPool(urlOrBoundary);
    else if (!urlOrBoundary) {
      if (databaseRlsMode() !== "off")
        throw new Error("An explicit database actor boundary is required in pilot mode.");
      this.pool = getPostgresPool(process.env.DATABASE_URL);
    }
    else {
      this.operationBoundary = urlOrBoundary.boundary;
      this.operationSessionHash = urlOrBoundary.sessionHash;
      this.operationIntegrationId = urlOrBoundary.integrationId;
      this.operationCorrelationId = urlOrBoundary.correlationId ?? "";
      this.pool = urlOrBoundary.boundary === "owner"
        ? getOwnerPostgresPool()
        : urlOrBoundary.boundary === "system"
          ? getSystemPostgresPool()
          : getRuntimePostgresPool();
    }
  }
  private customerRuntimePool() {
    this.runtimePool ??= getRuntimePostgresPool();
    return this.runtimePool;
  }
  private providerSystemPool() {
    this.systemPool ??= getSystemPostgresPool();
    return this.systemPool;
  }
  private async pilotSiteQuery<T>(
    siteId: string,
    callback: (client: Pool | DatabaseContextClient) => Promise<T>,
  ) {
    if (databaseRlsMode() !== "off") {
      if (this.operationBoundary !== "site_admin" || !this.operationSessionHash)
        throw new Error("An authenticated site-admin session is required for scoped database access.");
      const result = await withAuthenticatedSiteAdminContext(
        this.customerRuntimePool(),
        this.operationSessionHash,
        (client) => callback(client),
        { expectedSiteId: siteId },
      );
      if (result === null) throw new Error("Authenticated site-admin database access was denied.");
      return result;
    }
    return callback(this.pool);
  }
  async withAuthenticatedSiteAdmin<T>(
    tokenHash: string,
    callback: (client: DatabaseContextClient, admin: AuthenticatedSiteAdmin) => Promise<T>,
    expectedSiteId?: string,
    requestId?: string,
  ) {
    return withAuthenticatedSiteAdminContext(
      databaseRlsMode() !== "off" ? this.customerRuntimePool() : this.pool,
      tokenHash,
      callback,
      { expectedSiteId, requestId },
    );
  }
  async authenticateSiteAdmin(tokenHash: string, expectedSlug?: string) {
    return this.withAuthenticatedSiteAdmin(tokenHash, async (client, admin) => {
      if (expectedSlug) {
        const slug = await client.query("select id from sites where slug=$1", [expectedSlug]);
        if (slug.rows[0]?.id !== admin.siteId) return null;
      }
      if (databaseRlsMode() !== "off") {
        const available = await client.query("select site_admin_site_available() as available");
        return available.rows[0]?.available ? admin : null;
      }
      return (await this.isSiteAvailable(admin.siteId)) ? admin : null;
    });
  }
  async getSiteAdminLoginSlug(tokenHash: string) {
    return this.withAuthenticatedSiteAdmin(tokenHash, async (client, admin) => {
      const available = Boolean((await client.query("select site_admin_site_available() as available")).rows[0]?.available);
      if (!available) return null;
      const site = await client.query("select slug from sites where id=$1", [admin.siteId]);
      return (site.rows[0]?.slug as string | undefined) ?? null;
    });
  }
  async getAuthenticatedCheckoutContext(tokenHash: string, expectedSiteId: string, expectedSlug?: string) {
    return this.withAuthenticatedSiteAdmin(tokenHash, async (client, admin) => {
      if (admin.siteId !== expectedSiteId) return null;
      const siteResult = await client.query(
        "select slug from sites where id=$1",
        [admin.siteId],
      );
      const row = siteResult.rows[0];
      if (!row || (expectedSlug !== undefined && row.slug !== expectedSlug)) return null;
      const access = await this.scopedSubscriptionAccess(client);
      return { slug: row.slug as string, access };
    }, expectedSiteId);
  }
  private async subscriptionAccessSnapshot(siteId: string): Promise<SubscriptionAccessSnapshot | null> {
    const result = await this.pool.query(
      `select s.activated_at,s.demo_expires_at,s.trial_recovery_ends_at,s.publication_intent,
              sub.status,sub.cancel_at_period_end,sub.current_period_end,sub.first_past_due_at,
              sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,
              comp.status as complimentary_status,comp.granted_at as complimentary_granted_at
       from sites s
       left join site_subscriptions sub on sub.site_id=s.id
       left join site_complimentary_access comp on comp.site_id=s.id
       where s.id=$1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      activatedAt: row.activated_at?.toISOString(),
      demoExpiresAt: row.demo_expires_at.toISOString(),
      trialRecoveryEndsAt: row.trial_recovery_ends_at.toISOString(),
      publicationIntent: row.publication_intent,
      subscriptionStatus: validSubscriptionStatus(row.status) ? row.status : undefined,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end?.toISOString(),
      firstPastDueAt: row.first_past_due_at?.toISOString(),
      paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString(),
      suspendedAt: row.suspended_at?.toISOString(),
      readOnlyEndsAt: row.read_only_ends_at?.toISOString(),
      lastActiveAt: row.last_active_at?.toISOString(),
      complimentaryStatus: complimentaryStatusOf(row.complimentary_status),
    };
  }
  private async scopedSubscriptionAccess(client: DatabaseContextClient) {
    const row = (await client.query("select * from site_admin_access_snapshot()")).rows[0];
    if (!row) return null;
    const snapshot: SubscriptionAccessSnapshot = {
      activatedAt: row.activated_at?.toISOString(),
      demoExpiresAt: row.demo_expires_at.toISOString(),
      trialRecoveryEndsAt: row.trial_recovery_ends_at.toISOString(),
      publicationIntent: row.publication_intent,
      subscriptionStatus: validSubscriptionStatus(row.subscription_status) ? row.subscription_status : undefined,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end?.toISOString(),
      firstPastDueAt: row.first_past_due_at?.toISOString(),
      paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString(),
      suspendedAt: row.suspended_at?.toISOString(),
      readOnlyEndsAt: row.read_only_ends_at?.toISOString(),
      lastActiveAt: row.last_active_at?.toISOString(),
      complimentaryStatus: complimentaryStatusOf(row.complimentary_status),
    };
    return resolveSubscriptionAccess(snapshot);
  }
  async getSubscriptionAccess(siteId: string, now = new Date()) {
    const snapshot = await this.subscriptionAccessSnapshot(siteId);
    return snapshot ? resolveSubscriptionAccess(snapshot, now) : null;
  }
  async listSubscriptionLifecycleEvents(siteId: string) {
    const result = await this.pool.query(
      "select action,provider_event_id,from_status,to_status,details,occurred_at from subscription_lifecycle_events where site_id=$1 order by occurred_at,created_at",
      [siteId],
    );
    return result.rows.map((row) => ({
      action: row.action as string,
      providerEventId: row.provider_event_id as string | undefined,
      fromStatus: row.from_status as string | undefined,
      toStatus: row.to_status as string | undefined,
      details: row.details as Record<string, unknown>,
      occurredAt: row.occurred_at.toISOString() as string,
    }));
  }
  async listOwnerCustomers(sessionHash?: string): Promise<OwnerCustomerRecord[]> {
    if (!sessionHash && databaseRlsMode() !== "off") return [];
    const result = sessionHash
      ? await getOwnerPostgresPool().query("select * from owner_customer_list($1,200,0)", [sessionHash])
      : await this.pool.query(`select s.id as site_id,s.slug,coalesce(s.generated_document#>>'{content,name}',s.slug) as business_name,
          s.visibility,s.onboarding_source,coalesce(admin.email,s.trial_email,intake.email) as email,s.demo_expires_at,s.activated_at,s.created_at,
          s.custom_domain,s.custom_domain_status,coalesce(sub.plan_key,intake.plan_key) as plan_key,sub.status as subscription_status,
          sub.current_period_end,coalesce(sub.cancel_at_period_end,false) cancel_at_period_end,sub.billing_provider,sub.provider_customer_id,
          sub.provider_subscription_id,intake.status intake_status,social.status social_control_status,social.external_workspace_id social_control_workspace_id,
          social_addon.status social_addon_status,social_addon.stripe_subscription_id social_addon_subscription_id,
          sub.first_past_due_at,sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,s.publication_intent,s.trial_recovery_ends_at,
          comp.status as complimentary_status,comp.granted_at as complimentary_granted_at,comp.plan_key as complimentary_plan_key
        from sites s left join lateral(select email from site_admin_accounts where site_id=s.id order by created_at limit 1) admin on true
        left join site_subscriptions sub on sub.site_id=s.id left join lateral(select status,email,plan_key from subscriber_intakes where demo_site_id=s.id order by created_at desc limit 1) intake on true
        left join site_external_integrations social on social.site_id=s.id and social.provider='redi_control'
        left join site_addon_subscriptions social_addon on social_addon.site_id=s.id and social_addon.addon_key='social_media'
        left join site_complimentary_access comp on comp.site_id=s.id
        order by coalesce(sub.updated_at,s.created_at) desc`);
    return result.rows.map((row) => {
      const access = resolveSubscriptionAccess({
        activatedAt: row.activated_at?.toISOString(),
        demoExpiresAt: row.demo_expires_at.toISOString(),
        trialRecoveryEndsAt: row.trial_recovery_ends_at.toISOString(),
        publicationIntent: row.publication_intent,
        subscriptionStatus: validSubscriptionStatus(row.subscription_status) ? row.subscription_status : undefined,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        currentPeriodEnd: row.current_period_end?.toISOString(),
        firstPastDueAt: row.first_past_due_at?.toISOString(),
        paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString(),
        suspendedAt: row.suspended_at?.toISOString(),
        readOnlyEndsAt: row.read_only_ends_at?.toISOString(),
        lastActiveAt: row.last_active_at?.toISOString(),
        complimentaryStatus: complimentaryStatusOf(row.complimentary_status),
      });
      return {
        siteId: row.site_id,
        slug: row.slug,
        businessName: row.business_name || row.slug,
        visibility: row.visibility,
        onboardingSource: row.onboarding_source,
        email: row.email ?? undefined,
        demoExpiresAt: row.demo_expires_at.toISOString(),
        activatedAt: row.activated_at?.toISOString(),
        createdAt: row.created_at.toISOString(),
        customDomain: row.custom_domain ?? undefined,
        customDomainStatus: row.custom_domain_status,
        planKey: row.plan_key ?? undefined,
        subscriptionStatus: row.subscription_status ?? undefined,
        currentPeriodEnd: row.current_period_end?.toISOString(),
        cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
        billingProvider: row.billing_provider ?? undefined,
        providerCustomerId: row.provider_customer_id ?? undefined,
        providerSubscriptionId: row.provider_subscription_id ?? undefined,
        intakeStatus: row.intake_status ?? undefined,
        socialControlStatus: row.social_control_status ?? undefined,
        socialControlWorkspaceId: row.social_control_workspace_id ?? undefined,
        socialAddonStatus: row.social_addon_status ?? undefined,
        socialAddonSubscriptionId: row.social_addon_subscription_id ?? undefined,
        accessState: access.state,
        accessReason: access.reason,
        accessEffectiveAt: access.effectiveAt,
        accessReadOnlyEndsAt: access.readOnlyEndsAt,
        complimentaryStatus: complimentaryStatusOf(row.complimentary_status),
        complimentaryGrantedAt: row.complimentary_granted_at?.toISOString(),
        complimentaryPlanKey: row.complimentary_plan_key ?? undefined,
      };
    });
  }
  async saveDemo({ site, leadId, preparedProfileId, trialDurationDays }: DemoPersistenceInput) {
    const { trialRecoveryDays } = lifecycleDurationsFromEnvironment();
    if (this.operationBoundary === "owner") {
      if (!this.operationSessionHash) throw new Error("Owner demo authorization is required.");
      const result = await this.pool.query(
        "select owner_demo_create($1,$2,$3::jsonb,$4,$5,$6) value",
        [this.operationSessionHash, preparedProfileId, JSON.stringify(site), trialDurationDays, trialRecoveryDays, this.operationCorrelationId],
      );
      const value = result.rows[0]?.value as { site?: SiteDocument } | null | undefined;
      if (!value?.site) throw new Error("Owner demo creation was rejected.");
      return value.site;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const slugOwner = await client.query(
        "select id from sites where slug=$1",
        [site.slug],
      );
      const resolvedSite =
        slugOwner.rows[0] && slugOwner.rows[0].id !== site.id
          ? { ...site, slug: `${site.slug}-${site.id.slice(-8)}` }
          : site;
      await client.query(
        "insert into sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,demo_expires_at,trial_recovery_ends_at) values($1,$2,$3,'public',$4,$5,$6,now() + ($7 * interval '1 day'),now() + (($7 + $8) * interval '1 day')) on conflict(id) do update set slug=excluded.slug,generated_document=excluded.generated_document,visibility=case when sites.activated_at is null then excluded.visibility else sites.visibility end,lead_id=excluded.lead_id,prepared_profile_id=excluded.prepared_profile_id,demo_expires_at=case when sites.activated_at is null then excluded.demo_expires_at else sites.demo_expires_at end,trial_recovery_ends_at=case when sites.activated_at is null then excluded.trial_recovery_ends_at else sites.trial_recovery_ends_at end",
        [
          resolvedSite.id,
          resolvedSite.slug,
          resolvedSite.visibility,
          JSON.stringify(resolvedSite),
          leadId,
          preparedProfileId,
          trialDurationDays,
          trialRecoveryDays,
        ],
      );
      await client.query(
        "insert into demo_sites(site_id,prepared_profile_id) values($1,$2) on conflict(site_id) do update set prepared_profile_id=excluded.prepared_profile_id",
        [site.id, preparedProfileId],
      );
      await client.query("commit");
      return resolvedSite;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async createSelfServiceTrial(input: SelfServiceTrialInput) {
    const { trialRecoveryDays } = lifecycleDurationsFromEnvironment();
    if (this.operationBoundary === "runtime") {
      if (!input.sessionTokenHash || !input.sessionExpiresAt) throw new Error("Trial session material is required.");
      try {
        const result = await this.pool.query(
          "select public_trial_create($1::jsonb,$2,$3,$4,$5,$6,$7) value",
          [JSON.stringify({ email: input.email, preferredLocale: input.preferredLocale, profile: input.profile, site: input.site }), input.passwordHash,
            input.sessionTokenHash, input.previousSessionTokenHash ?? null, input.sessionExpiresAt, input.trialDurationDays, trialRecoveryDays],
        );
        const value = result.rows[0]?.value as { site: SiteDocument; accountId: string; expiresAt: string; previewTokenId: string } | null | undefined;
        if (!value) throw new Error("Trial creation was rejected.");
        return value;
      } catch (error) {
        if ((error as { message?: string }).message?.includes("trial_conflict")) throw new SiteAdminAccountConflictError();
        throw error;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingAccount = await client.query(
        "select 1 from site_admin_accounts where lower(btrim(email))=$1",
        [normalizedEmail],
      );
      if (existingAccount.rows[0])
        throw new SiteAdminAccountConflictError();
      const slugOwner = await client.query(
        "select id from sites where slug=$1",
        [input.site.slug],
      );
      const site = slugOwner.rows[0]
        ? {
            ...input.site,
            slug: `${input.site.slug}-${input.site.id.slice(-8)}`,
          }
        : input.site;
      await client.query(
        "insert into leads(id,name,source,payload,category,address,phone,score,score_reasons,signals) values($1,$2,'self-service',$3,$4,$5,$6,100,'[\"self-service website trial\"]'::jsonb,$7)",
        [
          input.leadId,
          input.profile.business.name,
          JSON.stringify(input.profile.business),
          input.profile.business.category ?? null,
          input.profile.business.address ?? null,
          input.profile.business.phone ?? null,
          JSON.stringify({
            hasWebsite: false,
            hasEmail: true,
            hasPhone: Boolean(input.profile.business.phone),
            isActive: true,
          }),
        ],
      );
      await client.query(
        "insert into prepared_business_profiles(id,lead_id,version,profile,status) values($1,$2,$3,$4,'ready_for_handoff')",
        [
          input.preparedProfileId,
          input.leadId,
          input.profile.version,
          JSON.stringify(input.profile),
        ],
      );
      const insertedSite = await client.query(
        "insert into sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,demo_expires_at,trial_recovery_ends_at,onboarding_source,trial_email) values($1,$2,'private','public',$3,$4,$5,now() + ($7 * interval '1 day'),now() + (($7 + $8) * interval '1 day'),'self_service',$6) returning demo_expires_at",
        [
          site.id,
          site.slug,
          JSON.stringify(site),
          input.leadId,
          input.preparedProfileId,
          normalizedEmail,
          input.trialDurationDays,
          trialRecoveryDays,
        ],
      );
      await client.query(
        "insert into demo_sites(site_id,prepared_profile_id) values($1,$2)",
        [site.id, input.preparedProfileId],
      );
      const accountId = randomUUID();
      await client.query(
        "insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values($1,$2,$3,$4,$5)",
        [accountId, site.id, normalizedEmail, input.passwordHash, input.preferredLocale],
      );
      await client.query(
        "insert into audit_events(id,entity_type,entity_id,action,details) values($1,'demo',$2,'self_service_trial_created',$3)",
        [
          randomUUID(),
          site.id,
          JSON.stringify({ email: normalizedEmail }),
        ],
      );
      await client.query("commit");
      return {
        site,
        accountId,
        expiresAt: insertedSite.rows[0].demo_expires_at.toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      const databaseError = error as { code?: string; constraint?: string };
      if (
        databaseError.code === "23505" &&
        databaseError.constraint?.includes("site_admin_accounts")
      )
        throw new SiteAdminAccountConflictError();
      throw error;
    } finally {
      client.release();
    }
  }
  async getBySlug(slug: string) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select generated_document from site_admin_site_projection($1,$2)", [this.operationSessionHash, slug]);
      return result.rows[0]?.generated_document ?? null;
    }
    const result = await this.pool.query(
      "select generated_document from sites where slug=$1 and (activated_at is not null or demo_expires_at > now())",
      [slug],
    );
    return result.rows[0]?.generated_document ?? null;
  }
  async getStoredBySlug(slug: string) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select generated_document from site_admin_site_projection($1,$2)", [this.operationSessionHash, slug]);
      return result.rows[0]?.generated_document ?? null;
    }
    const result = await this.pool.query(
      "select generated_document from sites where slug=$1",
      [slug],
    );
    return result.rows[0]?.generated_document ?? null;
  }
  async getPublicBySlug(slug: string) {
    const result = databaseRlsMode() !== "off"
      ? await this.customerRuntimePool().query("select * from resolve_public_site_by_slug($1)", [slug])
      : await this.pool.query(
          "select id as site_id,generated_document from sites where slug=$1 and visibility='public' and activated_at is not null",
          [slug],
        );
    const row = result.rows[0];
    if (!row || (databaseRlsMode() === "off" && !(await this.hasCapabilityAccess(row.site_id, "website")))) return null;
    const site = row.generated_document as SiteDocument | undefined;
    const requiresCustomerLegalIdentity = process.env.NODE_ENV === "production" || process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED === "true";
    if (site && requiresCustomerLegalIdentity && !customerPublicLegalIdentityComplete(site)) return null;
    return site ? { ...site, visibility: "public" as const } : null;
  }
  async getOrCreatePreviewTokenId(siteId: string) {
    if (this.operationBoundary === "owner") {
      if (!this.operationSessionHash) throw new Error("Owner preview authorization is required.");
      const identity = await this.pool.query("select owner_demo_site_identity($1,$2) value", [this.operationSessionHash, siteId]);
      const slug = identity.rows[0]?.value?.slug as string | undefined;
      if (!slug) throw new Error("Website not found.");
      const result = await this.pool.query("select owner_preview_issue($1,$2,false,$3) value", [this.operationSessionHash, slug, this.operationCorrelationId]);
      if (!result.rows[0]?.value?.previewTokenId) throw new Error("Preview issuance was rejected.");
      return result.rows[0].value.previewTokenId as string;
    }
    if (this.operationBoundary === "site_admin") {
      if (!this.operationSessionHash) throw new Error("Site-admin preview authorization is required.");
      const result = await this.pool.query("select site_admin_preview_issue($1,false) token_id", [this.operationSessionHash]);
      if (!result.rows[0]?.token_id) throw new Error("Preview issuance was rejected.");
      return result.rows[0].token_id as string;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const active = await client.query(
        "select token_id from site_preview_tokens where site_id=$1 and revoked_at is null and expires_at > now() for update",
        [siteId],
      );
      if (active.rows[0]) {
        await client.query("commit");
        return active.rows[0].token_id as string;
      }
      await client.query(
        "update site_preview_tokens set revoked_at=now() where site_id=$1 and revoked_at is null",
        [siteId],
      );
      const created = await client.query(
        "insert into site_preview_tokens(token_id,site_id,expires_at) select $2,id,demo_expires_at from sites where id=$1 returning token_id",
        [siteId, randomUUID()],
      );
      if (!created.rows[0]) throw new Error("Website not found.");
      await client.query("commit");
      return created.rows[0].token_id as string;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async regeneratePreviewTokenId(siteId: string) {
    if (this.operationBoundary === "owner") {
      if (!this.operationSessionHash) throw new Error("Owner preview authorization is required.");
      const identity = await this.pool.query("select owner_demo_site_identity($1,$2) value", [this.operationSessionHash, siteId]);
      const slug = identity.rows[0]?.value?.slug as string | undefined;
      if (!slug) throw new Error("Website not found.");
      const result = await this.pool.query("select owner_preview_issue($1,$2,true,$3) value", [this.operationSessionHash, slug, this.operationCorrelationId]);
      if (!result.rows[0]?.value?.previewTokenId) throw new Error("Preview regeneration was rejected.");
      return result.rows[0].value.previewTokenId as string;
    }
    if (this.operationBoundary === "site_admin") {
      if (!this.operationSessionHash) throw new Error("Site-admin preview authorization is required.");
      const result = await this.pool.query("select site_admin_preview_issue($1,true) token_id", [this.operationSessionHash]);
      if (!result.rows[0]?.token_id) throw new Error("Preview regeneration was rejected.");
      return result.rows[0].token_id as string;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "update site_preview_tokens set revoked_at=now() where site_id=$1 and revoked_at is null",
        [siteId],
      );
      const created = await client.query(
        "insert into site_preview_tokens(token_id,site_id,expires_at) select $2,id,demo_expires_at from sites where id=$1 returning token_id",
        [siteId, randomUUID()],
      );
      if (!created.rows[0]) throw new Error("Website not found.");
      await client.query("commit");
      return created.rows[0].token_id as string;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async getByPreviewTokenId(tokenId: string) {
    const result = databaseRlsMode() !== "off"
      ? await this.customerRuntimePool().query("select * from resolve_private_preview($1)", [tokenId])
      : await this.pool.query(
          "select s.generated_document from site_preview_tokens p join sites s on s.id=p.site_id where p.token_id=$1 and p.revoked_at is null and p.expires_at > now() and (s.activated_at is not null or s.demo_expires_at > now())",
          [tokenId],
        );
    return (result.rows[0]?.generated_document as SiteDocument | undefined) ?? null;
  }
  async getSiteIdBySlug(slug: string) {
    if (this.operationBoundary === "owner") {
      const result = await this.pool.query("select owner_demo_site_identity_by_slug($1,$2) value", [this.operationSessionHash, slug]);
      return result.rows[0]?.value?.id as string | undefined;
    }
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select site_id from site_admin_site_projection($1,$2)", [this.operationSessionHash, slug]);
      return result.rows[0]?.site_id as string | undefined;
    }
    const result = await this.pool.query("select id from sites where slug=$1", [
      slug,
    ]);
    return result.rows[0]?.id as string | undefined;
  }
  async getSlugBySiteId(siteId: string) {
    if (this.operationBoundary === "owner") {
      const result = await this.pool.query("select owner_demo_site_identity($1,$2) value", [this.operationSessionHash, siteId]);
      return result.rows[0]?.value?.slug as string | undefined;
    }
    const result = await this.pool.query("select slug from sites where id=$1", [
      siteId,
    ]);
    return result.rows[0]?.slug as string | undefined;
  }
  async getSiteByLeadId(leadId: string) {
    if (this.operationBoundary === "owner") {
      const result = await this.pool.query("select owner_demo_site_by_lead($1,$2) value", [this.operationSessionHash, leadId]);
      return (result.rows[0]?.value as { id: string; slug: string } | null | undefined) ?? null;
    }
    const result = await this.pool.query(
      "select id,slug from sites where lead_id=$1 order by created_at desc limit 1",
      [leadId],
    );
    return result.rows[0]
      ? { id: result.rows[0].id as string, slug: result.rows[0].slug as string }
      : null;
  }
  async prepareOwnerDemoInvitation(slug: string, resetTokenHash: string, resetExpiresAt: string) {
    if (this.operationBoundary !== "owner" || !this.operationSessionHash)
      throw new Error("Owner website authorization is required.");
    const result = await this.pool.query(
      "select owner_demo_invitation_prepare($1,$2,$3,$4,$5) value",
      [this.operationSessionHash, slug, resetTokenHash, resetExpiresAt, this.operationCorrelationId],
    );
    const value = result.rows[0]?.value as {
      siteId: string; slug: string; document: SiteDocument; demoExpiresAt: string;
      accountId: string; email: string; preferredLocale: "en" | "de"; previewTokenId: string;
    } | null | undefined;
    if (!value) throw new Error("Demo invitation preparation was rejected.");
    return value;
  }
  async createComplimentaryCustomer(input: {
    site: SiteDocument;
    slug: string;
    businessName: string;
    email: string;
    /** Site-admin UI locale (en/de). The website content locale lives on the document. */
    adminLocale: "en" | "de";
    planKey: PlanKey;
    reason?: string;
    setupTokenHash: string;
    setupExpiresAt: string;
    correlationId?: string;
  }) {
    if (this.operationBoundary !== "owner" || !this.operationSessionHash)
      throw new Error("Owner website authorization is required.");
    // A complimentary site is provisioned directly public and activated, so it
    // must clear the same canonical publication validator as every other site:
    // an incomplete legal identity would otherwise be a silent public 404.
    if (!supportedLocales.includes(resolveLocale(input.site.locale)))
      throw new ComplimentaryLegalIdentityIncompleteError(["locale"]);
    const missingLegalFields = customerPublicLegalIdentityMissingFields(input.site);
    if (missingLegalFields.length)
      throw new ComplimentaryLegalIdentityIncompleteError(missingLegalFields);
    // The account starts without a usable password; the single-use setup
    // token the owner received is the only way to establish the first login.
    const features = Object.entries(subscriptionEntitlementsFor(input.planKey))
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    const result = await this.pool.query(
      "select owner_comp_create_customer($1,$2::jsonb,$3,$4,$5) value",
      [
        this.operationSessionHash,
        JSON.stringify({
          id: input.site.id,
          slug: input.slug,
          email: input.email,
          businessName: input.businessName,
          locale: input.adminLocale,
          planKey: input.planKey,
          reason: input.reason ?? "",
          features,
          document: input.site,
        }),
        input.setupTokenHash,
        input.setupExpiresAt,
        input.correlationId ?? this.operationCorrelationId,
      ],
    );
    const value = result.rows[0]?.value as {
      siteId: string; slug: string; accountId: string; email: string; planKey: PlanKey;
    } | null | undefined;
    if (!value) throw new Error("Complimentary customer creation was rejected.");
    return value;
  }
  async revokeComplimentaryAccess(slug: string, reason: string) {
    if (this.operationBoundary !== "owner" || !this.operationSessionHash)
      throw new Error("Owner website authorization is required.");
    const result = await this.pool.query(
      "select owner_comp_revoke($1,$2,$3,$4) ok",
      [this.operationSessionHash, slug, reason, this.operationCorrelationId],
    );
    return Boolean(result.rows[0]?.ok);
  }
  async listComplimentaryAccess() {
    if (this.operationBoundary !== "owner" || !this.operationSessionHash)
      throw new Error("Owner website authorization is required.");
    const result = await this.pool.query(
      "select * from owner_comp_list($1)",
      [this.operationSessionHash],
    );
    return result.rows.map((row) => ({
      siteId: row.site_id as string,
      slug: row.slug as string,
      businessName: (row.business_name as string) || row.slug,
      email: (row.email as string) ?? undefined,
      status: complimentaryStatusOf(row.status) ?? ("complimentary_active" as const),
      planKey: row.plan_key as PlanKey,
      reason: (row.reason as string) ?? "",
      grantedAt: row.granted_at.toISOString(),
      revokedAt: row.revoked_at?.toISOString(),
      convertedToPaidAt: row.converted_to_paid_at?.toISOString(),
    }));
  }
  async getSiteAccess(siteId: string) {
    const result = await this.pool.query(
      "select id,demo_expires_at,activated_at,custom_domain,custom_domain_status,custom_domain_verification,custom_domain_checked_at,publication_intent from sites where id=$1",
      [siteId],
    );
    const row = result.rows[0];
    const subscription = row ? await this.getSubscriptionAccess(siteId) : null;
    return row
      ? ({
          siteId: row.id,
          demoExpiresAt: row.demo_expires_at.toISOString(),
          activatedAt: row.activated_at?.toISOString(),
          customDomain: row.custom_domain ?? undefined,
          customDomainStatus: row.custom_domain_status,
          customDomainVerification: row.custom_domain_verification,
          customDomainCheckedAt: row.custom_domain_checked_at?.toISOString(),
          publicationIntent: row.publication_intent,
          subscription: subscription!,
        } as SiteAccess)
      : null;
  }
  async getBusinessAdminDashboard(sessionHash: string, slug: string) {
    return this.withAuthenticatedSiteAdmin(sessionHash, async (client, admin) => {
      const result = await client.query(
        `select id,generated_document,demo_expires_at,activated_at,custom_domain,
                custom_domain_status,custom_domain_verification,custom_domain_checked_at,publication_intent
         from sites where slug=$1 and site_kind='business'`,
        [slug],
      );
      const row = result.rows[0];
      if (!row || row.id !== admin.siteId) return null;
      const subscription = await this.scopedSubscriptionAccess(client);
      if (!subscription) return null;
      const appointmentResult = await client.query(
        "select id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,coalesce(customer_message,note) as note,status,created_at from site_appointments order by created_at desc",
      );
      return {
        siteId: admin.siteId,
        site: row.generated_document as SiteDocument,
        access: {
          siteId: admin.siteId,
          demoExpiresAt: row.demo_expires_at.toISOString(),
          activatedAt: row.activated_at?.toISOString(),
          customDomain: row.custom_domain ?? undefined,
          customDomainStatus: row.custom_domain_status,
          customDomainVerification: row.custom_domain_verification ?? undefined,
          customDomainCheckedAt: row.custom_domain_checked_at?.toISOString(),
          publicationIntent: row.publication_intent,
          subscription,
        } as SiteAccess,
        appointments: appointmentResult.rows.map((appointment) => ({
          id: appointment.id,
          siteId: appointment.site_id,
          customerName: appointment.customer_name,
          phone: appointment.phone,
          email: appointment.email ?? undefined,
          serviceTitle: appointment.service_title ?? undefined,
          preferredDate: appointment.preferred_date?.toISOString?.().slice(0, 10) ?? undefined,
          preferredTime: appointment.preferred_time ?? undefined,
          note: appointment.note ?? undefined,
          status: appointment.status,
          createdAt: appointment.created_at.toISOString(),
        } as SiteAppointment)),
      };
    });
  }
  async isSiteActivated(siteId: string) {
    const result = await this.pool.query(
      "select 1 from sites where id=$1 and activated_at is not null",
      [siteId],
    );
    return Boolean(result.rows[0]);
  }
  async isSiteAvailable(siteId: string) {
    const kind = await this.pool.query("select site_kind from sites where id=$1", [siteId]);
    if (kind.rows[0]?.site_kind === "information") return true;
    const access = await this.getSubscriptionAccess(siteId);
    return Boolean(access && (access.canReadCustomerContent || access.canOpenBillingRecovery));
  }
  async prepareCustomDomainChange(slug: string) {
    if (this.operationBoundary !== "site_admin" || !this.operationSessionHash)
      throw new Error("Site-admin domain authorization is required.");
    const result = await this.pool.query("select * from site_admin_domain_preflight($1,$2)", [this.operationSessionHash, slug]);
    const row = result.rows[0];
    return row ? { siteId: row.site_id as string, currentDomain: row.current_domain as string | undefined } : null;
  }
  async updateCustomDomain(
    siteId: string,
    domain: string,
    verification: unknown = {},
  ) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const persisted = await this.pool.query("select site_admin_domain_persist($1,$2,$3,'pending_dns',$4::jsonb) as ok", [this.operationSessionHash, siteId, domain.toLowerCase(), JSON.stringify(verification)]);
      if (!persisted.rows[0]?.ok) throw new Error("Custom-domain management is unavailable for this subscription.");
      return;
    }
    if (!(await this.hasCapabilityAccess(siteId, "custom_domain_existing")))
      throw new Error("Custom-domain management is unavailable for this subscription.");
    const result = await this.pool.query(
      `update sites s
       set custom_domain=$2,custom_domain_status='pending_dns',custom_domain_verification=$3,custom_domain_checked_at=now()
       where s.id=$1 and s.activated_at is not null returning s.id`,
      [siteId, domain.toLowerCase(), JSON.stringify(verification)],
    );
    if (!result.rows[0]) throw new Error("Website not found.");
  }
  async setCustomDomainVerification(
    siteId: string,
    status: "pending_dns" | "verified" | "failed",
    verification: unknown,
    expectedDomain?: string,
  ) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      if (!expectedDomain) throw new Error("Exact domain binding is required.");
      const persisted = await this.pool.query("select site_admin_domain_persist($1,$2,$3,$4,$5::jsonb) as ok", [this.operationSessionHash, siteId, expectedDomain, status, JSON.stringify(verification)]);
      if (!persisted.rows[0]?.ok) throw new Error("Website not found.");
      return;
    }
    if (!(await this.hasCapabilityAccess(siteId, "custom_domain_existing")))
      throw new Error("Custom-domain management is unavailable for this subscription.");
    const result = await this.pool.query(
      `update sites s
       set custom_domain_status=$2,custom_domain_verification=$3,custom_domain_checked_at=now()
       where s.id=$1 returning s.id`,
      [siteId, status, JSON.stringify(verification)],
    );
    if (!result.rows[0]) throw new Error("Website not found.");
  }
  async getPublicR2Media(storageKey: string) {
    if (!storageKey.startsWith("sites/") || storageKey.length > 500) return null;
    const result = await this.customerRuntimePool().query("select * from resolve_public_r2_business_media($1)", [storageKey]);
    const row = result.rows[0];
    return row ? { siteId: row.site_id as string, storageKey: row.storage_key as string, providerAuthority: row.provider_authority as string, mimeType: row.mime_type as string, byteSize: row.byte_size as number, customDomain: row.custom_domain as string | null, customDomainVerified: row.custom_domain_verified as boolean } : null;
  }
  async getByVerifiedCustomDomain(domain: string) {
    const result = databaseRlsMode() !== "off"
      ? await this.customerRuntimePool().query("select * from resolve_public_site_by_domain($1)", [domain])
      : await this.pool.query(
          `select id as site_id,generated_document from sites
           where custom_domain=$1 and custom_domain_status='verified' and visibility='public' and activated_at is not null`,
          [domain.toLowerCase()],
        );
    const row = result.rows[0];
    if (!row || (databaseRlsMode() === "off" && !(await this.hasCapabilityAccess(row.site_id, "website")))) return null;
    const site = row.generated_document as SiteDocument | undefined;
    const requiresCustomerLegalIdentity = process.env.NODE_ENV === "production" || process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED === "true";
    if (site && requiresCustomerLegalIdentity && !customerPublicLegalIdentityComplete(site)) return null;
    return site ? { ...site, visibility: "public" as const } : null;
  }
  async changeAdminPassword(
    accountId: string,
    currentPasswordHash: string,
    newPasswordHash: string,
    sessionHash?: string,
  ) {
    if (databaseRlsMode() !== "off") {
      if (!sessionHash) return false;
      const result = await this.customerRuntimePool().query(
        "select site_admin_change_password($1,$2,$3,$4) as changed",
        [sessionHash, accountId, currentPasswordHash, newPasswordHash],
      );
      return Boolean(result.rows[0]?.changed);
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        "update site_admin_accounts set password_hash=$3,updated_at=now() where id=$1 and password_hash=$2 returning id",
        [accountId, currentPasswordHash, newPasswordHash],
      );
      if (!updated.rows[0]) {
        await client.query("rollback");
        return false;
      }
      await client.query(
        "delete from site_admin_sessions where account_id=$1",
        [accountId],
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async attachCheckoutSession(intakeId: string, checkoutSessionId: string, sessionHash?: string) {
    if (databaseRlsMode() !== "off") {
      if (!sessionHash) throw new Error("Trusted checkout session provenance is unavailable.");
      const scoped = await this.customerRuntimePool().query(
        "select billing_attach_checkout_session($1,$2,$3) as attached",
        [sessionHash, intakeId, checkoutSessionId],
      );
      if (!scoped.rows[0]?.attached) throw new Error("Checkout intake is no longer pending.");
      return;
    }
    const result = await this.pool.query(
      "update subscriber_intakes set checkout_session_id=$2,updated_at=now() where id=$1 and status='pending_payment' returning id",
      [intakeId, checkoutSessionId],
    );
    if (!result.rows[0])
      throw new Error("Checkout intake is no longer pending.");
  }
  async processBillingSubscriptionEvent(input: BillingSubscriptionEvent) {
    if (databaseRlsMode() !== "off") {
      const durations = lifecycleDurationsFromEnvironment();
      const result = await this.providerSystemPool().query(
        "select billing_system_process_subscription_event($1::jsonb) as result",
        [JSON.stringify({
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          providerEventCreatedAt: input.providerEventCreatedAt ?? new Date().toISOString(),
          intakeId: input.intakeId,
          siteId: input.siteId,
          providerCustomerId: input.providerCustomerId,
          providerSubscriptionId: input.providerSubscriptionId,
          providerPriceId: input.providerPriceId,
          checkoutSessionId: input.checkoutSessionId,
          planKey: input.planKey,
          status: input.status,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
          paymentGraceDays: durations.paymentGraceDays,
          paidReadOnlyDays: durations.paidReadOnlyDays,
        })],
      );
      return result.rows[0]?.result as {
        processed: boolean; ignored?: boolean; invalid?: boolean; stale?: boolean;
        siteId?: string; active?: boolean; accessState?: SubscriptionAccessPolicy["state"];
      };
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const observedAt = new Date(input.providerEventCreatedAt ?? Date.now());
      if (!Number.isFinite(observedAt.getTime())) {
        await client.query("rollback");
        return { processed: true as const, ignored: true as const, invalid: true as const };
      }
      const event = await client.query(
        "insert into payment_webhook_events(event_id,provider,event_type,provider_created_at) values($1,$2,$3,$4) on conflict do nothing returning event_id",
        [input.eventId, input.provider, input.eventType, observedAt.toISOString()],
      );
      if (!event.rows[0]) {
        await client.query("commit");
        return { processed: false as const };
      }
      let siteId: string | undefined;
      let planKey: "starter" | "professional" | "premium" | undefined;
      let knownSubscription = false;
      let existingSubscription: Record<string, unknown> | undefined;
      if (input.providerSubscriptionId) {
        const existing = await client.query(
          "select * from site_subscriptions where billing_provider=$1 and provider_subscription_id=$2 for update",
          [input.provider, input.providerSubscriptionId],
        );
        existingSubscription = existing.rows[0];
        siteId = existingSubscription?.site_id as string | undefined;
        planKey = existingSubscription?.plan_key as "starter" | "professional" | "premium" | undefined;
        knownSubscription = Boolean(siteId);
        if (
          knownSubscription &&
          ((input.siteId !== undefined && input.siteId !== siteId) ||
            (input.planKey !== undefined && input.planKey !== planKey))
        )
          throw new Error("Subscription activation target does not match.");
      }
      if (!knownSubscription && input.intakeId) {
        const intake = await client.query(
          `select intake.demo_site_id,intake.plan_key,intake.billing_provider,
             intake.checkout_session_id,intake.checkout_price_id
           from subscriber_intakes intake
           join site_admin_accounts admin
             on admin.id=intake.site_admin_account_id
            and admin.site_id=intake.demo_site_id
            and admin.email=intake.email
           where intake.id=$1
           for update of intake`,
          [input.intakeId],
        );
        const row = intake.rows[0];
        const expectedSiteId = row?.demo_site_id as string | undefined;
        const expectedPlan = row?.plan_key as "starter" | "professional" | "premium" | undefined;
        const expectedCheckoutSession = row?.checkout_session_id as string | undefined;
        const expectedPrice = row?.checkout_price_id as string | undefined;
        if (
          !expectedSiteId ||
          !planIsPurchasable(expectedPlan, row.billing_provider) ||
          row.billing_provider !== input.provider ||
          input.siteId !== expectedSiteId ||
          input.planKey !== expectedPlan ||
          !expectedPrice ||
          input.providerPriceId !== expectedPrice ||
          (input.provider === "stripe" && !expectedCheckoutSession) ||
          (input.checkoutSessionId !== undefined &&
            input.checkoutSessionId !== expectedCheckoutSession)
        )
          throw new Error("Subscription activation target does not match.");
        siteId = expectedSiteId;
        planKey = expectedPlan;
      } else if (knownSubscription && input.checkoutSessionId && input.intakeId) {
        const checkout = await client.query(
          `select 1 from subscriber_intakes intake
           join site_admin_accounts admin
             on admin.id=intake.site_admin_account_id
            and admin.site_id=intake.demo_site_id
            and admin.email=intake.email
           where intake.id=$1 and intake.demo_site_id=$2
             and intake.checkout_session_id=$3`,
          [input.intakeId, siteId, input.checkoutSessionId],
        );
        if (!checkout.rows[0])
          throw new Error("Subscription activation target does not match.");
      }
      if (!siteId) {
        await client.query(
          "update payment_webhook_events set disposition='ignored_unbound' where event_id=$1",
          [input.eventId],
        );
        await client.query("commit");
        return { processed: true as const, ignored: true as const };
      }

      if (!existingSubscription) {
        const existingBySite = await client.query(
          "select * from site_subscriptions where site_id=$1 for update",
          [siteId],
        );
        existingSubscription = existingBySite.rows[0];
      }
      const latestProviderEventAt = existingSubscription?.latest_provider_event_at
        ? new Date(existingSubscription.latest_provider_event_at as string | Date)
        : undefined;
      const previousProviderStatus = validSubscriptionStatus(existingSubscription?.status)
        ? existingSubscription.status
        : undefined;
      const incomingStatus = validSubscriptionStatus(input.status) ? input.status : undefined;
      const restrictionRank = (status: LifecycleSubscriptionStatus | undefined, cancelAtPeriodEnd = false) => {
        if (status === "active" || status === "trialing") return cancelAtPeriodEnd ? 1 : 0;
        if (status === "past_due") return 2;
        if (status) return 3;
        return -1;
      };
      const olderProviderEvent = Boolean(
        latestProviderEventAt && observedAt.getTime() < latestProviderEventAt.getTime(),
      );
      // Provider timestamps commonly have second-level precision. At an equal timestamp,
      // only accept a strictly more restrictive status so availability fails closed while
      // a same-second permissive event can never resurrect a canceled subscription.
      const unsafeEqualTimestamp = Boolean(
        latestProviderEventAt &&
        observedAt.getTime() === latestProviderEventAt.getTime() &&
        restrictionRank(incomingStatus, input.cancelAtPeriodEnd) <=
          restrictionRank(previousProviderStatus, Boolean(existingSubscription?.cancel_at_period_end)),
      );
      if (olderProviderEvent || unsafeEqualTimestamp) {
        await client.query(
          "update payment_webhook_events set site_id=$2,disposition='ignored_stale' where event_id=$1",
          [input.eventId, siteId],
        );
        await client.query(
          `insert into subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at)
           values($1,$2,$3,'provider_event_ignored_stale',$4,$5,$6,$7,$8) on conflict(event_key) do nothing`,
          [randomUUID(), `${siteId}:provider_event_ignored_stale:${input.eventId}`, siteId, input.eventId,
            existingSubscription?.status ?? null, input.status ?? null,
            JSON.stringify({ provider: input.provider, latestAcceptedAt: latestProviderEventAt?.toISOString() }),
            observedAt.toISOString()],
        );
        await client.query("commit");
        return { processed: true as const, ignored: true as const, stale: true as const, siteId };
      }

      if (!validSubscriptionStatus(input.status) || (!existingSubscription && input.status !== "active" && input.status !== "trialing")) {
        await client.query(
          "update payment_webhook_events set site_id=$2,disposition='ignored_invalid' where event_id=$1",
          [input.eventId, siteId],
        );
        await client.query("commit");
        return { processed: true as const, ignored: true as const, invalid: true as const, siteId };
      }

      const status = input.status;
      const previousStatus = validSubscriptionStatus(existingSubscription?.status) ? existingSubscription.status : undefined;
      const immediateSuspensionStatuses: SubscriptionStatus[] = [
        "unpaid", "paused", "canceled", "incomplete", "incomplete_expired",
      ];
      // A partial provider recovery must not reopen a canceled/suspended site.
      // Only a newer verified active/trialing event can restore full access.
      if (previousStatus && immediateSuspensionStatuses.includes(previousStatus) && status === "past_due") {
        await client.query(
          "update payment_webhook_events set site_id=$2,disposition='ignored_invalid' where event_id=$1",
          [input.eventId, siteId],
        );
        await client.query("commit");
        return { processed: true as const, ignored: true as const, invalid: true as const, siteId };
      }
      const durations = lifecycleDurationsFromEnvironment();
      const active = status === "active" || status === "trialing";
      const samePastDue = status === "past_due" && previousStatus === "past_due";
      const continuingImmediateSuspension = immediateSuspensionStatuses.includes(status) &&
        Boolean(previousStatus && immediateSuspensionStatuses.includes(previousStatus));
      const firstPastDueAt = status === "past_due"
        ? samePastDue && existingSubscription?.first_past_due_at
          ? new Date(existingSubscription.first_past_due_at as string | Date)
          : observedAt
        : undefined;
      const graceEndsAt = firstPastDueAt
        ? samePastDue && existingSubscription?.payment_grace_ends_at
          ? new Date(existingSubscription.payment_grace_ends_at as string | Date)
          : addDays(firstPastDueAt, durations.paymentGraceDays)
        : undefined;
      const currentPeriodEnd = input.currentPeriodEnd
        ? new Date(input.currentPeriodEnd)
        : existingSubscription?.current_period_end
          ? new Date(existingSubscription.current_period_end as string | Date)
          : undefined;
      if (currentPeriodEnd && !Number.isFinite(currentPeriodEnd.getTime()))
        throw new Error("Subscription lifecycle timestamp is invalid.");
      const scheduledCancellationAt = active && input.cancelAtPeriodEnd ? currentPeriodEnd : undefined;
      const previousSuspendedAt = existingSubscription?.suspended_at
        ? new Date(existingSubscription.suspended_at as string | Date)
        : undefined;
      const preserveExpiredGraceSuspension = Boolean(previousStatus === "past_due" &&
        previousSuspendedAt && previousSuspendedAt.getTime() <= observedAt.getTime());
      const preserveScheduledCancellation = Boolean(
        (previousStatus === "active" || previousStatus === "trialing") &&
        existingSubscription?.cancel_at_period_end &&
        previousSuspendedAt && previousSuspendedAt.getTime() <= observedAt.getTime(),
      );
      const preserveImmediateWindow = continuingImmediateSuspension ||
        preserveExpiredGraceSuspension || preserveScheduledCancellation;
      const suspendedAt = graceEndsAt ?? scheduledCancellationAt ?? (!active
        ? preserveImmediateWindow && previousSuspendedAt
          ? previousSuspendedAt
          : observedAt
        : undefined);
      const readOnlyEndsAt = suspendedAt
        ? (samePastDue || preserveImmediateWindow) && existingSubscription?.read_only_ends_at
          ? new Date(existingSubscription.read_only_ends_at as string | Date)
          : addDays(suspendedAt, durations.paidReadOnlyDays)
        : undefined;

      let contractAcceptanceState = existingSubscription?.contract_acceptance_state ?? "acceptance_unknown";
      if (input.intakeId) {
        const acceptedIntake = await client.query(
          `update subscriber_intakes set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now()
           where id=$1 and contract_acceptance_id is not null returning contract_acceptance_id`,
          [input.intakeId],
        );
        if (!acceptedIntake.rows[0])
          throw new Error("Subscription activation requires bound B2B contract acceptance.");
        if (acceptedIntake.rows[0]) contractAcceptanceState = "accepted";
      }
      await client.query(
        `insert into site_subscriptions(
           site_id,billing_provider,provider_customer_id,provider_subscription_id,provider_price_id,
           stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_key,status,current_period_end,
           cancel_at_period_end,cancelled_at,last_processed_event_id,provider_status_observed_at,
           first_past_due_at,payment_grace_ends_at,suspended_at,read_only_ends_at,last_active_at,
           latest_provider_event_at,latest_provider_event_id,contract_acceptance_state
         ) values(
           $1,$2,$3,$4,$5,
           case when $2='stripe' then $3 else null end,
           case when $2='stripe' then $4 else null end,
           case when $2='stripe' then $5 else null end,
           $6,$7,$8,$9,case when $7='canceled' then $11::timestamptz else null end,$10,$11::timestamptz,
           $12,$13,$14,$15,case when $16 then $11::timestamptz else null end,$11::timestamptz,$10,$17
         ) on conflict(site_id) do update set
           billing_provider=excluded.billing_provider,
           provider_customer_id=coalesce(excluded.provider_customer_id,site_subscriptions.provider_customer_id),
           provider_subscription_id=coalesce(excluded.provider_subscription_id,site_subscriptions.provider_subscription_id),
           provider_price_id=coalesce(excluded.provider_price_id,site_subscriptions.provider_price_id),
           stripe_customer_id=coalesce(excluded.stripe_customer_id,site_subscriptions.stripe_customer_id),
           stripe_subscription_id=coalesce(excluded.stripe_subscription_id,site_subscriptions.stripe_subscription_id),
           stripe_price_id=coalesce(excluded.stripe_price_id,site_subscriptions.stripe_price_id),
           plan_key=coalesce(excluded.plan_key,site_subscriptions.plan_key),status=excluded.status,
           current_period_end=coalesce(excluded.current_period_end,site_subscriptions.current_period_end),
           cancel_at_period_end=excluded.cancel_at_period_end,
           cancelled_at=case when excluded.status='canceled' then coalesce(site_subscriptions.cancelled_at,excluded.cancelled_at) else null end,
           last_processed_event_id=excluded.last_processed_event_id,
           provider_status_observed_at=excluded.provider_status_observed_at,
           first_past_due_at=excluded.first_past_due_at,
           payment_grace_ends_at=excluded.payment_grace_ends_at,
           suspended_at=excluded.suspended_at,
           read_only_ends_at=excluded.read_only_ends_at,
           last_active_at=coalesce(excluded.last_active_at,site_subscriptions.last_active_at),
           latest_provider_event_at=excluded.latest_provider_event_at,
           latest_provider_event_id=excluded.latest_provider_event_id,
           contract_acceptance_state=case when excluded.contract_acceptance_state='accepted' then 'accepted' else site_subscriptions.contract_acceptance_state end,
           updated_at=now()`,
        [siteId, input.provider, input.providerCustomerId ?? null, input.providerSubscriptionId ?? null,
          input.providerPriceId ?? null, planKey ?? null, status, currentPeriodEnd?.toISOString() ?? null,
          input.cancelAtPeriodEnd ?? false, input.eventId, observedAt.toISOString(),
          firstPastDueAt?.toISOString() ?? null, graceEndsAt?.toISOString() ?? null,
          suspendedAt?.toISOString() ?? null, readOnlyEndsAt?.toISOString() ?? null, active,
          contractAcceptanceState],
      );

      const site = await client.query(
        "select visibility,publication_intent,activated_at,demo_expires_at,trial_recovery_ends_at from sites where id=$1 for update",
        [siteId],
      );
      const siteRow = site.rows[0];
      const nextAccess = resolveSubscriptionAccess({
        activatedAt: active ? (siteRow.activated_at?.toISOString() ?? observedAt.toISOString()) : siteRow.activated_at?.toISOString(),
        demoExpiresAt: siteRow.demo_expires_at.toISOString(),
        trialRecoveryEndsAt: siteRow.trial_recovery_ends_at.toISOString(),
        publicationIntent: siteRow.publication_intent,
        subscriptionStatus: status,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: currentPeriodEnd?.toISOString(),
        firstPastDueAt: firstPastDueAt?.toISOString(),
        paymentGraceEndsAt: graceEndsAt?.toISOString(),
        suspendedAt: suspendedAt?.toISOString(),
        readOnlyEndsAt: readOnlyEndsAt?.toISOString(),
        lastActiveAt: active ? observedAt.toISOString() : existingSubscription?.last_active_at
          ? new Date(existingSubscription.last_active_at as string | Date).toISOString()
          : undefined,
      });
      const billingRestricted = nextAccess.state === "read_only" || nextAccess.state === "locked";
      const storedDocumentRow = await client.query(
        "select generated_document from sites where id=$1",
        [siteId],
      );
      const storedDocument = storedDocumentRow.rows[0]?.generated_document as SiteDocument | undefined;
      // Publication boundary: a site must never become publicly visible with an
      // incomplete customer legal identity — that combination is a silent 404.
      const legalIdentityComplete =
        !storedDocument || customerPublicLegalIdentityComplete(storedDocument);
      const restoringPublication =
        active && legalIdentityComplete && siteRow.visibility !== siteRow.publication_intent;
      await client.query(
        `update sites set
           publication_intent=case when $3 and visibility='public' then 'public' else publication_intent end,
           activated_at=case when $2 then coalesce(activated_at,$4) else activated_at end,
           visibility=case when $2 and $5 then publication_intent when $3 then 'private' else visibility end
         where id=$1`,
        [siteId, active, billingRestricted, observedAt.toISOString(), legalIdentityComplete],
      );
      if (planKey) {
        const entitlements = subscriptionEntitlementsFor(planKey);
        for (const [feature, enabled] of Object.entries(entitlements)) {
          await client.query(
            "insert into site_features(site_id,feature_key,enabled) values($1,$2,$3) on conflict(site_id,feature_key) do update set enabled=excluded.enabled",
            [siteId, feature, enabled],
          );
        }
      }
      const audit = async (action: string, details: Record<string, unknown> = {}) => {
        await client.query(
          `insert into subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(event_key) do nothing`,
          [randomUUID(), `${siteId}:${action}:${input.eventId}`, siteId, action, input.eventId,
            previousStatus ?? null, status, JSON.stringify(details), observedAt.toISOString()],
        );
      };
      if (status === "past_due" && previousStatus !== "past_due")
        await audit("entered_payment_grace", { graceEndsAt: graceEndsAt?.toISOString() });
      if (billingRestricted && !["unpaid", "paused", "canceled", "incomplete", "incomplete_expired"].includes(previousStatus ?? ""))
        await audit("entered_read_only", { readOnlyEndsAt: readOnlyEndsAt?.toISOString() });
      if (billingRestricted && siteRow.visibility === "public")
        await audit("billing_forced_private", { publicationIntent: "public" });
      if (active && previousStatus && previousStatus !== "active" && previousStatus !== "trialing")
        await audit("reactivated", { preservedOwnership: true });
      if (restoringPublication)
        await audit("publication_intent_restored", { publicationIntent: siteRow.publication_intent });
      if (active) {
        // A verified paid activation deterministically retires an owner
        // complimentary entitlement; the first conversion timestamp wins.
        const converted = await client.query(
          `update site_complimentary_access
           set status='converted',converted_to_paid_at=coalesce(converted_to_paid_at,statement_timestamp()),updated_at=statement_timestamp()
           where site_id=$1 and status='complimentary_active' returning id`,
          [siteId],
        );
        if (converted.rows[0]) await audit("complimentary_converted", { planKey: planKey ?? null });
      }
      await client.query(
        "update payment_webhook_events set site_id=$2,disposition='accepted' where event_id=$1",
        [input.eventId, siteId],
      );
      await client.query("commit");
      return { processed: true as const, siteId, active, accessState: nextAccess.state };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async processStripeSubscriptionEvent(input: SubscriptionEvent) {
    return this.processBillingSubscriptionEvent({
      provider: "stripe",
      eventId: input.eventId,
      eventType: input.eventType,
      siteId: input.siteId,
      intakeId: input.intakeId,
      providerCustomerId: input.stripeCustomerId,
      providerSubscriptionId: input.stripeSubscriptionId,
      providerPriceId: input.stripePriceId,
      checkoutSessionId: input.checkoutSessionId,
      planKey: input.planKey,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      providerEventCreatedAt: input.providerEventCreatedAt,
    });
  }
  async getAddonSubscription(siteId: string, addonKey: "social_media") {
    const result = await this.pool.query(
      "select site_id,addon_key,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end from site_addon_subscriptions where site_id=$1 and addon_key=$2",
      [siteId, addonKey],
    );
    const row = result.rows[0];
    return row ? {
      siteId: row.site_id as string,
      addonKey: row.addon_key as "social_media",
      stripeCustomerId: row.stripe_customer_id as string | undefined,
      stripeSubscriptionId: row.stripe_subscription_id as string | undefined,
      stripePriceId: row.stripe_price_id as string | undefined,
      status: row.status as SubscriptionStatus,
      currentPeriodEnd: row.current_period_end?.toISOString() as string | undefined,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    } : null;
  }
  async getActiveSubscriptionCheckoutIdentity(siteId: string) {
    const result = await this.pool.query(
      "select billing_provider,provider_customer_id,provider_subscription_id,stripe_customer_id,plan_key from site_subscriptions where site_id=$1 and status in ('active','trialing')",
      [siteId],
    );
    return result.rows[0]
      ? {
          billingProvider: result.rows[0].billing_provider as BillingProvider,
          providerCustomerId: result.rows[0].provider_customer_id as string | undefined,
          providerSubscriptionId: result.rows[0].provider_subscription_id as string | undefined,
          stripeCustomerId: result.rows[0].stripe_customer_id as string | undefined,
          planKey: result.rows[0].plan_key as PlanKey | undefined,
        }
      : null;
  }
  async getSubscriptionBillingIdentity(siteId: string, sessionHash?: string) {
    if (databaseRlsMode() !== "off") {
      if (!sessionHash) return null;
      const scoped = await this.customerRuntimePool().query(
        "select * from billing_customer_snapshot($1,$2)",
        [sessionHash, siteId],
      );
      const row = scoped.rows[0];
      return row?.plan_key ? {
        billingProvider: row.billing_provider as BillingProvider,
        providerCustomerId: row.provider_customer_id as string | undefined,
        providerSubscriptionId: undefined,
        stripeCustomerId: row.stripe_customer_id as string | undefined,
        planKey: row.plan_key as PlanKey,
        status: row.subscription_status as SubscriptionStatus,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        currentPeriodEnd: row.current_period_end?.toISOString() as string | undefined,
        paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString() as string | undefined,
        readOnlyEndsAt: row.read_only_ends_at?.toISOString() as string | undefined,
        portalAllowed: Boolean(row.portal_allowed),
      } : null;
    }
    const result = await this.pool.query(
      "select billing_provider,provider_customer_id,provider_subscription_id,stripe_customer_id,plan_key,status,cancel_at_period_end,current_period_end,payment_grace_ends_at,read_only_ends_at from site_subscriptions where site_id=$1",
      [siteId],
    );
    const row = result.rows[0];
    return row ? {
      billingProvider: row.billing_provider as BillingProvider,
      providerCustomerId: row.provider_customer_id as string | undefined,
      providerSubscriptionId: row.provider_subscription_id as string | undefined,
      stripeCustomerId: row.stripe_customer_id as string | undefined,
      planKey: row.plan_key as PlanKey | undefined,
      status: row.status as SubscriptionStatus,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end?.toISOString() as string | undefined,
      paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString() as string | undefined,
      readOnlyEndsAt: row.read_only_ends_at?.toISOString() as string | undefined,
      portalAllowed: row.plan_key === "starter" && row.billing_provider === "stripe" && Boolean(row.provider_customer_id),
    } : null;
  }
  async isAddonSubscription(stripeSubscriptionId: string) {
    if (databaseRlsMode() !== "off") {
      const result = await this.providerSystemPool().query(
        "select billing_system_is_addon_subscription($1) as present",
        [stripeSubscriptionId],
      );
      return Boolean(result.rows[0]?.present);
    }
    const result = await this.pool.query(
      "select 1 from site_addon_subscriptions where stripe_subscription_id=$1",
      [stripeSubscriptionId],
    );
    return Boolean(result.rows[0]);
  }
  async getBillingSystemCacheIdentities(siteId: string) {
    if (databaseRlsMode() === "off") {
      const [slug, access] = await Promise.all([this.getSlugBySiteId(siteId), this.getSiteAccess(siteId)]);
      return { slug, customDomain: access?.customDomain };
    }
    const result = await this.providerSystemPool().query(
      "select * from billing_system_cache_identities($1)",
      [siteId],
    );
    return result.rows[0]
      ? { slug: result.rows[0].slug as string, customDomain: result.rows[0].custom_domain as string | undefined }
      : { slug: undefined, customDomain: undefined };
  }
  async getActorCacheIdentities(siteId: string) {
    if (this.operationBoundary === "system") return this.getBillingSystemCacheIdentities(siteId);
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const row = (await this.pool.query("select * from site_admin_cache_identities($1,$2)", [this.operationSessionHash, siteId])).rows[0];
      return { slug: row?.slug as string | undefined, customDomain: row?.custom_domain as string | undefined };
    }
    throw new Error("A scoped cache-identity boundary is required.");
  }
  async processStripeAddonEvent(input: AddonSubscriptionEvent) {
    // Social activation is outside 3-B3B. Pilot webhook processing recognizes
    // historical bindings but cannot mutate or reactivate them.
    if (databaseRlsMode() !== "off")
      return { processed: true as const, ignored: true as const };
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const event = await client.query(
        "insert into payment_webhook_events(event_id,provider,event_type) values($1,'stripe',$2) on conflict do nothing returning event_id",
        [input.eventId, input.eventType],
      );
      if (!event.rows[0]) {
        await client.query("commit");
        return { processed: false as const };
      }
      let existing;
      if (input.stripeSubscriptionId) {
        existing = await client.query(
          "select site_id from site_addon_subscriptions where stripe_subscription_id=$1 and addon_key=$2 for update",
          [input.stripeSubscriptionId, input.addonKey],
        );
      }
      if (!existing?.rows[0] && input.siteId) {
        existing = await client.query(
          "select site_id from site_addon_subscriptions where site_id=$1 and addon_key=$2 for update",
          [input.siteId, input.addonKey],
        );
      }
      const siteId = existing?.rows[0]?.site_id as string | undefined;
      if (!siteId) {
        await client.query("commit");
        return { processed: true as const, ignored: true as const };
      }
      if (input.siteId && input.siteId !== siteId) {
        throw new Error("Add-on subscription target does not match");
      }
      const base = await client.query(
        "select 1 from site_subscriptions where site_id=$1 and status in ('active','trialing')",
        [siteId],
      );
      if (!base.rows[0]) throw new Error("An active website subscription is required for an add-on.");
      const status = input.status ?? "active";
      const active = status === "active" || status === "trialing";
      await client.query(
        "insert into site_addon_subscriptions(site_id,addon_key,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end,cancelled_at,last_processed_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,case when $6='canceled' then now() else null end,$9) on conflict(site_id,addon_key) do update set stripe_customer_id=coalesce(excluded.stripe_customer_id,site_addon_subscriptions.stripe_customer_id),stripe_subscription_id=coalesce(excluded.stripe_subscription_id,site_addon_subscriptions.stripe_subscription_id),stripe_price_id=coalesce(excluded.stripe_price_id,site_addon_subscriptions.stripe_price_id),status=excluded.status,current_period_end=coalesce(excluded.current_period_end,site_addon_subscriptions.current_period_end),cancel_at_period_end=excluded.cancel_at_period_end,cancelled_at=case when excluded.status='canceled' then coalesce(site_addon_subscriptions.cancelled_at,now()) else null end,last_processed_event_id=excluded.last_processed_event_id,updated_at=now()",
        [siteId, input.addonKey, input.stripeCustomerId ?? null, input.stripeSubscriptionId ?? null, input.stripePriceId ?? null, status, input.currentPeriodEnd ?? null, input.cancelAtPeriodEnd ?? false, input.eventId],
      );
      await client.query(
        "insert into site_features(site_id,feature_key,enabled) values($1,$2,$3) on conflict(site_id,feature_key) do update set enabled=excluded.enabled",
        [siteId, input.addonKey, active],
      );
      await client.query("commit");
      return { processed: true as const, siteId, active };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async hasFeature(siteId: string, feature: SiteFeatureKey) {
    if (feature === "booking") return this.hasCapabilityAccess(siteId, "appointment_requests");
    if (feature === "custom_domain") return this.hasCapabilityAccess(siteId, "custom_domain_existing");
    if (feature === "social_media") return false;
    const result = await this.pilotSiteQuery(siteId, (client) => client.query(
      "select enabled from site_features where site_id=$1 and feature_key=$2",
      [siteId, feature],
    ));
    return Boolean(result.rows[0]?.enabled && await this.hasCapabilityAccess(siteId, feature));
  }
  async hasCapabilityAccess(siteId: string, capability: EntitlementCapability) {
    if (!capabilityIsPubliclyActive(capability)) return false;
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select site_admin_capability_allowed($1,$2,$3) as allowed", [
        this.operationSessionHash, siteId, capability,
      ]);
      return Boolean(result.rows[0]?.allowed);
    }
    const snapshot = await this.subscriptionAccessSnapshot(siteId);
    if (!snapshot) return false;
    const access = resolveSubscriptionAccess(snapshot);
    const policyAllows = {
      website: access.canResolvePublicWebsite,
      editor: access.canEditCoreContent,
      media: access.canUploadMedia,
      ai_rewrite: access.canUseAi,
      appointment_requests: access.canReceiveAppointmentRequests,
      booking_calendar: false,
      custom_domain_existing: access.canManageDomain,
      social_media: false,
    } satisfies Record<EntitlementCapability, boolean>;
    if (!policyAllows[capability]) return false;
    if (!snapshot.activatedAt) return trialHasEntitlement(capability);
    const feature = await this.pilotSiteQuery(siteId, (client) => client.query(
      "select enabled from site_features where site_id=$1 and feature_key=$2",
      [siteId, capability],
    ));
    return Boolean(feature.rows[0]?.enabled);
  }
  async getSocialControlLink(siteId: string): Promise<SocialControlLink | null> {
    const result = await this.pool.query(
      "select site_id,provider,external_installation_id,external_tenant_id,external_workspace_id,status,last_synced_at,last_error_code from site_external_integrations where site_id=$1 and provider='redi_control'",
      [siteId],
    );
    const row = result.rows[0];
    return row ? {
      siteId: row.site_id,
      provider: row.provider,
      installationId: row.external_installation_id ?? undefined,
      tenantId: row.external_tenant_id ?? undefined,
      workspaceId: row.external_workspace_id ?? undefined,
      status: row.status,
      lastSyncedAt: row.last_synced_at?.toISOString(),
      lastErrorCode: row.last_error_code ?? undefined,
    } as SocialControlLink : null;
  }
  async beginSocialControlProvisioning(siteId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into site_external_integrations(id,site_id,provider,status) values($1,$2,'redi_control','provisioning') on conflict(site_id,provider) do update set status=case when site_external_integrations.status='active' then 'active' else 'provisioning' end,last_error_code=case when site_external_integrations.status='active' then site_external_integrations.last_error_code else null end,updated_at=now()",
        [randomUUID(), siteId],
      );
      await client.query(
        "insert into site_integration_events(id,site_id,provider,action) values($1,$2,'redi_control','provisioning_started')",
        [randomUUID(), siteId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async activateSocialControlLink(input: { siteId: string; installationId: string; tenantId: string; workspaceId: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into site_external_integrations(id,site_id,provider,external_installation_id,external_tenant_id,external_workspace_id,status,last_synced_at) values($1,$2,'redi_control',$3,$4,$5,'active',now()) on conflict(site_id,provider) do update set external_installation_id=excluded.external_installation_id,external_tenant_id=excluded.external_tenant_id,external_workspace_id=excluded.external_workspace_id,status='active',last_synced_at=now(),last_error_code=null,updated_at=now()",
        [randomUUID(), input.siteId, input.installationId, input.tenantId, input.workspaceId],
      );
      await client.query(
        "insert into site_integration_events(id,site_id,provider,action,details) values($1,$2,'redi_control','provisioning_completed',$3)",
        [randomUUID(), input.siteId, JSON.stringify({ workspaceId: input.workspaceId })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async failSocialControlProvisioning(siteId: string, errorCode: string) {
    const safeCode = errorCode.replace(/[^a-z0-9_-]/gi, "_").slice(0, 120) || "unknown_error";
    await this.pool.query(
      "with updated as (update site_external_integrations set status='error',last_error_code=$2,updated_at=now() where site_id=$1 and provider='redi_control') insert into site_integration_events(id,site_id,provider,action,details) values($3,$1,'redi_control','provisioning_failed',$4)",
      [siteId, safeCode, randomUUID(), JSON.stringify({ code: safeCode })],
    );
  }
  async recordSocialControlSession(siteId: string) {
    await this.pool.query(
      "insert into site_integration_events(id,site_id,provider,action) values($1,$2,'redi_control','session_created')",
      [randomUUID(), siteId],
    );
  }
  async getSitePlan(siteId: string) {
    const result = this.operationBoundary === "site_admin" && this.operationSessionHash
      ? await this.pool.query("select site_admin_site_plan($1,$2) as plan_key", [this.operationSessionHash, siteId])
      : this.operationBoundary === "system" && this.operationIntegrationId
        ? await this.pool.query("select information_redi_site_plan($1,$2) as plan_key", [this.operationIntegrationId, siteId])
        : await this.pool.query(
          "select plan_key from site_subscriptions where site_id=$1 and status in ('active','trialing')",
          [siteId],
        );
    const plan = result.rows[0]?.plan_key;
    return (plan === "professional" || plan === "premium" ? plan : "starter") as
      | "starter"
      | "professional"
      | "premium";
  }
  async consumeTenantUsage(input: {
    siteId: string;
    metric: string;
    amount: number;
    quotas: Array<{ window: TenantUsageWindow; limit: number }>;
    warningRatio: number;
  }): Promise<TenantUsageResult> {
    if (!Number.isSafeInteger(input.amount) || input.amount < 1)
      throw new Error("Tenant usage amount must be a positive integer.");
    if (!input.quotas.length)
      throw new Error("At least one tenant quota is required.");
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select site_admin_reserve_usage($1,$2,$3,$4,$5::jsonb,$6) value", [
        this.operationSessionHash, input.siteId, input.metric, input.amount, JSON.stringify(input.quotas), input.warningRatio,
      ]);
      return result.rows[0]?.value as TenantUsageResult;
    }
    if (this.operationBoundary === "system" && this.operationIntegrationId) {
      const result = await this.pool.query("select information_redi_usage_reserve($1,$2,$3,$4,$5::jsonb,$6) value", [
        this.operationIntegrationId, input.siteId, input.metric, input.amount, JSON.stringify(input.quotas), input.warningRatio,
      ]);
      return result.rows[0]?.value as TenantUsageResult;
    }
    const client = await this.pool.connect();
    const now = new Date();
    const boundaries = Object.fromEntries(
      input.quotas.map(({ window }) => {
        const start = new Date(now);
        if (window === "minute") start.setUTCSeconds(0, 0);
        if (window === "hour") start.setUTCMinutes(0, 0, 0);
        if (window === "day") start.setUTCHours(0, 0, 0, 0);
        if (window === "month")
          start.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth(), 1),
            start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start);
        if (window === "minute") end.setUTCMinutes(end.getUTCMinutes() + 1);
        if (window === "hour") end.setUTCHours(end.getUTCHours() + 1);
        if (window === "day") end.setUTCDate(end.getUTCDate() + 1);
        if (window === "month") end.setUTCMonth(end.getUTCMonth() + 1);
        return [window, { start, end }];
      }),
    ) as Record<TenantUsageWindow, { start: Date; end: Date }>;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${input.siteId}:${input.metric}`,
      ]);
      await client.query(
        "insert into tenant_usage_states(site_id) values($1) on conflict(site_id) do nothing",
        [input.siteId],
      );
      const stateResult = await client.query(
        "select state,reason_code,state_until,owner_override_state,owner_override_reason,owner_override_until from tenant_usage_states where site_id=$1 for update",
        [input.siteId],
      );
      const stored = stateResult.rows[0];
      const overrideActive =
        stored.owner_override_state &&
        stored.owner_override_until &&
        new Date(stored.owner_override_until) > now;
      const effectiveState = (overrideActive
        ? stored.owner_override_state
        : stored.state_until && new Date(stored.state_until) <= now
          ? "normal"
          : stored.state) as TenantUsageState;
      if (effectiveState === "temporarily_restricted") {
        await client.query("commit");
        return {
          allowed: false,
          state: effectiveState,
          reasonCode: overrideActive
            ? stored.owner_override_reason ?? "owner_temporarily_restricted"
            : stored.reason_code ?? "tenant_temporarily_restricted",
          retryAfterSeconds: stored.state_until
            ? Math.max(1, Math.ceil((new Date(stored.state_until).getTime() - now.getTime()) / 1000))
            : 3600,
        };
      }
      if (overrideActive && effectiveState === "normal") {
        await client.query("commit");
        return { allowed: true, state: "normal" };
      }

      const usage: Array<{
        window: TenantUsageWindow;
        quantity: number;
        limit: number;
        end: Date;
      }> = [];
      for (const quota of input.quotas) {
        const boundary = boundaries[quota.window];
        const current = await client.query(
          "select quantity from tenant_usage_counters where site_id=$1 and metric=$2 and window_type=$3 and window_start=$4 for update",
          [input.siteId, input.metric, quota.window, boundary.start],
        );
        const quantity = Number(current.rows[0]?.quantity ?? 0);
        if (quantity + input.amount > quota.limit) {
          const reasonCode = `quota_${input.metric}_${quota.window}`;
          const repeatedThrottle =
            stored.state === "throttled" &&
            stored.reason_code === reasonCode &&
            stored.state_until &&
            new Date(stored.state_until) > now;
          await client.query(
            "update tenant_usage_states set state='throttled',reason_code=$2,state_until=$3,updated_at=now() where site_id=$1",
            [input.siteId, reasonCode, boundary.end],
          );
          if (!repeatedThrottle)
            await client.query(
              "insert into tenant_usage_events(id,site_id,metric,decision,reason_code,window_type,quantity,limit_value) values($1,$2,$3,'throttled',$4,$5,$6,$7)",
              [randomUUID(), input.siteId, input.metric, reasonCode, quota.window, quantity, quota.limit],
            );
          await client.query("commit");
          return {
            allowed: false,
            state: "throttled",
            reasonCode,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((boundary.end.getTime() - now.getTime()) / 1000),
            ),
          };
        }
        usage.push({
          window: quota.window,
          quantity: quantity + input.amount,
          limit: quota.limit,
          end: boundary.end,
        });
      }
      for (const item of usage) {
        await client.query(
          "insert into tenant_usage_counters(site_id,metric,window_type,window_start,quantity) values($1,$2,$3,$4,$5) on conflict(site_id,metric,window_type,window_start) do update set quantity=excluded.quantity,updated_at=now()",
          [input.siteId, input.metric, item.window, boundaries[item.window].start, item.quantity],
        );
      }
      const warning = usage
        .filter((item) => item.quantity / item.limit >= input.warningRatio)
        .sort((left, right) => right.quantity / right.limit - left.quantity / left.limit)[0];
      if (warning) {
        const reasonCode = `warning_${input.metric}_${warning.window}`;
        await client.query(
          "update tenant_usage_states set state='warning',reason_code=$2,state_until=$3,updated_at=now() where site_id=$1 and (owner_override_until is null or owner_override_until <= now())",
          [input.siteId, reasonCode, warning.end],
        );
        if (stored.state !== "warning" || stored.reason_code !== reasonCode)
          await client.query(
            "insert into tenant_usage_events(id,site_id,metric,decision,reason_code,window_type,quantity,limit_value) values($1,$2,$3,'warning',$4,$5,$6,$7)",
            [randomUUID(), input.siteId, input.metric, reasonCode, warning.window, warning.quantity, warning.limit],
          );
      } else if (!overrideActive) {
        await client.query(
          "update tenant_usage_states set state='normal',reason_code=null,state_until=null,updated_at=now() where site_id=$1 and state <> 'temporarily_restricted'",
          [input.siteId],
        );
      }
      await client.query("commit");
      return { allowed: true, state: warning ? "warning" : effectiveState === "warning" ? "normal" : effectiveState };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async acquireTenantConcurrency(input: {
    siteId: string;
    operation: string;
    limit: number;
    ttlSeconds: number;
  }) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      const result = await this.pool.query("select site_admin_concurrency_acquire($1,$2,$3,$4,$5) value", [
        this.operationSessionHash, input.siteId, input.operation, input.limit, input.ttlSeconds,
      ]);
      return result.rows[0]?.value as { allowed: false; retryAfterSeconds: number } | { allowed: true; leaseId: string };
    }
    if (this.operationBoundary === "system" && this.operationIntegrationId && input.operation === "media_upload") {
      const result = await this.pool.query("select information_redi_concurrency_acquire($1,$2,$3,$4) value", [
        this.operationIntegrationId, input.siteId, input.limit, input.ttlSeconds,
      ]);
      return result.rows[0]?.value as { allowed: false; retryAfterSeconds: number } | { allowed: true; leaseId: string };
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${input.siteId}:concurrency:${input.operation}`,
      ]);
      await client.query(
        "delete from tenant_concurrency_leases where site_id=$1 and operation=$2 and expires_at <= now()",
        [input.siteId, input.operation],
      );
      const active = await client.query(
        "select count(*)::int as count,min(expires_at) as earliest from tenant_concurrency_leases where site_id=$1 and operation=$2 and expires_at > now()",
        [input.siteId, input.operation],
      );
      if (Number(active.rows[0]?.count ?? 0) >= input.limit) {
        await client.query("commit");
        const earliest = active.rows[0]?.earliest
          ? new Date(active.rows[0].earliest).getTime()
          : Date.now() + input.ttlSeconds * 1000;
        return {
          allowed: false as const,
          retryAfterSeconds: Math.max(1, Math.ceil((earliest - Date.now()) / 1000)),
        };
      }
      const leaseId = randomUUID();
      await client.query(
        "insert into tenant_concurrency_leases(id,site_id,operation,expires_at) values($1,$2,$3,now() + ($4 * interval '1 second'))",
        [leaseId, input.siteId, input.operation, input.ttlSeconds],
      );
      await client.query("commit");
      return { allowed: true as const, leaseId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async releaseTenantConcurrency(siteId: string, leaseId: string) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash) {
      await this.pool.query("select site_admin_concurrency_release($1,$2,$3)", [this.operationSessionHash, siteId, leaseId]);
      return;
    }
    if (this.operationBoundary === "system" && this.operationIntegrationId) {
      await this.pool.query("select information_redi_concurrency_release($1,$2,$3)", [this.operationIntegrationId, siteId, leaseId]);
      return;
    }
    await this.pool.query(
      "delete from tenant_concurrency_leases where id=$1 and site_id=$2",
      [leaseId, siteId],
    );
  }
  async getTenantUsageSnapshot(siteId: string): Promise<TenantUsageSnapshot> {
    const stateResult = await this.pool.query(
        "select state,reason_code,state_until,owner_override_state,owner_override_reason,owner_override_until from tenant_usage_states where site_id=$1",
        [siteId],
      );
    const countersResult = await this.pool.query(
        "select metric,window_type,window_start,quantity from tenant_usage_counters where site_id=$1 and window_start >= date_trunc('month',now()) order by metric,window_type",
        [siteId],
      );
    const eventsResult = await this.pool.query(
        "select id,metric,decision,reason_code,created_at from tenant_usage_events where site_id=$1 order by created_at desc limit 50",
        [siteId],
      );
    const state = stateResult.rows[0];
    return {
      state: (state?.state ?? "normal") as TenantUsageState,
      reasonCode: state?.reason_code ?? undefined,
      stateUntil: state?.state_until?.toISOString(),
      overrideState: state?.owner_override_state ?? undefined,
      overrideReason: state?.owner_override_reason ?? undefined,
      overrideUntil: state?.owner_override_until?.toISOString(),
      counters: countersResult.rows.map((row) => ({
        metric: row.metric,
        window: row.window_type,
        windowStart: row.window_start.toISOString(),
        quantity: Number(row.quantity),
      })),
      events: eventsResult.rows.map((row) => ({
        id: row.id,
        metric: row.metric,
        decision: row.decision,
        reasonCode: row.reason_code,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }
  async getOwnerTenantUsageSnapshot(sessionHash: string, slug: string): Promise<TenantUsageSnapshot | null> {
    const result = await getOwnerPostgresPool().query("select owner_usage_snapshot($1,$2) as snapshot", [sessionHash, slug]);
    return result.rows[0]?.snapshot ? mapOwnerUsageSnapshot(result.rows[0].snapshot) : null;
  }
  async getOwnerProviderUsageSnapshot(sessionHash: string): Promise<ProviderUsageSnapshot> {
    const result = await getOwnerPostgresPool().query("select owner_provider_usage_snapshot($1) as snapshot", [sessionHash]);
    return mapProviderUsageSnapshot(result.rows[0]?.snapshot ?? {});
  }
  async ownerProviderControl(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (this.operationBoundary !== "owner" || !this.operationSessionHash) throw new Error("Owner provider-control boundary required.");
    const result = await this.pool.query("select owner_provider_control($1,$2,$3::jsonb) as value", [this.operationSessionHash, action, JSON.stringify(payload)]);
    if (!result.rows[0]?.value) throw new Error("Owner provider-control response missing.");
    return result.rows[0].value;
  }
  async setOwnerTenantUsageOverride(input: {
    sessionHash: string;
    slug: string;
    state?: "normal" | "temporarily_restricted";
    reason: string;
    expiresAt?: string;
    correlationId: string;
  }) {
    const result = await getOwnerPostgresPool().query(
      "select owner_usage_override($1,$2,$3,$4,$5,$6) as ok",
      [input.sessionHash, input.slug, input.state ?? null, input.reason, input.expiresAt ?? null, input.correlationId],
    );
    if (!result.rows[0]?.ok) throw new Error("Owner usage override was rejected.");
  }
  async setTenantUsageOverride(input: {
    siteId: string;
    state?: "normal" | "temporarily_restricted";
    reason: string;
    expiresAt?: string;
  }) {
    const reason = input.reason.trim().slice(0, 240);
    if (!reason) throw new Error("An owner override reason is required.");
    await this.pool.query(
      "insert into tenant_usage_states(site_id,owner_override_state,owner_override_reason,owner_override_until) values($1,$2,$3,$4) on conflict(site_id) do update set owner_override_state=excluded.owner_override_state,owner_override_reason=excluded.owner_override_reason,owner_override_until=excluded.owner_override_until,updated_at=now()",
      [input.siteId, input.state ?? null, reason, input.expiresAt ?? null],
    );
    await this.pool.query(
      "insert into tenant_usage_events(id,site_id,metric,decision,reason_code,details) values($1,$2,'owner_override','override',$3,$4)",
      [randomUUID(), input.siteId, input.state ? `owner_${input.state}` : "owner_override_cleared", JSON.stringify({ expiresAt: input.expiresAt ?? null })],
    );
  }
  async reconcileLifecycleStates(now = new Date()) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `select s.id,s.visibility,s.publication_intent,s.activated_at,s.demo_expires_at,s.trial_recovery_ends_at,
                sub.status,sub.cancel_at_period_end,sub.current_period_end,sub.first_past_due_at,
                sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,
                comp.status as complimentary_status
         from sites s
         left join site_subscriptions sub on sub.site_id=s.id
         left join site_complimentary_access comp on comp.site_id=s.id
         where s.site_kind='business' for update of s`,
      );
      let observed = 0;
      for (const row of result.rows) {
        const access = resolveSubscriptionAccess({
          activatedAt: row.activated_at?.toISOString(),
          demoExpiresAt: row.demo_expires_at.toISOString(),
          trialRecoveryEndsAt: row.trial_recovery_ends_at.toISOString(),
          publicationIntent: row.publication_intent,
          subscriptionStatus: validSubscriptionStatus(row.status) ? row.status : undefined,
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
          currentPeriodEnd: row.current_period_end?.toISOString(),
          firstPastDueAt: row.first_past_due_at?.toISOString(),
          paymentGraceEndsAt: row.payment_grace_ends_at?.toISOString(),
          suspendedAt: row.suspended_at?.toISOString(),
          readOnlyEndsAt: row.read_only_ends_at?.toISOString(),
          lastActiveAt: row.last_active_at?.toISOString(),
          complimentaryStatus: complimentaryStatusOf(row.complimentary_status),
        }, now);
        const events: Array<[string, string | undefined]> = [];
        if (access.reason === "trial_expired") events.push(["trial_expired", access.effectiveAt]);
        if (access.reason === "payment_grace_expired") events.push(["grace_expired", access.effectiveAt]);
        if (access.state === "read_only") events.push(["entered_read_only", access.effectiveAt]);
        if (access.state === "locked") events.push(["entered_locked", access.effectiveAt]);
        for (const [action, effectiveAt] of events) {
          const eventKey = `${row.id}:${action}:${effectiveAt ?? "unknown"}`;
          const inserted = await client.query(
            `insert into subscription_lifecycle_events(id,event_key,site_id,action,from_status,to_status,details,occurred_at)
             values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(event_key) do nothing returning id`,
            [randomUUID(), eventKey, row.id, action, row.status ?? null, row.status ?? null,
              JSON.stringify({ accessState: access.state, reason: access.reason }), effectiveAt ?? now.toISOString()],
          );
          if (inserted.rows[0]) observed += 1;
        }
        if ((access.state === "read_only" || access.state === "locked") && row.visibility === "public") {
          await client.query(
            "update sites set publication_intent='public',visibility='private' where id=$1",
            [row.id],
          );
          const eventKey = `${row.id}:billing_forced_private:${access.effectiveAt ?? now.toISOString()}`;
          const inserted = await client.query(
            `insert into subscription_lifecycle_events(id,event_key,site_id,action,from_status,to_status,details,occurred_at)
             values($1,$2,$3,'billing_forced_private',$4,$4,$5,$6) on conflict(event_key) do nothing returning id`,
            [randomUUID(), eventKey, row.id, row.status ?? null,
              JSON.stringify({ publicationIntent: "public", accessState: access.state }), access.effectiveAt ?? now.toISOString()],
          );
          if (inserted.rows[0]) observed += 1;
        }
      }
      await client.query("commit");
      return observed;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async deleteExpiredDemos() {
    if (this.operationBoundary === "system") {
      const result = await this.pool.query("select cleanup_expired_demo_batch('expired_demo_maintenance',100) value");
      const value = result.rows[0]?.value as { deletedSites?: number } | null | undefined;
      if (!value) throw new Error("Cleanup operation was rejected.");
      return Number(value.deletedSites ?? 0);
    }
    await this.reconcileLifecycleStates();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const expired = await client.query(
        "select d.prepared_profile_id,s.lead_id,s.onboarding_source from sites s join demo_sites d on d.site_id=s.id where s.activated_at is null and s.trial_recovery_ends_at <= now() and not exists (select 1 from site_subscriptions sub where sub.site_id=s.id) and not exists (select 1 from subscriber_intakes intake where intake.demo_site_id=s.id and intake.status='pending_payment' and intake.updated_at > now()-interval '24 hours') for update",
      );
      const profiles = expired.rows.map(
        (row) => row.prepared_profile_id as string,
      );
      const deleted = await client.query(
        "delete from sites s where activated_at is null and trial_recovery_ends_at <= now() and not exists (select 1 from site_subscriptions sub where sub.site_id=s.id) and not exists (select 1 from subscriber_intakes intake where intake.demo_site_id=s.id and intake.status='pending_payment' and intake.updated_at > now()-interval '24 hours') returning id",
      );
      if (profiles.length)
        await client.query(
          "delete from prepared_business_profiles p where p.id = any($1::text[]) and not exists (select 1 from demo_sites d where d.prepared_profile_id=p.id)",
          [profiles],
        );
      const selfServiceLeads = expired.rows
        .filter((row) => row.onboarding_source === "self_service")
        .map((row) => row.lead_id as string);
      if (selfServiceLeads.length)
        await client.query(
          "delete from leads l where l.id = any($1::text[]) and not exists (select 1 from sites s where s.lead_id=l.id)",
          [selfServiceLeads],
        );
      await client.query(
        "delete from api_rate_limits where updated_at < now() - interval '2 days'",
      );
      await client.query(
        "delete from tenant_usage_counters where window_start < now() - interval '14 months'",
      );
      await client.query(
        "delete from tenant_usage_events where created_at < now() - interval '90 days'",
      );
      await client.query(
        "delete from tenant_concurrency_leases where expires_at < now()",
      );
      await client.query(
        "delete from finder_search_cache where expires_at < now()",
      );
      await client.query("commit");
      return deleted.rowCount ?? 0;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async updateDocument(siteId: string, document: SiteDocument, section: CoreEditorSection = "content") {
    const access = await this.getSubscriptionAccess(siteId);
    const allowed = Boolean(access?.canEditCoreContent && (section !== "media" || access.canUploadMedia));
    if (!allowed) throw new Error("Website editing is unavailable for this subscription.");
    const result = await this.pilotSiteQuery(siteId, (client) => client.query(
      "update sites set generated_document=$2 where id=$1 returning id",
      [siteId, JSON.stringify(document)],
    ));
    if (!result.rows[0]) throw new Error("Website editing is unavailable for this subscription.");
    return document;
  }
  async updateDocumentForAuthenticatedSession(
    sessionHash: string,
    slug: string,
    document: SiteDocument,
    section: CoreEditorSection = "content",
  ) {
    const result = await this.withAuthenticatedSiteAdmin(sessionHash, async (client, admin) => {
      const site = await client.query("select id from sites where slug=$1", [slug]);
      if (site.rows[0]?.id !== admin.siteId) return null;
      const access = await this.scopedSubscriptionAccess(client);
      if (!access?.canEditCoreContent || (section === "media" && !access.canUploadMedia)) return null;
      const updated = await client.query(
        "update sites set generated_document=$2 where id=$1 returning id",
        [admin.siteId, JSON.stringify(document)],
      );
      return updated.rows[0] ? document : null;
    });
    if (!result) throw new Error("Website editing is unavailable for this subscription.");
    return result;
  }
  async startAiRun(input: {
    actorType: AiRun["actorType"];
    actorId: string;
    operation: AiRun["operation"];
    leadId?: string;
    siteId?: string;
    provider: string;
    model: string;
    input: Record<string, unknown>;
  }) {
    if (this.operationBoundary === "site_admin" && this.operationSessionHash && input.siteId) {
      const result = await this.pool.query("select site_admin_ai_start($1,$2,$3,$4,$5::jsonb) as id", [
        this.operationSessionHash, input.siteId, input.provider, input.model, JSON.stringify(input.input),
      ]);
      if (!result.rows[0]?.id) throw new Error("AI run authorization was rejected.");
      return result.rows[0].id as string;
    }
    if (this.operationBoundary === "owner" && this.operationSessionHash && input.leadId) {
      const result = await this.pool.query("select owner_ai_start($1,$2,$3,$4,$5::jsonb) as id", [
        this.operationSessionHash, input.leadId, input.provider, input.model, JSON.stringify(input.input),
      ]);
      if (!result.rows[0]?.id) throw new Error("AI run authorization was rejected.");
      return result.rows[0].id as string;
    }
    const id = randomUUID();
    await this.pool.query(
      "insert into ai_runs(id,actor_type,actor_id,operation,lead_id,site_id,provider,model,input) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, input.actorType, input.actorId, input.operation, input.leadId ?? null, input.siteId ?? null, input.provider, input.model, JSON.stringify(input.input)],
    );
    return id;
  }
  async completeAiRun(id: string, output: unknown, usage: Record<string, unknown>, providerResponseId: string) {
    if ((this.operationBoundary === "site_admin" || this.operationBoundary === "owner") && this.operationSessionHash) {
      const routine = this.operationBoundary === "owner" ? "owner_ai_finish" : "site_admin_ai_finish";
      const result = await this.pool.query(`select ${routine}($1,$2,'completed',$3::jsonb) as ok`, [this.operationSessionHash, id, JSON.stringify({ output, usage, providerResponseId })]);
      if (!result.rows[0]?.ok) throw new Error("AI run completion was rejected.");
      return;
    }
    await this.pool.query(
      "update ai_runs set status='completed',output=$2,usage=$3,provider_response_id=$4,completed_at=now() where id=$1 and status='pending'",
      [id, JSON.stringify(output), JSON.stringify(usage), providerResponseId],
    );
  }
  async failAiRun(id: string, error: string) {
    if ((this.operationBoundary === "site_admin" || this.operationBoundary === "owner") && this.operationSessionHash) {
      const routine = this.operationBoundary === "owner" ? "owner_ai_finish" : "site_admin_ai_finish";
      await this.pool.query(`select ${routine}($1,$2,'failed',$3::jsonb)`, [this.operationSessionHash, id, JSON.stringify({ error: error.slice(0, 1000) })]);
      return;
    }
    await this.pool.query(
      "update ai_runs set status='failed',error=$2,completed_at=now() where id=$1 and status='pending'",
      [id, error.slice(0, 1000)],
    );
  }
  async getAiRun(id: string) {
    if (this.operationBoundary === "owner" && this.operationSessionHash) {
      const result = await this.pool.query("select owner_ai_get($1,$2) as value", [this.operationSessionHash, id]);
      return (result.rows[0]?.value as AiRun | null | undefined) ?? null;
    }
    const result = await this.pool.query("select * from ai_runs where id=$1", [id]);
    const row = result.rows[0];
    return row ? ({
      id: row.id, actorType: row.actor_type, actorId: row.actor_id, operation: row.operation,
      leadId: row.lead_id ?? undefined, siteId: row.site_id ?? undefined, provider: row.provider,
      model: row.model, status: row.status, input: row.input ?? {}, output: row.output ?? undefined,
      usage: row.usage ?? {}, providerResponseId: row.provider_response_id ?? undefined,
      error: row.error ?? undefined, appliedSiteId: row.applied_site_id ?? undefined,
      createdAt: row.created_at.toISOString(),
    } as AiRun) : null;
  }
  async markAiRunApplied(id: string, siteId: string) {
    if (this.operationBoundary === "owner" && this.operationSessionHash) {
      const result = await this.pool.query("select owner_ai_apply($1,$2,$3) as site_id", [this.operationSessionHash, id, siteId]);
      return result.rows[0]?.site_id as string | undefined;
    }
    const result = await this.pool.query(
      "update ai_runs set status='applied',applied_site_id=$2,applied_at=now() where id=$1 and status='completed' returning applied_site_id",
      [id, siteId],
    );
    if (result.rows[0]) return siteId;
    const existing = await this.pool.query("select applied_site_id from ai_runs where id=$1", [id]);
    return existing.rows[0]?.applied_site_id as string | undefined;
  }
  async createOrUpdateAdmin(
    siteId: string,
    email: string,
    passwordHash: string,
    preferredLocale: "en" | "de" = "en",
  ) {
    if (this.operationBoundary === "owner") {
      if (!this.operationSessionHash) throw new Error("Owner website authorization is required.");
      const identity = await this.pool.query("select owner_demo_site_identity($1,$2) value", [this.operationSessionHash, siteId]);
      const slug = identity.rows[0]?.value?.slug as string | undefined;
      if (!slug) throw new Error("Website not found.");
      const result = await this.pool.query("select owner_demo_configure_admin($1,$2,$3,$4,$5,$6) value", [this.operationSessionHash, slug, email, passwordHash, preferredLocale, this.operationCorrelationId]);
      const value = result.rows[0]?.value as Record<string, unknown> | null | undefined;
      if (!value) throw new Error("Business administrator configuration was rejected.");
      return { id: String(value.id), siteId: String(value.siteId), email: String(value.email), passwordHash, preferredLocale: value.preferredLocale as "en" | "de" } as SiteAdminAccount;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const id = randomUUID();
      const result = await client.query(
        "insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values($1,$2,$3,$4,$5) on conflict(site_id) do update set email=excluded.email,password_hash=excluded.password_hash,preferred_locale=excluded.preferred_locale,updated_at=now() returning id,site_id,email,password_hash,preferred_locale",
        [id, siteId, email.trim().toLowerCase(), passwordHash, preferredLocale],
      );
      const row = result.rows[0];
      await client.query(
        "delete from site_admin_sessions where account_id=$1",
        [row.id],
      );
      await client.query(
        `insert into site_editorial_memberships(account_id,site_id,role,granted_by)
         select $1,$2,'administrator','site-admin-account' from sites where id=$2 and site_kind='information'
         on conflict(account_id,site_id) do nothing`,
        [row.id, row.site_id],
      );
      await client.query("commit");
      return {
        id: row.id,
        siteId: row.site_id,
        email: row.email,
        passwordHash: row.password_hash,
        preferredLocale: row.preferred_locale,
      } as SiteAdminAccount;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async getAdminByEmail(email: string) {
    const client = databaseRlsMode() !== "off" ? this.customerRuntimePool() : this.pool;
    const result = await client.query(
      databaseRlsMode() !== "off"
        ? "select account_id as id,site_id,email,password_hash,preferred_locale from site_admin_login_lookup($1)"
        : "select id,site_id,email,password_hash,preferred_locale from site_admin_accounts where email=$1",
      [email.trim().toLowerCase()],
    );
    const row = result.rows[0];
    return row
      ? ({
          id: row.id,
          siteId: row.site_id,
          email: row.email,
          passwordHash: row.password_hash,
          preferredLocale: row.preferred_locale,
        } as SiteAdminAccount)
      : null;
  }
  async getAdminBySiteId(siteId: string) {
    const result = await this.pool.query(
      "select id,site_id,email,password_hash,preferred_locale from site_admin_accounts where site_id=$1",
      [siteId],
    );
    const row = result.rows[0];
    return row
      ? ({
          id: row.id,
          siteId: row.site_id,
          email: row.email,
          passwordHash: row.password_hash,
          preferredLocale: row.preferred_locale,
        } as SiteAdminAccount)
      : null;
  }
  async createAdminSession(
    accountId: string,
    tokenHash: string,
    expiresAt: string,
    expectedPasswordHash?: string,
  ) {
    if (databaseRlsMode() !== "off") {
      if (!expectedPasswordHash)
        throw new Error("A verified password hash is required to create a runtime session.");
      const result = await this.customerRuntimePool().query(
        "select site_admin_create_session($1,$2,$3,$4) as created",
        [accountId, expectedPasswordHash, tokenHash, expiresAt],
      );
      if (!result.rows[0]?.created) throw new Error("Session creation was rejected.");
      return;
    }
    await this.pool.query(
      "delete from site_admin_sessions where expires_at <= now()",
    );
    await this.pool.query(
      "insert into site_admin_sessions(id,account_id,token_hash,expires_at) values($1,$2,$3,$4)",
      [randomUUID(), accountId, tokenHash, expiresAt],
    );
  }
  async revokeAdminSession(tokenHash: string) {
    if (databaseRlsMode() !== "off") {
      const result = await this.customerRuntimePool().query(
        "select site_admin_revoke_session($1) as revoked", [tokenHash],
      );
      return Boolean(result.rows[0]?.revoked);
    }
    const result = await this.pool.query(
      "delete from site_admin_sessions where token_hash=$1 returning id",
      [tokenHash],
    );
    return Boolean(result.rows[0]);
  }
  async getAdminSession(tokenHash: string) {
    const client = databaseRlsMode() !== "off" ? this.customerRuntimePool() : this.pool;
    const result = await client.query(
      databaseRlsMode() !== "off"
        ? "select * from site_admin_resolve_session($1)"
        : "select a.id as account_id,a.site_id,a.email,a.preferred_locale from site_admin_sessions s join site_admin_accounts a on a.id=s.account_id where s.token_hash=$1 and s.expires_at > now() and a.status='active'",
      [tokenHash],
    );
    return result.rows[0]
      ? {
          accountId: result.rows[0].account_id as string,
          siteId: result.rows[0].site_id as string,
          email: result.rows[0].email as string,
          preferredLocale: result.rows[0].preferred_locale as "en" | "de",
        }
      : null;
  }
  async createPasswordReset(accountId: string, resetTokenHash: string, expiresAt: string) {
    if (databaseRlsMode() !== "off") {
      const result = await this.customerRuntimePool().query(
        "select site_admin_create_password_reset($1,$2,$3) as created",
        [accountId, resetTokenHash, expiresAt],
      );
      if (!result.rows[0]?.created) throw new Error("Password reset creation was rejected.");
      return;
    }
    await this.pool.query(
      "delete from site_admin_password_resets where account_id=$1 and used_at is null",
      [accountId],
    );
    await this.pool.query(
      "insert into site_admin_password_resets(id,account_id,token_hash,expires_at) values($1,$2,$3,$4)",
      [randomUUID(), accountId, resetTokenHash, expiresAt],
    );
  }
  async consumePasswordReset(resetTokenHash: string, passwordHash: string) {
    if (databaseRlsMode() !== "off") {
      const result = await this.customerRuntimePool().query(
        "select site_admin_consume_password_reset($1,$2) as consumed",
        [resetTokenHash, passwordHash],
      );
      return Boolean(result.rows[0]?.consumed);
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const token = await client.query(
        "select account_id from site_admin_password_resets where token_hash=$1 and used_at is null and expires_at > now() for update",
        [resetTokenHash],
      );
      const accountId = token.rows[0]?.account_id as string | undefined;
      if (!accountId) {
        await client.query("rollback");
        return false;
      }
      await client.query(
        "update site_admin_accounts set password_hash=$2,updated_at=now() where id=$1",
        [accountId, passwordHash],
      );
      await client.query(
        "update site_admin_password_resets set used_at=now() where token_hash=$1",
        [resetTokenHash],
      );
      await client.query(
        "delete from site_admin_sessions where account_id=$1",
        [accountId],
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async createAppointment(
    input: Omit<SiteAppointment, "id" | "createdAt" | "status">,
  ) {
    const access = await this.getSubscriptionAccess(input.siteId);
    if (!access?.canReceiveAppointmentRequests)
      throw new Error("Appointment requests are unavailable for this website.");
    const result = await this.pool.query(
      `insert into site_appointments(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,note)
       select $1,s.id,$3,$4,$5,$6,$7,$8,$9
       from sites s
       where s.id=$2
       returning id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,note,status,created_at`,
      [
        randomUUID(),
        input.siteId,
        input.customerName,
        input.phone,
        input.email ?? null,
        input.serviceTitle ?? null,
        input.preferredDate ?? null,
        input.preferredTime ?? null,
        input.note ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Appointment requests are unavailable for this website.");
    return {
      id: row.id,
      siteId: row.site_id,
      customerName: row.customer_name,
      phone: row.phone,
      email: row.email ?? undefined,
      serviceTitle: row.service_title ?? undefined,
      preferredDate:
        row.preferred_date?.toISOString?.().slice(0, 10) ?? undefined,
      preferredTime: row.preferred_time ?? undefined,
      note: row.note ?? undefined,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    } as SiteAppointment;
  }
  async createDurableAppointment(siteId: string, input: AppointmentV1Input, capability: string,
    quotasByPlan: Record<string, Array<{ window: string; limit: number }>>) {
    const config = appointmentFingerprintKeys();
    const digest = appointmentReceiptDigest(capability);
    const fingerprints = appointmentFingerprints(siteId, input, config);
    const result = await this.customerRuntimePool().query(
      "select public_appointment_create_v1($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb) value",
      [input.slug, siteId, digest, JSON.stringify(input), config.activeVersion,
        JSON.stringify(fingerprints), JSON.stringify(quotasByPlan)],
    );
    return result.rows[0]?.value as AppointmentV1Result | undefined;
  }
  async getAppointmentReceipt(slug: string, siteId: string, capability: string) {
    const config = appointmentFingerprintKeys();
    const result = await this.customerRuntimePool().query(
      "select public_appointment_receipt_v1($1,$2,$3,$4::text[]) value",
      [slug, siteId, appointmentReceiptDigest(capability), [...config.keys.keys()]],
    );
    return result.rows[0]?.value as AppointmentV1Result | undefined;
  }
  async createPublicAppointmentBySlug(
    slug: string,
    input: Omit<SiteAppointment, "id" | "siteId" | "createdAt" | "status">,
  ) {
    if (databaseRlsMode() === "off") {
      const site = await this.getPublicBySlug(slug);
      if (!site) throw new Error("Appointment requests are unavailable for this website.");
      if (!(await this.hasCapabilityAccess(site.id, "appointment_requests")))
        throw new Error("Appointment requests are unavailable for this website.");
      const result = await this.pool.query(
        `insert into site_appointments(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,customer_message)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,customer_message,status,created_at`,
        [randomUUID(),site.id,input.customerName,input.phone,input.email ?? null,input.serviceTitle ?? null,
          input.preferredDate ?? null,input.preferredTime ?? null,input.note ?? null],
      );
      const row = result.rows[0];
      return {
        id: row.id,siteId: row.site_id,customerName: row.customer_name,phone: row.phone,
        email: row.email ?? undefined,serviceTitle: row.service_title ?? undefined,
        preferredDate: row.preferred_date?.toISOString?.().slice(0,10) ?? undefined,
        preferredTime: row.preferred_time ?? undefined,note: row.customer_message ?? undefined,
        status: row.status,createdAt: row.created_at.toISOString(),
      } as SiteAppointment;
    }
    const result = await this.customerRuntimePool().query(
      "select * from create_public_appointment_request($1,$2,$3,$4,$5,$6,$7,$8)",
      [slug,input.customerName,input.phone,input.email ?? null,input.serviceTitle ?? null,
        input.preferredDate ?? null,input.preferredTime ?? null,input.note ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Appointment requests are unavailable for this website.");
    return {
      id: row.appointment_id,
      siteId: row.site_id,
      customerName: row.customer_name,
      phone: row.phone,
      email: row.email ?? undefined,
      serviceTitle: row.service_title ?? undefined,
      preferredDate: row.preferred_date?.toISOString?.().slice(0, 10) ?? undefined,
      preferredTime: row.preferred_time ?? undefined,
      note: row.message ?? undefined,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    } as SiteAppointment;
  }
  async listAppointments(siteId: string) {
    const result = await this.pilotSiteQuery(siteId, (client) => client.query(
      "select id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,coalesce(customer_message,note) as note,status,created_at from site_appointments where site_id=$1 order by created_at desc",
      [siteId],
    ));
    return result.rows.map(
      (row) =>
        ({
          id: row.id,
          siteId: row.site_id,
          customerName: row.customer_name,
          phone: row.phone,
          email: row.email ?? undefined,
          serviceTitle: row.service_title ?? undefined,
          preferredDate:
            row.preferred_date?.toISOString?.().slice(0, 10) ?? undefined,
          preferredTime: row.preferred_time ?? undefined,
          note: row.note ?? undefined,
          status: row.status,
          createdAt: row.created_at.toISOString(),
        }) as SiteAppointment,
    );
  }
  async saveMediaBlob(siteId: string, filename: string, data: Buffer) {
    if (this.operationBoundary === "system" && this.operationIntegrationId) {
      const result = await this.pool.query("select information_redi_media_blob_insert($1,$2,$3,$4) as id", [this.operationIntegrationId, siteId, filename, data]);
      if (!result.rows[0]?.id) throw new Error("Information media persistence was rejected.");
      return result.rows[0].id as string;
    }
    const id = randomUUID();
    await this.pool.query(
      "insert into site_media_blobs(id,site_id,filename,content_type,data) values($1,$2,$3,'image/webp',$4)",
      [id, siteId, filename, data],
    );
    return id;
  }
  async saveMediaBlobForAuthenticatedSession(
    sessionHash: string,
    slug: string,
    filename: string,
    data: Buffer,
  ) {
    const id = randomUUID();
    const stored = await this.withAuthenticatedSiteAdmin(sessionHash, async (client, admin) => {
      const site = await client.query("select id from sites where slug=$1", [slug]);
      if (site.rows[0]?.id !== admin.siteId) return false;
      const access = await this.scopedSubscriptionAccess(client);
      if (!access?.canUploadMedia) return false;
      await client.query(
        "insert into site_media_blobs(id,site_id,filename,content_type,data) values($1,$2,$3,'image/webp',$4)",
        [id, admin.siteId, filename, data],
      );
      return true;
    });
    if (!stored) throw new Error("Media upload is unavailable for this subscription.");
    return id;
  }
  async registerBusinessProviderMediaForAuthenticatedSession(input: {
    sessionHash: string;
    slug: string;
    providerAuthority: string;
    storageKey: string;
    publicUrl: string;
    contentType: string;
    byteSize: number;
  }) {
    const result = await this.pool.query(
      "select site_admin_register_business_provider_media($1,$2,$3,$4,$5,$6,$7) id",
      [input.sessionHash,input.slug,input.providerAuthority,input.storageKey,input.publicUrl,input.contentType,input.byteSize],
    );
    const id = result.rows[0]?.id as string | undefined;
    if (!id) throw new Error("Provider media registration was rejected.");
    return id;
  }
  async getMediaBlob(id: string) {
    const result = this.operationBoundary === "runtime"
      ? await this.pool.query("select site_id,'business'::text site_kind,content_type,data from resolve_public_business_media_blob($1)", [id])
      : await this.pool.query(
        `select blob.site_id,site.site_kind,blob.content_type,blob.data
         from site_media_blobs blob join sites site on site.id=blob.site_id
         where blob.id=$1`, [id]);
    return result.rows[0]
      ? {
          siteId: result.rows[0].site_id as string,
          siteKind: result.rows[0].site_kind as "business" | "information",
          contentType: result.rows[0].content_type as string,
          data: result.rows[0].data as Buffer,
        }
      : null;
  }
  async createSubscriberIntake(
    input: Omit<SubscriberIntake, "id" | "status" | "createdAt" | "checkoutAttempt" | "billingProvider" | "siteAdminAccountId" | "checkoutPriceId"> & {
      billingProvider?: BillingProvider;
      siteAdminAccountId: string;
      checkoutPriceId: string;
      b2bEvidence: B2BCheckoutEvidenceInput;
      sessionHash?: string;
      expectedSlug?: string;
    },
  ) {
    if (databaseRlsMode() !== "off") {
      if (!input.sessionHash || !input.expectedSlug || !input.demoSiteId)
        throw new Error("Trusted checkout session provenance is unavailable.");
      const evidence = input.b2bEvidence;
      const result = await this.customerRuntimePool().query(
        `select * from billing_prepare_starter_checkout(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )`,
        [input.sessionHash,input.demoSiteId,input.expectedSlug,input.checkoutPriceId,
          evidence.legalBusinessName,evidence.countryCode,evidence.businessType,
          evidence.vatIdNormalized ?? null,evidence.vatSyntaxPlausible,evidence.locale,
          evidence.b2bAttestationVersion,evidence.authorityAttestationVersion,
          evidence.automaticRenewalVersion,evidence.privacyAcknowledgementVersion,
          evidence.promotionTermsVersion ?? null,evidence.currency,
          evidence.priceTaxLabelSnapshot,evidence.normalPriceDisplaySnapshot,evidence.trialDurationDays],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Checkout preparation was denied.");
      return {
        id: row.intake_id,email: row.email,businessName: evidence.legalBusinessName,
        demoSiteId: input.demoSiteId,siteAdminAccountId: input.siteAdminAccountId,
        planKey: "starter" as const,billingProvider: "stripe" as const,
        checkoutPriceId: input.checkoutPriceId,status: row.intake_status,
        checkoutAttempt: Number(row.checkout_attempt),businessIdentityId: row.business_identity_id,
        contractAcceptanceId: row.contract_acceptance_id,createdAt: new Date().toISOString(),
      } as SubscriberIntake;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const siteId = input.demoSiteId;
      if (!siteId) throw new Error("B2B checkout requires a site-bound identity.");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`b2b-checkout:${siteId}`]);
      const binding = await client.query(
        `select 1 from site_admin_accounts where id=$1 and site_id=$2
           and email=lower(btrim($3)) for update`,
        [input.siteAdminAccountId, siteId, input.email],
      );
      if (!binding.rows[0]) throw new Error("Checkout ownership binding is invalid.");

      const evidence = input.b2bEvidence;
      const currentIdentity = await client.query(
        "select * from customer_business_identities where site_id=$1 and is_current for update",
        [siteId],
      );
      const existingIdentity = currentIdentity.rows[0];
      const identityMatches = Boolean(existingIdentity &&
        existingIdentity.legal_business_name === evidence.legalBusinessName &&
        existingIdentity.country_code === evidence.countryCode &&
        existingIdentity.business_type === evidence.businessType &&
        (existingIdentity.vat_id_normalized ?? undefined) === evidence.vatIdNormalized);
      if (identityMatches && existingIdentity.verification_state === "rejected")
        throw new Error("Business identity is unavailable for checkout.");
      let businessIdentityId = existingIdentity?.id as string | undefined;
      if (!identityMatches) {
        if (existingIdentity)
          await client.query("update customer_business_identities set is_current=false,updated_at=now() where id=$1", [existingIdentity.id]);
        businessIdentityId = randomUUID();
        await client.query(
          `insert into customer_business_identities(
             id,site_id,version,legal_business_name,country_code,business_type,vat_id_normalized,
             verification_state,review_reason_code
           ) values($1,$2,(select coalesce(max(version),0)+1 from customer_business_identities where site_id=$2),
             $3,$4,$5,$6,$7,$8)`,
          [businessIdentityId, siteId, evidence.legalBusinessName, evidence.countryCode,
            evidence.businessType, evidence.vatIdNormalized ?? null,
            evidence.vatSyntaxPlausible ? "self_attested" : "review_required",
            evidence.vatSyntaxPlausible ? null : "vat_syntax_review"],
        );
      }

      let result = await client.query(
        `insert into subscriber_intakes(
           id,email,business_name,demo_site_id,site_admin_account_id,plan_key,
           billing_provider,checkout_price_id,business_identity_id
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(email,demo_site_id) do update set
           business_name=excluded.business_name,
           site_admin_account_id=excluded.site_admin_account_id,
           plan_key=excluded.plan_key,
           billing_provider=excluded.billing_provider,
           checkout_price_id=excluded.checkout_price_id,
           business_identity_id=excluded.business_identity_id,
           checkout_attempt=case when subscriber_intakes.status in ('paid','cancelled') then subscriber_intakes.checkout_attempt + 1 else subscriber_intakes.checkout_attempt end,
           checkout_session_id=case when subscriber_intakes.status in ('paid','cancelled') then null else subscriber_intakes.checkout_session_id end,
           paid_at=case when subscriber_intakes.status in ('paid','cancelled') then null else subscriber_intakes.paid_at end,
           status='pending_payment',updated_at=now()
         returning *`,
        [randomUUID(), input.email.toLowerCase(), evidence.legalBusinessName, siteId,
          input.siteAdminAccountId, input.planKey, input.billingProvider ?? "stripe",
          input.checkoutPriceId, businessIdentityId],
      );
      let row = result.rows[0];
      const existingAcceptance = await client.query(
        "select * from contract_acceptances where intake_id=$1 and checkout_attempt=$2 and source='site_admin_checkout'",
        [row.id, row.checkout_attempt],
      );
      const accepted = existingAcceptance.rows[0];
      const acceptanceMatches = Boolean(accepted &&
        accepted.business_identity_id === businessIdentityId &&
        accepted.terms_version === evidence.terms.version &&
        accepted.terms_content_hash === evidence.terms.contentHash &&
        accepted.privacy_version === evidence.privacy.version &&
        accepted.privacy_content_hash === evidence.privacy.contentHash &&
        accepted.b2b_attestation_version === evidence.b2bAttestationVersion &&
        accepted.authority_attestation_version === evidence.authorityAttestationVersion &&
        accepted.automatic_renewal_version === evidence.automaticRenewalVersion &&
        accepted.privacy_acknowledgement_version === evidence.privacyAcknowledgementVersion &&
        (accepted.promotion_terms_version ?? undefined) === evidence.promotionTermsVersion &&
        Number(accepted.platform_legal_config_version) === evidence.commercialConfigVersion &&
        accepted.plan_key === input.planKey && accepted.billing_provider === (input.billingProvider ?? "stripe") &&
        accepted.checkout_price_id === input.checkoutPriceId && accepted.currency === evidence.currency &&
        accepted.tax_display_mode === evidence.taxDisplayMode &&
        accepted.price_tax_label_snapshot === evidence.priceTaxLabelSnapshot &&
        accepted.normal_price_display_snapshot === evidence.normalPriceDisplaySnapshot &&
        Number(accepted.trial_duration_days) === evidence.trialDurationDays &&
        accepted.billing_interval === evidence.billingInterval);
      if (accepted && !acceptanceMatches) {
        result = await client.query(
          `update subscriber_intakes set checkout_attempt=checkout_attempt+1,
             checkout_session_id=null,contract_acceptance_id=null,updated_at=now()
           where id=$1 returning *`,
          [row.id],
        );
        row = result.rows[0];
      }
      let contractAcceptanceId = acceptanceMatches ? accepted.id as string : randomUUID();
      if (!acceptanceMatches) {
        const inserted = await client.query(
          `insert into contract_acceptances(
             id,intake_id,checkout_attempt,site_id,actor_account_id,business_identity_id,
             terms_document_key,terms_version,terms_content_hash,
             privacy_document_key,privacy_version,privacy_content_hash,
             b2b_attestation_version,authority_attestation_version,automatic_renewal_version,
             privacy_acknowledgement_version,promotion_terms_version,platform_legal_config_version,
             plan_key,billing_provider,checkout_price_id,currency,tax_display_mode,
             price_tax_label_snapshot,normal_price_display_snapshot,trial_duration_days,billing_interval,
             locale,source
           ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'site_admin_checkout')
           on conflict(intake_id,checkout_attempt,source) do nothing returning id`,
          [contractAcceptanceId, row.id, row.checkout_attempt, siteId, input.siteAdminAccountId,
            businessIdentityId, evidence.terms.documentKey, evidence.terms.version,
            evidence.terms.contentHash, evidence.privacy.documentKey, evidence.privacy.version,
            evidence.privacy.contentHash, evidence.b2bAttestationVersion,
            evidence.authorityAttestationVersion, evidence.automaticRenewalVersion,
            evidence.privacyAcknowledgementVersion, evidence.promotionTermsVersion ?? null,
            evidence.commercialConfigVersion, input.planKey, input.billingProvider ?? "stripe",
            input.checkoutPriceId, evidence.currency, evidence.taxDisplayMode,
            evidence.priceTaxLabelSnapshot, evidence.normalPriceDisplaySnapshot,
            evidence.trialDurationDays, evidence.billingInterval, evidence.locale],
        );
        if (!inserted.rows[0]) {
          const concurrent = await client.query(
            "select id from contract_acceptances where intake_id=$1 and checkout_attempt=$2 and source='site_admin_checkout'",
            [row.id, row.checkout_attempt],
          );
          contractAcceptanceId = concurrent.rows[0].id;
        }
      }
      await client.query(
        "update subscriber_intakes set business_identity_id=$2,contract_acceptance_id=$3 where id=$1",
        [row.id, businessIdentityId, contractAcceptanceId],
      );
      await client.query("commit");
      return {
        id: row.id, email: row.email, businessName: row.business_name ?? undefined,
        demoSiteId: row.demo_site_id ?? undefined, siteAdminAccountId: row.site_admin_account_id ?? undefined,
        planKey: row.plan_key, billingProvider: row.billing_provider,
        checkoutPriceId: row.checkout_price_id ?? undefined, status: row.status,
        checkoutAttempt: Number(row.checkout_attempt), businessIdentityId,
        contractAcceptanceId, createdAt: row.created_at.toISOString(),
      } as SubscriberIntake;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }
  async healthCheck() {
    if (databaseRlsMode() === "enforced") {
      const ready = (await this.pool.query("select database_enforced_readiness() as ready")).rows[0]?.ready;
      if (!ready) throw new Error("Enforced database invariants are not ready.");
      return true;
    }
    await this.pool.query("select 1");
    return true;
  }
  async readWebsiteImportAnalysisCache(cacheKey: string) {
    if (this.operationBoundary !== "runtime") throw new Error("Runtime boundary is required for the import analysis cache.");
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) return null;
    const result = await this.pool.query(
      "select * from website_import_cache_read($1)",
      [cacheKey],
    );
    const row = result.rows[0];
    if (!row?.cache_key) return null;
    return {
      cacheKey: row.cache_key as string,
      sourceUrl: row.source_url as string,
      model: row.model as string,
      payload: row.payload as { understanding?: unknown; plan?: unknown },
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  async writeWebsiteImportAnalysisCache(input: {
    cacheKey: string; sourceUrl: string; model: string;
    understanding: unknown; plan: unknown;
  }) {
    if (this.operationBoundary !== "runtime") throw new Error("Runtime boundary is required for the import analysis cache.");
    if (!/^[a-f0-9]{64}$/.test(input.cacheKey)) throw new Error("Invalid analysis cache key.");
    await this.pool.query(
      "select website_import_cache_write($1,$2,$3,$4) as ok",
      [input.cacheKey, input.sourceUrl, input.model, JSON.stringify({ understanding: input.understanding, plan: input.plan })],
    );
  }

  async consumeRateLimit(input: {
    scope: string;
    subjectKey: string;
    limit: number;
    windowSeconds: number;
  }) {
    if (this.operationBoundary === "runtime") {
      const result = await this.pool.query("select consume_api_rate_limit($1,$2,$3,$4) value", [input.scope, input.subjectKey, input.limit, input.windowSeconds]);
      const value = result.rows[0]?.value as { allowed: boolean; retryAfterSeconds: number } | null | undefined;
      if (!value) return { allowed: false, retryAfterSeconds: input.windowSeconds };
      return value;
    }
    const now = new Date();
    const windowMs = input.windowSeconds * 1000;
    const windowStart = new Date(
      Math.floor(now.getTime() / windowMs) * windowMs,
    ).toISOString();
    const result = await this.pool.query(
      "insert into api_rate_limits(scope,subject_key,window_start,request_count) values($1,$2,$3,1) on conflict(scope,subject_key,window_start) do update set request_count=api_rate_limits.request_count + 1,updated_at=now() where api_rate_limits.request_count < $4 returning request_count",
      [input.scope, input.subjectKey, windowStart, input.limit],
    );
    return {
      allowed: Boolean(result.rows[0]),
      retryAfterSeconds: input.windowSeconds - Math.floor((Date.now() % windowMs) / 1000),
    };
  }
}
