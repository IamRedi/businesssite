import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { generateSiteDocument, type PreparedBusinessProfile } from "@platform/website-engine";
import { PostgresSiteRepository, SiteAdminAccountConflictError } from "../src/index";

const connectionString = process.env.DATABASE_URL;
const runDatabaseTests = Boolean(connectionString);
const b2bEvidence = (legalBusinessName: string) => ({
  legalBusinessName,
  countryCode: "DE",
  businessType: "sole_proprietor" as const,
  vatSyntaxPlausible: true,
  locale: "en" as const,
  terms: { documentKey: "terms" as const, locale: "en", version: "integration-terms-v1", contentHash: "a".repeat(64) },
  privacy: { documentKey: "privacy" as const, locale: "en", version: "integration-privacy-v1", contentHash: "b".repeat(64) },
  b2bAttestationVersion: "integration-b2b-v1",
  authorityAttestationVersion: "integration-authority-v1",
  automaticRenewalVersion: "integration-renewal-v1",
  privacyAcknowledgementVersion: "integration-privacy-ack-v1",
  commercialConfigVersion: 0,
  currency: "EUR" as const,
  taxDisplayMode: "net_plus_tax" as const,
  priceTaxLabelSnapshot: "plus VAT",
  normalPriceDisplaySnapshot: "€29 / month",
  trialDurationDays: 14,
  billingInterval: "month" as const,
});

describe.runIf(runDatabaseTests)("PostgresSiteRepository", () => {
  const suffix = randomUUID();
  const email = `integration-${suffix}@example.test`;
  const leadId = `self-integration-${suffix}`;
  const profileId = `prepared-${leadId}-v1`;
  const profile: PreparedBusinessProfile = {
    id: profileId,
    version: 1,
    sourceLeadId: leadId,
    locale: "en",
    preparedAt: new Date().toISOString(),
    approvedSources: [],
    business: { name: `Integration Demo ${suffix.slice(0, 8)}`, category: "Hair salon", email },
    services: [],
  };
  let repository: PostgresSiteRepository;
  let pool: Pool;
  let siteId = "";

  beforeAll(async () => {
    repository = new PostgresSiteRepository(connectionString);
    pool = new Pool({ connectionString });
    const site = generateSiteDocument(profile);
    site.id = `site-integration-${suffix}`;
    const trial = await repository.createSelfServiceTrial({
      site,
      profile,
      leadId,
      preparedProfileId: profileId,
      email,
      passwordHash: "test-password-hash",
      trialDurationDays: 3,
      preferredLocale: "en",
    });
    siteId = trial.site.id;
  });

  afterAll(async () => {
    // Contract evidence is deliberately immutable and site-bound. The required
    // DB verification runs against a disposable PostgreSQL instance, so this
    // fixture is removed with that instance rather than bypassing the trigger.
    await pool.end();
  });

  it("persists a trial, admin account and available preview", async () => {
    const site = await repository.getBySlug(`integration-demo-${suffix.slice(0, 8)}`);
    expect(site?.profileId).toBe(profileId);
    expect(await repository.getAdminByEmail(email)).toMatchObject({ siteId });
    expect(await repository.isSiteAvailable(siteId)).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "editor")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "media")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "ai_rewrite")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "appointment_requests")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "custom_domain_existing")).toBe(false);
    await expect(repository.createAppointment({ siteId, customerName: "Trial Customer", phone: "+49111" }))
      .resolves.toMatchObject({ siteId, status: "requested" });
  });

  it("retains expired trials during recovery and never cleans a paid site", async () => {
    const cleanupLeadId = `cleanup-lead-${suffix}`;
    const cleanupProfile = {
      ...profile,
      id: `cleanup-profile-${suffix}`,
      sourceLeadId: cleanupLeadId,
      business: { ...profile.business, name: `Cleanup Guard ${suffix.slice(0, 8)}`, email: `cleanup-${email}` },
    };
    const cleanupSite = generateSiteDocument(cleanupProfile);
    cleanupSite.id = `cleanup-site-${suffix}`;
    const created = await repository.createSelfServiceTrial({
      site: cleanupSite,
      profile: cleanupProfile,
      leadId: cleanupLeadId,
      preparedProfileId: cleanupProfile.id,
      email: cleanupProfile.business.email!,
      passwordHash: "cleanup-password-hash",
      trialDurationDays: 3,
      preferredLocale: "de",
    });
    try {
      await pool.query(
        "update sites set demo_expires_at=now()-interval '2 days',trial_recovery_ends_at=now()+interval '1 day' where id=$1",
        [created.site.id],
      );
      expect(await repository.deleteExpiredDemos()).toBe(0);
      expect((await pool.query("select id from sites where id=$1", [created.site.id])).rows[0]).toBeTruthy();

      const cleanupAdmin = await repository.getAdminBySiteId(created.site.id);
      const pendingIntake = { id: randomUUID() };
      await pool.query(
        `insert into subscriber_intakes(id,email,business_name,demo_site_id,site_admin_account_id,
           plan_key,billing_provider,checkout_price_id)
         values($1,$2,$3,$4,$5,'starter','stripe','price-starter')`,
        [pendingIntake.id, cleanupProfile.business.email, cleanupProfile.business.name,
          created.site.id, cleanupAdmin!.id],
      );
      await pool.query(
        "update sites set trial_recovery_ends_at=now()-interval '1 day' where id=$1",
        [created.site.id],
      );
      expect(await repository.deleteExpiredDemos()).toBe(0);
      expect((await pool.query("select id from sites where id=$1", [created.site.id])).rows[0]).toBeTruthy();
      await pool.query(
        "update subscriber_intakes set updated_at=now()-interval '25 hours' where id=$1",
        [pendingIntake.id],
      );
      await pool.query(
        "insert into site_subscriptions(site_id,plan_key,status) values($1,'starter','active')",
        [created.site.id],
      );
      expect(await repository.deleteExpiredDemos()).toBe(0);
      expect((await pool.query("select id,generated_document from sites where id=$1", [created.site.id])).rows[0])
        .toMatchObject({ id: created.site.id });
      await pool.query("delete from site_subscriptions where site_id=$1", [created.site.id]);
      expect(await repository.deleteExpiredDemos()).toBe(1);
      expect(await repository.deleteExpiredDemos()).toBe(0);
      expect((await pool.query("select id from sites where id=$1", [created.site.id])).rows[0]).toBeUndefined();
    } finally {
      await pool.query("delete from site_subscriptions where site_id=$1", [created.site.id]);
      await pool.query("delete from sites where id=$1", [created.site.id]);
      await pool.query("delete from leads where id=$1", [cleanupLeadId]);
    }
  });

  it("rejects casing and whitespace variants of an existing signup without identity details", async () => {
    const duplicateProfile = {
      ...profile,
      id: `duplicate-profile-${suffix}`,
      sourceLeadId: `duplicate-lead-${suffix}`,
    };
    const duplicateSite = generateSiteDocument(duplicateProfile);
    duplicateSite.id = `duplicate-site-${suffix}`;
    await expect(repository.createSelfServiceTrial({
      site: duplicateSite,
      profile: duplicateProfile,
      leadId: duplicateProfile.sourceLeadId,
      preparedProfileId: duplicateProfile.id,
      email: `  ${email.toUpperCase()}  `,
      passwordHash: "duplicate-password-hash",
      trialDurationDays: 3,
      preferredLocale: "en",
    })).rejects.toEqual(expect.objectContaining({
      name: SiteAdminAccountConflictError.name,
      code: "SITE_ADMIN_ACCOUNT_CONFLICT",
      message: "An account cannot be created with these credentials.",
    }));
    expect(await repository.getAdminByEmail(email)).toMatchObject({ siteId });
  });

  it("revokes a session idempotently so its old cookie fingerprint cannot replay", async () => {
    const account = await repository.getAdminByEmail(email);
    const sessionHash = `logout-session-${suffix}`;
    await repository.createAdminSession(account!.id, sessionHash, new Date(Date.now() + 60_000).toISOString());
    expect(await repository.getAdminSession(sessionHash)).toMatchObject({ accountId: account!.id, siteId });
    expect(await repository.revokeAdminSession(sessionHash)).toBe(true);
    expect(await repository.revokeAdminSession(sessionHash)).toBe(false);
    expect(await repository.getAdminSession(sessionHash)).toBeNull();
  });

  it("changes one account password atomically and revokes only that account's sessions", async () => {
    const account = await repository.getAdminByEmail(email);
    const otherSiteId = `site-auth-other-${suffix}`;
    await pool.query(
      "insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private','private','{}'::jsonb,now() + interval '3 days',now() + interval '33 days')",
      [otherSiteId, `auth-other-${suffix}`],
    );
    const other = await repository.createOrUpdateAdmin(
      otherSiteId,
      `other-auth-${suffix}@example.test`,
      "other-password-hash",
    );
    const ownSessionA = `password-own-a-${suffix}`;
    const ownSessionB = `password-own-b-${suffix}`;
    const otherSession = `password-other-${suffix}`;
    await repository.createAdminSession(account!.id, ownSessionA, new Date(Date.now() + 60_000).toISOString());
    await repository.createAdminSession(account!.id, ownSessionB, new Date(Date.now() + 60_000).toISOString());
    await repository.createAdminSession(other.id, otherSession, new Date(Date.now() + 60_000).toISOString());

    expect(await repository.changeAdminPassword(account!.id, account!.passwordHash, "manual-new-password-hash")).toBe(true);
    expect(await repository.changeAdminPassword(account!.id, account!.passwordHash, "stale-write-hash")).toBe(false);
    expect(await repository.getAdminSession(ownSessionA)).toBeNull();
    expect(await repository.getAdminSession(ownSessionB)).toBeNull();
    expect(await repository.getAdminSession(otherSession)).toMatchObject({ accountId: other.id, siteId: otherSiteId });
    expect(await repository.getAdminByEmail(email)).toMatchObject({ passwordHash: "manual-new-password-hash" });
    expect(await repository.getAdminByEmail(other.email)).toMatchObject({ passwordHash: "other-password-hash" });
    const reprovisioned = await repository.createOrUpdateAdmin(
      otherSiteId,
      `  REPROVISIONED-${suffix}@EXAMPLE.TEST  `,
      "reprovisioned-password-hash",
    );
    expect(reprovisioned).toMatchObject({
      id: other.id,
      email: `reprovisioned-${suffix}@example.test`,
      passwordHash: "reprovisioned-password-hash",
    });
    expect(await repository.getAdminSession(otherSession)).toBeNull();
    await pool.query("delete from sites where id=$1", [otherSiteId]);
  });

  it("includes the trial in the owner customer operations view", async () => {
    const customer = (await repository.listOwnerCustomers()).find((record) => record.siteId === siteId);
    expect(customer).toMatchObject({
      email,
      onboardingSource: "self_service",
      subscriptionStatus: undefined,
    });
    expect(customer?.businessName).toContain("Integration Demo");
  });

  it("enforces durable request limits", async () => {
    const first = await repository.consumeRateLimit({ scope: `integration-${suffix}`, subjectKey: "test", limit: 1, windowSeconds: 300 });
    const second = await repository.consumeRateLimit({ scope: `integration-${suffix}`, subjectKey: "test", limit: 1, windowSeconds: 300 });
    const isolatedSubject = await repository.consumeRateLimit({ scope: `integration-${suffix}`, subjectKey: "other-test", limit: 1, windowSeconds: 300 });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(isolatedSubject.allowed).toBe(true);
  });

  it("isolates tenant quotas and records fair-use state", async () => {
    const otherSiteId = `site-usage-${suffix}`;
    await pool.query(
      "insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private','private','{}'::jsonb,now() + interval '3 days',now() + interval '33 days')",
      [otherSiteId, `usage-${suffix}`],
    );
    const quota = [{ window: "minute" as const, limit: 2 }];
    const firstA = await repository.consumeTenantUsage({
      siteId,
      metric: `integration_usage_${suffix}`,
      amount: 1,
      quotas: quota,
      warningRatio: 0.5,
    });
    const secondA = await repository.consumeTenantUsage({
      siteId,
      metric: `integration_usage_${suffix}`,
      amount: 1,
      quotas: quota,
      warningRatio: 0.5,
    });
    const blockedA = await repository.consumeTenantUsage({
      siteId,
      metric: `integration_usage_${suffix}`,
      amount: 1,
      quotas: quota,
      warningRatio: 0.5,
    });
    const firstB = await repository.consumeTenantUsage({
      siteId: otherSiteId,
      metric: `integration_usage_${suffix}`,
      amount: 1,
      quotas: quota,
      warningRatio: 0.5,
    });
    expect(firstA).toMatchObject({ allowed: true, state: "warning" });
    expect(secondA.allowed).toBe(true);
    expect(blockedA).toMatchObject({ allowed: false, state: "throttled" });
    expect(firstB).toMatchObject({ allowed: true, state: "warning" });
    const states = await pool.query(
      "select site_id,state from tenant_usage_states where site_id=any($1::text[]) order by site_id",
      [[siteId, otherSiteId]],
    );
    expect(states.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ site_id: siteId, state: "throttled" }),
        expect.objectContaining({ site_id: otherSiteId, state: "warning" }),
      ]),
    );
    await pool.query("delete from sites where id=$1", [otherSiteId]);
  });

  it("enforces concurrency and audited owner overrides", async () => {
    const operation = `integration_concurrency_${suffix}`;
    const first = await repository.acquireTenantConcurrency({
      siteId,
      operation,
      limit: 1,
      ttlSeconds: 60,
    });
    expect(first.allowed).toBe(true);
    const blocked = await repository.acquireTenantConcurrency({
      siteId,
      operation,
      limit: 1,
      ttlSeconds: 60,
    });
    expect(blocked.allowed).toBe(false);
    if (first.allowed)
      await repository.releaseTenantConcurrency(siteId, first.leaseId);
    expect(
      (
        await repository.acquireTenantConcurrency({
          siteId,
          operation,
          limit: 1,
          ttlSeconds: 60,
        })
      ).allowed,
    ).toBe(true);

    await repository.setTenantUsageOverride({
      siteId,
      state: "temporarily_restricted",
      reason: "integration restriction",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(
      await repository.consumeTenantUsage({
        siteId,
        metric: `override_${suffix}`,
        amount: 1,
        quotas: [{ window: "minute", limit: 10 }],
        warningRatio: 0.8,
      }),
    ).toMatchObject({ allowed: false, state: "temporarily_restricted" });
    await repository.setTenantUsageOverride({
      siteId,
      state: "normal",
      reason: "verified integration allowance",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(
      await repository.consumeTenantUsage({
        siteId,
        metric: `override_${suffix}`,
        amount: 100,
        quotas: [{ window: "minute", limit: 1 }],
        warningRatio: 0.8,
      }),
    ).toMatchObject({ allowed: true, state: "normal" });
    await repository.setTenantUsageOverride({
      siteId,
      reason: "integration cleanup",
    });
  });

  it("persists and applies an audited AI run idempotently", async () => {
    const runId = await repository.startAiRun({ actorType: "owner", actorId: email, operation: "website_blueprint", leadId, provider: "test", model: "test-model", input: { instructions: "professional" } });
    await repository.completeAiRun(runId, { templateKey: "hair-salon" }, { totalTokens: 42 }, "response-test");
    expect(await repository.getAiRun(runId)).toMatchObject({ status: "completed", leadId, output: { templateKey: "hair-salon" } });
    expect(await repository.markAiRunApplied(runId, siteId)).toBe(siteId);
    expect(await repository.markAiRunApplied(runId, siteId)).toBe(siteId);
    expect(await repository.getAiRun(runId)).toMatchObject({ status: "applied", appliedSiteId: siteId });
  });

  it("enforces valid, expired and revoked private preview tokens", async () => {
    const tokenId = await repository.getOrCreatePreviewTokenId(siteId);
    expect(await repository.getByPreviewTokenId(tokenId)).toMatchObject({ id: siteId });
    await pool.query("update site_preview_tokens set expires_at=now() - interval '1 second' where token_id=$1", [tokenId]);
    expect(await repository.getByPreviewTokenId(tokenId)).toBeNull();
    const replacement = await repository.regeneratePreviewTokenId(siteId);
    expect(await repository.getByPreviewTokenId(replacement)).toMatchObject({ id: siteId });
    await pool.query("update site_preview_tokens set revoked_at=now() where token_id=$1", [replacement]);
    expect(await repository.getByPreviewTokenId(replacement)).toBeNull();
  });

  it("consumes password resets once and revokes existing sessions", async () => {
    const account = await repository.getAdminByEmail(email);
    expect(account).not.toBeNull();
    const sessionHash = `session-${suffix}`;
    const resetHash = `reset-${suffix}`;
    await repository.createAdminSession(
      account!.id,
      sessionHash,
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect(await repository.getAdminSession(sessionHash)).toMatchObject({ siteId });
    await repository.createPasswordReset(
      account!.id,
      resetHash,
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect(await repository.consumePasswordReset(resetHash, "updated-password-hash")).toBe(true);
    expect(await repository.consumePasswordReset(resetHash, "another-password-hash")).toBe(false);
    expect(await repository.getAdminSession(sessionHash)).toBeNull();
    expect(await repository.getAdminByEmail(email)).toMatchObject({ passwordHash: "updated-password-hash" });
  });

  it("allows only one winner for concurrent reset replay and rejects expiry", async () => {
    const account = await repository.getAdminByEmail(email);
    const resetHash = `concurrent-reset-${suffix}`;
    await repository.createPasswordReset(
      account!.id,
      resetHash,
      new Date(Date.now() + 60_000).toISOString(),
    );
    const results = await Promise.all([
      repository.consumePasswordReset(resetHash, "concurrent-winner-a"),
      repository.consumePasswordReset(resetHash, "concurrent-winner-b"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(["concurrent-winner-a", "concurrent-winner-b"]).toContain(
      (await repository.getAdminByEmail(email))!.passwordHash,
    );

    const expiredHash = `expired-reset-${suffix}`;
    await repository.createPasswordReset(
      account!.id,
      expiredHash,
      new Date(Date.now() - 1_000).toISOString(),
    );
    expect(await repository.consumePasswordReset(expiredHash, "must-not-apply")).toBe(false);
    expect((await repository.getAdminByEmail(email))!.passwordHash).not.toBe("must-not-apply");
  });

  it("persists one Redi Control mapping and an auditable lifecycle", async () => {
    await repository.beginSocialControlProvisioning(siteId);
    await repository.beginSocialControlProvisioning(siteId);
    await repository.failSocialControlProvisioning(siteId, "provider timeout contains spaces");
    expect(await repository.getSocialControlLink(siteId)).toMatchObject({ status: "error", lastErrorCode: "provider_timeout_contains_spaces" });
    await repository.beginSocialControlProvisioning(siteId);
    await repository.activateSocialControlLink({ siteId, installationId: `installation-${suffix}`, tenantId: `tenant-${suffix}`, workspaceId: `workspace-${suffix}` });
    await repository.recordSocialControlSession(siteId);
    expect(await repository.getSocialControlLink(siteId)).toMatchObject({ siteId, status: "active", workspaceId: `workspace-${suffix}` });
    expect((await repository.listOwnerCustomers()).find((record) => record.siteId === siteId)).toMatchObject({ socialControlStatus: "active", socialControlWorkspaceId: `workspace-${suffix}` });
    const mappings = await pool.query("select count(*)::int as count from site_external_integrations where site_id=$1 and provider='redi_control'", [siteId]);
    const events = await pool.query("select action from site_integration_events where site_id=$1 order by created_at", [siteId]);
    expect(mappings.rows[0].count).toBe(1);
    expect(events.rows.map((row) => row.action)).toEqual(expect.arrayContaining(["provisioning_started", "provisioning_failed", "provisioning_completed", "session_created"]));
  });

  it("activates, renews, fails and cancels a subscription idempotently", async () => {
    const eventAt = (seconds: number) => new Date(Date.now() + seconds * 1_000).toISOString();
    const account = await repository.getAdminByEmail(email);
    expect(account).not.toBeNull();
    const unboundIntakeId = randomUUID();
    await pool.query(
      `insert into subscriber_intakes(
         id,email,demo_site_id,plan_key,billing_provider,checkout_session_id,checkout_price_id
       ) values($1,$2,$3,'starter','stripe',$4,'price-starter')`,
      [unboundIntakeId, `unbound-${suffix}@example.test`, siteId, `cs-unbound-${suffix}`],
    );
    await expect(repository.processStripeSubscriptionEvent({
      eventId: `evt-unbound-${suffix}`,
      eventType: "checkout.session.completed",
      intakeId: unboundIntakeId,
      siteId,
      checkoutSessionId: `cs-unbound-${suffix}`,
      stripeSubscriptionId: `sub-unbound-${suffix}`,
      stripePriceId: "price-starter",
      planKey: "starter",
      status: "active",
      providerEventCreatedAt: eventAt(1),
    })).rejects.toThrow("Subscription activation target does not match");
    expect(await repository.getAdminBySiteId(siteId)).toMatchObject({ email });
    const intake = await repository.createSubscriberIntake({
      email,
      demoSiteId: siteId,
      siteAdminAccountId: account!.id,
      planKey: "starter",
      billingProvider: "stripe",
      checkoutPriceId: "price-starter",
      b2bEvidence: b2bEvidence(profile.business.name),
    });
    await repository.attachCheckoutSession(intake.id, `cs-${suffix}`);
    await expect(repository.processStripeSubscriptionEvent({
      eventId: `evt-mismatch-${suffix}`,
      eventType: "customer.subscription.created",
      intakeId: intake.id,
      siteId: `site-other-${suffix}`,
      stripeSubscriptionId: `sub-mismatch-${suffix}`,
      stripePriceId: "price-starter",
      planKey: "starter",
      status: "active",
    })).rejects.toThrow("Subscription activation target does not match");
    // Publication now requires a complete customer legal identity before the
    // activating event can make the site publicly visible.
    const activatedLegal = {
      legalBusinessName: profile.business.name, street: "Integration Street 1",
      postalCode: "45127", city: "Essen", countryCode: "DE",
      contactEmail: "legal@example.test", privacyNoticeUrl: "https://customer.example.test/privacy",
    };
    const preActivation = (await pool.query("select generated_document from sites where id=$1", [siteId])).rows[0].generated_document;
    preActivation.publicLegal = activatedLegal;
    await pool.query("update sites set generated_document=$2 where id=$1", [siteId, JSON.stringify(preActivation)]);
    const created = await repository.processStripeSubscriptionEvent({
      eventId: `evt-created-${suffix}`,
      eventType: "customer.subscription.created",
      intakeId: intake.id,
      siteId,
      stripeCustomerId: `cus-${suffix}`,
      stripeSubscriptionId: `sub-${suffix}`,
      stripePriceId: "price-starter",
      planKey: "starter",
      status: "active",
      providerEventCreatedAt: eventAt(1),
    });
    expect(created).toMatchObject({ processed: true, active: true, siteId });
    await expect(repository.processStripeSubscriptionEvent({
      eventId: `evt-existing-unaccepted-intake-${suffix}`,
      eventType: "customer.subscription.updated",
      intakeId: randomUUID(),
      siteId,
      stripeSubscriptionId: `sub-${suffix}`,
      stripePriceId: "price-starter",
      planKey: "starter",
      status: "active",
      providerEventCreatedAt: eventAt(2),
    })).rejects.toThrow("Subscription activation requires bound B2B contract acceptance");
    expect(await repository.getAdminBySiteId(siteId)).toMatchObject({ email });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId, visibility: "public" });
    const previousLegalGate = process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED;
    process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED = "true";
    try {
      expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });
      const stored = (await pool.query("select generated_document from sites where id=$1", [siteId])).rows[0].generated_document;
      stored.publicLegal = {};
      await pool.query("update sites set generated_document=$2 where id=$1", [siteId, JSON.stringify(stored)]);
      expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
      stored.publicLegal = activatedLegal;
      await pool.query("update sites set generated_document=$2 where id=$1", [siteId, JSON.stringify(stored)]);
      expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });
    } finally {
      if (previousLegalGate === undefined) delete process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED;
      else process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED = previousLegalGate;
    }
    expect(await repository.hasFeature(siteId, "appointment_requests")).toBe(true);
    expect(await repository.hasFeature(siteId, "booking")).toBe(true);
    expect(await repository.hasFeature(siteId, "booking_calendar")).toBe(false);
    expect(await repository.hasFeature(siteId, "custom_domain_existing")).toBe(true);
    expect(await repository.hasFeature(siteId, "social_media")).toBe(false);
    expect(await repository.hasCapabilityAccess(siteId, "appointment_requests")).toBe(true);
    await expect(repository.createAppointment({
      siteId,
      customerName: "Paid Starter Customer",
      phone: "+491234567",
      preferredDate: "2026-09-01",
      preferredTime: "10:00",
    })).resolves.toMatchObject({ siteId, status: "requested" });
    await expect(repository.processStripeAddonEvent({
      eventId: `evt-addon-unbound-${suffix}`,
      eventType: "customer.subscription.created",
      addonKey: "social_media",
      siteId,
      stripeSubscriptionId: `sub-social-unbound-${suffix}`,
      status: "active",
    })).resolves.toMatchObject({ processed: true, ignored: true });
    await pool.query(
      "insert into site_addon_subscriptions(site_id,addon_key,stripe_subscription_id,status) values($1,'social_media',$2,'pending')",
      [siteId, `sub-social-${suffix}`],
    );
    const addon = await repository.processStripeAddonEvent({
      eventId: `evt-addon-created-${suffix}`,
      eventType: "customer.subscription.created",
      addonKey: "social_media",
      siteId,
      stripeCustomerId: `cus-${suffix}`,
      stripeSubscriptionId: `sub-social-${suffix}`,
      stripePriceId: "price-social-media",
      status: "active",
    });
    expect(addon).toMatchObject({ processed: true, active: true, siteId });
    expect(await repository.hasFeature(siteId, "social_media")).toBe(false);
    expect(await repository.getAddonSubscription(siteId, "social_media")).toMatchObject({ status: "active", stripeSubscriptionId: `sub-social-${suffix}` });
    expect(await repository.processStripeAddonEvent({ eventId: `evt-addon-created-${suffix}`, eventType: "customer.subscription.created", addonKey: "social_media", stripeSubscriptionId: `sub-social-${suffix}`, status: "active" })).toMatchObject({ processed: false });
    await repository.processStripeAddonEvent({ eventId: `evt-addon-failed-${suffix}`, eventType: "invoice.payment_failed", addonKey: "social_media", stripeSubscriptionId: `sub-social-${suffix}`, status: "past_due" });
    expect(await repository.hasFeature(siteId, "social_media")).toBe(false);
    expect((await repository.listOwnerCustomers()).find((record) => record.siteId === siteId)).toMatchObject({ socialAddonStatus: "past_due", socialAddonSubscriptionId: `sub-social-${suffix}` });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });
    expect((await repository.processStripeSubscriptionEvent({ eventId: `evt-created-${suffix}`, eventType: "customer.subscription.created", stripeSubscriptionId: `sub-${suffix}`, status: "active" }))).toMatchObject({ processed: false });
    await repository.processStripeSubscriptionEvent({ eventId: `evt-failed-${suffix}`, eventType: "invoice.payment_failed", stripeSubscriptionId: `sub-${suffix}`, status: "past_due", providerEventCreatedAt: eventAt(2) });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });
    expect(await repository.hasCapabilityAccess(siteId, "media")).toBe(false);
    expect(await repository.hasCapabilityAccess(siteId, "ai_rewrite")).toBe(false);
    expect(await repository.hasCapabilityAccess(siteId, "editor")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "appointment_requests")).toBe(true);
    expect(await repository.hasCapabilityAccess(siteId, "custom_domain_existing")).toBe(false);
    const graceDocument = await repository.getBySlug(`integration-demo-${suffix.slice(0, 8)}`);
    const graceMarker = `Edited during grace ${suffix}`;
    await expect(repository.updateDocument(siteId, {
      ...graceDocument!,
      content: { ...graceDocument!.content, heroTitle: graceMarker },
    }, "content")).resolves.toMatchObject({ content: { heroTitle: graceMarker } });
    await expect(repository.updateDocument(siteId, graceDocument!, "media")).rejects.toThrow("editing is unavailable");
    await expect(repository.updateCustomDomain(siteId, `blocked-${suffix}.example.test`)).rejects.toThrow("unavailable");
    await expect(repository.createAppointment({ siteId, customerName: "Grace Customer", phone: "+490" }))
      .resolves.toMatchObject({ status: "requested" });
    const firstGrace = await pool.query("select first_past_due_at,payment_grace_ends_at from site_subscriptions where site_id=$1", [siteId]);
    await repository.processStripeSubscriptionEvent({ eventId: `evt-failed-retry-${suffix}`, eventType: "invoice.payment_failed", stripeSubscriptionId: `sub-${suffix}`, status: "past_due", providerEventCreatedAt: eventAt(3) });
    const retriedGrace = await pool.query("select first_past_due_at,payment_grace_ends_at from site_subscriptions where site_id=$1", [siteId]);
    expect(retriedGrace.rows[0]).toEqual(firstGrace.rows[0]);
    await expect(repository.processStripeSubscriptionEvent({ eventId: `evt-stale-active-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(2.5) }))
      .resolves.toMatchObject({ ignored: true, stale: true, siteId });
    expect((await repository.getSubscriptionAccess(siteId))?.state).toBe("payment_grace");

    await pool.query(
      "update site_subscriptions set first_past_due_at=now()-interval '8 days',payment_grace_ends_at=now()-interval '1 day',suspended_at=now()-interval '1 day',read_only_ends_at=now()+interval '29 days' where site_id=$1",
      [siteId],
    );
    await repository.reconcileLifecycleStates();
    expect((await repository.getSubscriptionAccess(siteId))?.state).toBe("read_only");
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
    await expect(repository.updateDocument(siteId, profile as never, "content")).rejects.toThrow("editing is unavailable");
    await expect(repository.createAppointment({ siteId, customerName: "Blocked", phone: "+490" })).rejects.toThrow("unavailable");

    await repository.processStripeSubscriptionEvent({ eventId: `evt-renewed-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(4) });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });
    expect(await repository.getAdminBySiteId(siteId)).toMatchObject({ email });
    const scheduledObservedAt = eventAt(4.2);
    const scheduledPeriodEnd = eventAt(4.8);
    const canceledObservedAt = eventAt(5);
    await repository.processStripeSubscriptionEvent({ eventId: `evt-scheduled-cancel-${suffix}`, eventType: "customer.subscription.updated", stripeSubscriptionId: `sub-${suffix}`, status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: scheduledPeriodEnd, providerEventCreatedAt: scheduledObservedAt });
    expect((await repository.getSubscriptionAccess(siteId))?.reason).toBe("active_until_period_end");
    const scheduledWindow = (await pool.query("select suspended_at,read_only_ends_at from site_subscriptions where site_id=$1", [siteId])).rows[0];
    await repository.processStripeSubscriptionEvent({ eventId: `evt-cancelled-${suffix}`, eventType: "customer.subscription.deleted", stripeSubscriptionId: `sub-${suffix}`, status: "canceled", providerEventCreatedAt: canceledObservedAt });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
    const canceledWindow = (await pool.query("select suspended_at,read_only_ends_at from site_subscriptions where site_id=$1", [siteId])).rows[0];
    expect(canceledWindow).toEqual(scheduledWindow);
    await expect(repository.processStripeSubscriptionEvent({ eventId: `evt-partial-recovery-${suffix}`, eventType: "invoice.payment_failed", stripeSubscriptionId: `sub-${suffix}`, status: "past_due", providerEventCreatedAt: eventAt(5.5) }))
      .resolves.toMatchObject({ ignored: true, invalid: true, siteId });
    expect((await pool.query("select suspended_at,read_only_ends_at from site_subscriptions where site_id=$1", [siteId])).rows[0]).toEqual(canceledWindow);
    await expect(repository.processStripeSubscriptionEvent({ eventId: `evt-old-reactivation-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(4.5) }))
      .resolves.toMatchObject({ ignored: true, stale: true });
    expect((await repository.getSubscriptionAccess(siteId))?.state).toBe("read_only");
    await repository.processStripeSubscriptionEvent({ eventId: `evt-reactivated-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(6) });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toMatchObject({ id: siteId });

    await pool.query("update sites set visibility='private',publication_intent='private' where id=$1", [siteId]);
    await repository.processStripeSubscriptionEvent({ eventId: `evt-private-cancelled-${suffix}`, eventType: "customer.subscription.deleted", stripeSubscriptionId: `sub-${suffix}`, status: "canceled", providerEventCreatedAt: eventAt(7) });
    await repository.processStripeSubscriptionEvent({ eventId: `evt-private-reactivated-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(8) });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
    expect((await pool.query("select visibility,publication_intent,generated_document from sites where id=$1", [siteId])).rows[0]).toMatchObject({ visibility: "private", publication_intent: "private" });
    const equalProviderTimestamp = eventAt(8);
    await expect(repository.processStripeSubscriptionEvent({ eventId: `evt-equal-cancelled-${suffix}`, eventType: "customer.subscription.deleted", stripeSubscriptionId: `sub-${suffix}`, status: "canceled", providerEventCreatedAt: equalProviderTimestamp }))
      .resolves.toMatchObject({ active: false, siteId });
    await expect(repository.processStripeSubscriptionEvent({ eventId: `evt-equal-active-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: equalProviderTimestamp }))
      .resolves.toMatchObject({ ignored: true, stale: true, siteId });
    expect((await repository.getSubscriptionAccess(siteId))?.state).toBe("read_only");
    await repository.processStripeSubscriptionEvent({ eventId: `evt-final-reactivation-${suffix}`, eventType: "invoice.paid", stripeSubscriptionId: `sub-${suffix}`, status: "active", providerEventCreatedAt: eventAt(9) });
    expect((await repository.getSubscriptionAccess(siteId))?.state).toBe("full");
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
    expect((await repository.getBySlug(`integration-demo-${suffix.slice(0, 8)}`))?.content.heroTitle).toBe(graceMarker);
    expect((await repository.listSubscriptionLifecycleEvents(siteId)).map((event) => event.action)).toEqual(expect.arrayContaining([
      "entered_payment_grace", "grace_expired", "entered_read_only", "provider_event_ignored_stale", "reactivated", "billing_forced_private", "publication_intent_restored",
    ]));
  });

  it("rejects Paddle first activation but preserves bound historical lifecycle", async () => {
    const subscriptionId = `paddle-sub-${suffix}`;
    const account = await repository.getAdminByEmail(email);
    expect(account).not.toBeNull();
    const intake = await repository.createSubscriberIntake({
      email,
      demoSiteId: siteId,
      siteAdminAccountId: account!.id,
      planKey: "starter",
      billingProvider: "paddle",
      checkoutPriceId: `paddle-price-${suffix}`,
      b2bEvidence: b2bEvidence(profile.business.name),
    });
    await expect(repository.processBillingSubscriptionEvent({
      provider: "paddle",
      eventId: `paddle-created-${suffix}`,
      eventType: "subscription.created",
      intakeId: intake.id,
      siteId,
      providerCustomerId: `paddle-customer-${suffix}`,
      providerSubscriptionId: subscriptionId,
      providerPriceId: `paddle-price-${suffix}`,
      planKey: "starter",
      status: "active",
    })).rejects.toThrow("Subscription activation target does not match");
    await pool.query(
      `update site_subscriptions
       set billing_provider='paddle',provider_customer_id=$2,provider_subscription_id=$3,
           provider_price_id=$4,plan_key='starter',status='active'
       where site_id=$1`,
      [siteId, `paddle-customer-${suffix}`, subscriptionId, `paddle-price-${suffix}`],
    );
    expect(await repository.getActiveSubscriptionCheckoutIdentity(siteId)).toMatchObject({
      billingProvider: "paddle",
      providerCustomerId: `paddle-customer-${suffix}`,
      providerSubscriptionId: subscriptionId,
    });
    await repository.processBillingSubscriptionEvent({
      provider: "paddle",
      eventId: `paddle-paused-${suffix}`,
      eventType: "subscription.paused",
      providerSubscriptionId: subscriptionId,
      status: "paused",
      providerEventCreatedAt: new Date(Date.now() + 20_000).toISOString(),
    });
    expect(await repository.getPublicBySlug(`integration-demo-${suffix.slice(0, 8)}`)).toBeNull();
    expect((await repository.listOwnerCustomers()).find((record) => record.siteId === siteId)).toMatchObject({
      billingProvider: "paddle",
      subscriptionStatus: "paused",
    });
  });
});
