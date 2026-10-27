import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { PreparedBusinessProfile } from "@platform/website-engine";
import { generateSiteDocument } from "@platform/website-engine";
import { PostgresSiteRepository } from "../src/index";

const connectionString = process.env.DATABASE_URL;

describe.runIf(Boolean(connectionString))("owner complimentary permanent access", () => {
  let pool: Pool;
  const suffix = randomUUID().slice(0, 8);
  const ownerTokenHash = createHash("sha256").update(`owner-session-${suffix}`).digest("hex");
  const ownerEmail = `comp-owner-${suffix}@example.test`;
  const secondOwnerTokenHash = createHash("sha256").update(`other-session-${suffix}`).digest("hex");
  // Constructed in beforeAll so the suite skips cleanly without DATABASE_URL.
  let repository: PostgresSiteRepository;
  let runtime: PostgresSiteRepository;
  const setupTokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

  const completeLegal = (businessName: string) => ({
    legalBusinessName: businessName,
    street: "Rruga e Kavajes 12",
    postalCode: "1001",
    city: "Tirana",
    countryCode: "AL",
    contactEmail: `legal-${randomUUID().slice(0, 8)}@example.test`,
    privacyNoticeUrl: "https://customer.example/privacy",
  });

  const buildSite = (name: string, locale: "en" | "de" | "fr" | "es" | "it" | "sq" = "en") => {
    const leadId = `comp-${randomUUID()}`;
    const profile: PreparedBusinessProfile = {
      id: `prepared-${leadId}-v1`,
      version: 1,
      sourceLeadId: leadId,
      locale,
      preparedAt: new Date().toISOString(),
      approvedSources: [],
      business: { name, category: "barber", email: `${leadId}@example.test` },
      services: [{ title: "Consultation", description: "Straight talk" }],
    };
    const site = generateSiteDocument(profile);
    site.publicLegal = completeLegal(name);
    site.id = randomUUID();
    return site;
  };

  const create = async (
    name: string,
    email: string,
    planKey: "starter" | "professional" | "premium" = "starter",
    options: { siteLocale?: "en" | "de" | "fr" | "es" | "it" | "sq"; adminLocale?: "en" | "de"; completeLegalIdentity?: boolean } = {},
  ) => {
    const slug = `${name.toLowerCase()}-${suffix}`;
    const site = buildSite(name, options.siteLocale ?? "en");
    if (options.completeLegalIdentity === false) site.publicLegal = {};
    const setupToken = randomUUID().replace(/-/g, "").repeat(2).slice(0, 64);
    const record = await repository.createComplimentaryCustomer({
      site,
      slug,
      businessName: name,
      email,
      adminLocale: options.adminLocale ?? "en",
      planKey,
      reason: "integration fixture",
      setupTokenHash: setupTokenHash(setupToken),
      setupExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    // Canonical allocation may adjust the slug; always surface the final one.
    return { record, slug: record.slug, requestedSlug: slug, siteId: site.id, setupToken };
  };

  beforeAll(async () => {
    // Mirror the production public read gate (NODE_ENV is "test" here).
    process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED = "true";
    pool = new Pool({ connectionString });
    repository = new PostgresSiteRepository({ boundary: "owner", sessionHash: ownerTokenHash, correlationId: `comp-test-${suffix}` });
    runtime = new PostgresSiteRepository({ boundary: "runtime" });
    await pool.query(`truncate site_complimentary_access, site_admin_password_resets, site_admin_sessions, site_admin_accounts,
      site_features, site_subscriptions, subscriber_intakes, subscription_lifecycle_events, audit_events,
      site_preview_tokens, demo_sites, sites, owner_sessions, owner_accounts cascade`);
    await pool.query(
      `insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,password_changed_at)
       values($1,$2,'unused','active','owner','v1.enrolled',now(),now())`,
      [randomUUID(), ownerEmail],
    );
    await pool.query(
      `insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,password_changed_at)
       values($1,$2,'unused','active','viewer','v1.enrolled',now(),now())`,
      [randomUUID(), `other-${ownerEmail}`],
    );
    for (const tokenHash of [ownerTokenHash, secondOwnerTokenHash])
      await pool.query(
        `insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at)
         select gen_random_uuid(),id,$1,now(),now()+interval '1 hour' from owner_accounts where email=$2`,
        [tokenHash, tokenHash === ownerTokenHash ? ownerEmail : `other-${ownerEmail}`],
      );
  });

  afterAll(async () => {
    await pool.query(`truncate site_complimentary_access, site_admin_password_resets, site_admin_sessions, site_admin_accounts,
      site_features, site_subscriptions, subscriber_intakes, subscription_lifecycle_events, audit_events,
      site_preview_tokens, demo_sites, sites, owner_sessions, owner_accounts cascade`);
    await pool.end();
  });

  it("creates a public, activated business site with a permanent entitlement and a single-use setup token", async () => {
    const { record, slug, siteId, setupToken } = await create("CompBasic", `basic-${suffix}@example.test`);
    expect(record).toMatchObject({ slug, planKey: "starter" });
    const site = await pool.query("select visibility,publication_intent,activated_at,onboarding_source,site_kind,demo_expires_at from sites where id=$1", [siteId]);
    expect(site.rows[0]).toMatchObject({ visibility: "public", publication_intent: "public", onboarding_source: "owner_comp", site_kind: "business" });
    expect(site.rows[0].activated_at).not.toBeNull();
    const comp = await pool.query("select status,plan_key,granted_by,reason from site_complimentary_access where site_id=$1", [siteId]);
    expect(comp.rows[0]).toMatchObject({ status: "complimentary_active", plan_key: "starter", reason: "integration fixture" });
    expect(comp.rows[0].granted_by).not.toBeNull();
    const admin = await pool.query("select email,preferred_locale from site_admin_accounts where site_id=$1", [siteId]);
    expect(admin.rows[0]).toMatchObject({ email: `basic-${suffix}@example.test`, preferred_locale: "en" });
    const reset = await pool.query("select token_hash,expires_at,used_at from site_admin_password_resets where account_id=$1", [(await pool.query("select id from site_admin_accounts where site_id=$1", [siteId])).rows[0].id]);
    expect(reset.rows[0].token_hash).toBe(setupTokenHash(setupToken));
    expect(reset.rows[0].used_at).toBeNull();
    const features = await pool.query("select feature_key from site_features where site_id=$1 and enabled", [siteId]);
    expect(features.rows.map((row) => row.feature_key)).toContain("website");
    const audit = await pool.query("select action from audit_events where entity_id=$1 and action='complimentary_granted'", [siteId]);
    expect(audit.rows).toHaveLength(1);
  });

  it("resolves full access without any subscription, Stripe object or trial time", async () => {
    const { siteId } = await create("CompAccess", `access-${suffix}@example.test`);
    const access = await runtime.getSubscriptionAccess(siteId);
    expect(access).toMatchObject({ state: "full", reason: "complimentary_active" });
    expect(await runtime.isSiteAvailable(siteId)).toBe(true);
    const lifecycle = await pool.query("select public_site_lifecycle_allows($1) allowed", [siteId]);
    expect(lifecycle.rows[0].allowed).toBe(true);
    const stripeObjects = await pool.query("select count(*)::int n from site_subscriptions where site_id=$1", [siteId]);
    expect(stripeObjects.rows[0].n).toBe(0);
  });

  it("keeps the site public after lifecycle reconciliation and demo cleanup", async () => {
    const { siteId } = await create("CompReconcile", `reconcile-${suffix}@example.test`);
    await pool.query("update sites set demo_expires_at=now()-interval '30 days', trial_recovery_ends_at=now()-interval '10 days' where id=$1", [siteId]);
    await runtime.reconcileLifecycleStates();
    const site = await pool.query("select visibility,publication_intent from sites where id=$1", [siteId]);
    expect(site.rows[0]).toMatchObject({ visibility: "public", publication_intent: "public" });
    const cleanup = await pool.query("select cleanup_expired_demo_batch('expired_demo_maintenance',100) result");
    expect(cleanup.rows[0].result).toMatchObject({ deletedSites: expect.any(Number) });
    expect((await pool.query("select 1 from sites where id=$1", [siteId])).rows).toHaveLength(1);
    expect(await runtime.isSiteAvailable(siteId)).toBe(true);
  });

  it("allocates sequential slugs for duplicate names instead of failing", async () => {
    const first = await create("CompDup", `dup-${suffix}@example.test`);
    expect(first.slug).toBe(`compdup-${suffix}`);
    const second = await create("CompDup", `dup2-${suffix}@example.test`);
    expect(second.slug).toBe(`compdup-${suffix}-2`);
    const third = await create("CompDup", `dup3-${suffix}@example.test`);
    expect(third.slug).toBe(`compdup-${suffix}-3`);
    expect(await pool.query("select count(*)::int n from sites where slug like $1", [`compdup-${suffix}%`])).toMatchObject({ rows: [{ n: 3 }] });
    for (const created of [first, second, third]) {
      const row = await pool.query("select custom_domain, custom_domain_status from sites where id = $1", [created.siteId]);
      expect(row.rows[0]).toMatchObject({ custom_domain: null, custom_domain_status: "not_requested" });
    }
  });

  it("keeps the email uniqueness boundary untouched", async () => {
    await create("CompEmailDup", `emaildup-${suffix}@example.test`);
    await expect(create("CompEmailDup2", `emaildup-${suffix}@example.test`)).rejects.toThrow(/email_taken/);
    expect(await pool.query("select count(*)::int n from sites where slug like $1", [`compemaildup-${suffix}%`])).toMatchObject({ rows: [{ n: 1 }] });
  });

  it("allocates distinct slugs for concurrent creates of the same name", async () => {
    const results = await Promise.all([
      create("CompConc", `conc1-${suffix}@example.test`),
      create("CompConc", `conc2-${suffix}@example.test`),
      create("CompConc", `conc3-${suffix}@example.test`),
    ]);
    const slugs = results.map((result) => result.slug).sort();
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).toEqual([`compconc-${suffix}`, `compconc-${suffix}-2`, `compconc-${suffix}-3`]);
    expect(await pool.query("select count(*)::int n from sites where slug like $1", [`compconc-${suffix}%`])).toMatchObject({ rows: [{ n: 3 }] });
  });

  it("refuses unauthorized sessions and unknown slugs", async () => {
    const { slug } = await create("CompAuth", `auth-${suffix}@example.test`);
    const viewer = new PostgresSiteRepository({ boundary: "owner", sessionHash: secondOwnerTokenHash, correlationId: "comp-test-viewer" });
    await expect(viewer.createComplimentaryCustomer({
      site: buildSite("Nope"), slug: `nope-${suffix}`, businessName: "Nope", email: `nope-${suffix}@example.test`,
      adminLocale: "en", planKey: "starter", setupTokenHash: setupTokenHash(`t-${suffix}`),
      setupExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })).rejects.toThrow();
    await expect(viewer.revokeComplimentaryAccess(slug, "not allowed")).resolves.toBe(false);
    await expect(repository.revokeComplimentaryAccess(`missing-${suffix}`, "no such site")).resolves.toBe(false);
  });

  it("revokes access, hides the site and signs out admin sessions", async () => {
    const { slug, siteId } = await create("CompRevoke", `revoke-${suffix}@example.test`);
    await pool.query(
      `insert into site_admin_sessions(id,account_id,token_hash,expires_at)
       select gen_random_uuid(),id,'revokesessionhash',now()+interval '1 day' from site_admin_accounts where site_id=$1`,
      [siteId],
    );
    expect(await repository.revokeComplimentaryAccess(slug, "owner request")).toBe(true);
    const comp = await pool.query("select status,revoked_by,revoked_at from site_complimentary_access where site_id=$1", [siteId]);
    expect(comp.rows[0].status).toBe("revoked");
    expect(comp.rows[0].revoked_by).not.toBeNull();
    expect(comp.rows[0].revoked_at).not.toBeNull();
    const site = await pool.query("select visibility from sites where id=$1", [siteId]);
    expect(site.rows[0].visibility).toBe("private");
    expect((await pool.query("select 1 from site_admin_sessions where token_hash='revokesessionhash'")).rows).toHaveLength(0);
    const revokedAccess = await runtime.getSubscriptionAccess(siteId);
    expect(revokedAccess).toMatchObject({ state: "never_activated" });
    expect(revokedAccess?.canEditCoreContent).toBe(false);
    expect(await repository.revokeComplimentaryAccess(slug, "second revoke")).toBe(false);
    const audit = await pool.query("select action from audit_events where entity_id=$1 and action='complimentary_revoked'", [siteId]);
    expect(audit.rows).toHaveLength(1);
  });

  it("converts deterministically on a verified paid activation and keeps site, login and content", async () => {
    const { slug, siteId } = await create("CompConvert", `convert-${suffix}@example.test`, "professional");
    // The customer later checks out normally; the provider subscription is
    // bound to the site and only a verified webhook event activates it.
    await pool.query(
      `insert into site_subscriptions(site_id,billing_provider,plan_key,status,provider_customer_id,provider_subscription_id,provider_price_id,contract_acceptance_state)
       values($1,'stripe','professional','pending',$2,$3,$4,'acceptance_unknown')`,
      [siteId, `cus_${suffix}`, `sub_${suffix}`, `price_${suffix}`],
    );
    const eventId = randomUUID();
    const result = await pool.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify({
      provider: "stripe",
      eventId,
      eventType: "customer.subscription.updated",
      providerEventCreatedAt: new Date().toISOString(),
      siteId,
      providerSubscriptionId: `sub_${suffix}`,
      providerCustomerId: `cus_${suffix}`,
      providerPriceId: `price_${suffix}`,
      planKey: "professional",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      paymentGraceDays: 7,
      paidReadOnlyDays: 30,
    })]);
    expect(result.rows[0].result).toMatchObject({ processed: true, active: true, siteId });
    const comp = await pool.query("select status,converted_to_paid_at from site_complimentary_access where site_id=$1", [siteId]);
    expect(comp.rows[0].status).toBe("converted");
    expect(comp.rows[0].converted_to_paid_at).not.toBeNull();
    const second = await pool.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify({
      provider: "stripe",
      eventId: randomUUID(),
      eventType: "customer.subscription.updated",
      providerEventCreatedAt: new Date().toISOString(),
      siteId,
      providerSubscriptionId: `sub_${suffix}`,
      providerCustomerId: `cus_${suffix}`,
      providerPriceId: `price_${suffix}`,
      planKey: "professional",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      paymentGraceDays: 7,
      paidReadOnlyDays: 30,
    })]);
    expect(second.rows[0].result.processed).toBe(true);
    expect(await pool.query("select count(*)::int n from site_complimentary_access where site_id=$1", [siteId])).toMatchObject({ rows: [{ n: 1 }] });
    const access = await runtime.getSubscriptionAccess(siteId);
    expect(access).toMatchObject({ state: "full", reason: "active_subscription" });
    const site = await pool.query("select slug,visibility,generated_document from sites where id=$1", [siteId]);
    expect(site.rows[0].slug).toBe(slug);
    expect(site.rows[0].visibility).toBe("public");
    expect(site.rows[0].generated_document).not.toBeNull();
    expect((await pool.query("select 1 from site_admin_accounts where site_id=$1", [siteId])).rows).toHaveLength(1);
    const events = await pool.query("select action from subscription_lifecycle_events where site_id=$1 and action='complimentary_converted'", [siteId]);
    expect(events.rows).toHaveLength(1);
  });

  it("leaves existing trial lifecycles unchanged", async () => {
    const trialSlug = `trial-${suffix}`;
    const trial = await pool.query("select public_trial_create($1::jsonb,$2,$3,null,now()+interval '30 days',14,30) value", [
      JSON.stringify({
        email: `trial-${suffix}@example.test`, preferredLocale: "en",
        profile: { business: { name: `TrialSite-${suffix}`, category: "barber" } },
        site: { slug: trialSlug },
      }),
      "unused-hash", createHash("sha256").update(`trial-session-${suffix}`).digest("hex"),
    ]);
    expect(trial.rows[0].value).not.toBeNull();
    const trialSiteId = (await pool.query("select id from sites where slug=$1", [trialSlug])).rows[0].id;
    await pool.query("update sites set demo_expires_at=now()-interval '40 days', trial_recovery_ends_at=now()-interval '10 days' where id=$1", [trialSiteId]);
    await pool.query("update site_preview_tokens set expires_at=now()-interval '5 days' where site_id=$1", [trialSiteId]);
    await runtime.reconcileLifecycleStates();
    expect((await pool.query("select visibility from sites where id=$1", [trialSiteId])).rows[0].visibility).toBe("private");
    const removed = await pool.query("select cleanup_expired_demo_batch('expired_demo_maintenance',100) result");
    expect(removed.rows[0].result.deletedSites).toBeGreaterThan(0);
    expect((await pool.query("select 1 from sites where id=$1", [trialSiteId])).rows).toHaveLength(0);
  });

  it("preserves every supported website locale while keeping the admin UI locale separate", async () => {
    for (const siteLocale of ["de", "en", "fr", "es", "it", "sq"] as const) {
      const name = `Comp${siteLocale.toUpperCase()}${suffix.slice(0, 4)}`;
      const { slug, siteId } = await create(name, `${siteLocale}-${suffix}@example.test`, "starter", {
        siteLocale, adminLocale: siteLocale === "de" ? "de" : "en",
      });
      const row = await pool.query(
        "select s.generated_document->>'locale' doc_locale, (select preferred_locale from site_admin_accounts where site_id=s.id) admin_locale from sites s where id=$1",
        [siteId],
      );
      expect(row.rows[0]).toMatchObject({ doc_locale: siteLocale, admin_locale: siteLocale === "de" ? "de" : "en" });
      const resolved = await runtime.getPublicBySlug(slug);
      expect(resolved).not.toBeNull();
      expect(resolved?.locale).toBe(siteLocale);
    }
  });

  it("refuses an admin locale outside the en/de customer boundary", async () => {
    await expect(create("CompBadAdmin", `badadmin-${suffix}@example.test`, "starter", {
      adminLocale: "fr" as never,
    })).rejects.toThrow();
    expect((await pool.query("select count(*)::int n from sites where slug like $1", [`compbadadmin-${suffix}`])).rows[0].n).toBe(0);
  });

  it("refuses incomplete legal identity without creating a doomed public site", async () => {
    await expect(create("CompNoLegal", `nolegal-${suffix}@example.test`, "starter", { completeLegalIdentity: false }))
      .rejects.toThrow(/legal identity/i);
    expect((await pool.query("select count(*)::int n from sites where slug like $1", [`compnolegal-${suffix}`])).rows[0].n).toBe(0);
  });

  it("keeps a legacy-style incomplete site explicitly hidden and recovers it through a complete legal save", async () => {
    // Simulate a pre-requirement site: public and activated, but with an empty
    // publicLegal block in the stored document.
    const leadId = `legacy-${randomUUID()}`;
    const profile: PreparedBusinessProfile = {
      id: `prepared-${leadId}-v1`, version: 1, sourceLeadId: leadId, locale: "sq",
      preparedAt: new Date().toISOString(), approvedSources: [],
      business: { name: `Legacy-${suffix}`, category: "barber" }, services: [{ title: "Consulta" }],
    };
    const site = generateSiteDocument(profile);
    site.publicLegal = {};
    site.id = randomUUID();
    const legacySlug = `legacy-${suffix}`;
    await pool.query(
      `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,onboarding_source,trial_email,site_kind)
       values($1,$2,'public','public',$3,statement_timestamp(),statement_timestamp(),statement_timestamp(),'owner_comp',$4,'business')`,
      [site.id, legacySlug, JSON.stringify(site), `legacy-${suffix}@example.test`],
    );
    await pool.query(
      `insert into site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'editor',true),($1,'media',true)`,
      [site.id],
    );
    await pool.query(
      `insert into site_complimentary_access(id,site_id,status,plan_key,reason,granted_by)
       select gen_random_uuid(),$1,'complimentary_active','starter','legacy fixture',id from owner_accounts limit 1`,
      [site.id],
    );

    // DB lifecycle passes and the resolver returns the row, but the canonical
    // publication validator keeps the site explicitly hidden — exactly the
    // pre-fix production behavior this repair eliminates for new sites.
    expect((await pool.query("select public_site_lifecycle_allows($1) allowed", [site.id])).rows[0].allowed).toBe(true);
    expect(await runtime.getPublicBySlug(legacySlug)).toBeNull();

    // The customer completes the Legal identity section in the site editor;
    // this is the same save path the editor's server action uses.
    site.publicLegal = {
      legalBusinessName: `Legacy-${suffix}`, street: "Rruga e Kavajes 12", postalCode: "1001",
      city: "Tirana", countryCode: "AL", contactEmail: `legacy-${suffix}@example.test`,
      privacyNoticeUrl: "https://customer.example/privacy",
    };
    const sessionHash = createHash("sha256").update(`legacy-session-${suffix}`).digest("hex");
    await pool.query(
      `insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values(gen_random_uuid(),$1,$2,'unused:fixture','en')`,
      [site.id, `legacy-admin-${suffix}@example.test`],
    );
    await pool.query(
      `insert into site_admin_sessions(id,account_id,token_hash,expires_at)
       select gen_random_uuid(),id,$1,now()+interval '1 hour' from site_admin_accounts where site_id=$2`,
      [sessionHash, site.id],
    );
    const admin = new PostgresSiteRepository({ boundary: "site_admin", sessionHash });
    await admin.updateDocumentForAuthenticatedSession(sessionHash, legacySlug, site, "contact");

    // Same site, no recreation: the canonical validator now passes and the
    // public document resolves for rendering in the chosen language.
    const recovered = await runtime.getPublicBySlug(legacySlug);
    expect(recovered).not.toBeNull();
    expect(recovered).toMatchObject({ locale: "sq", visibility: "public" });
    expect(recovered?.publicLegal?.legalBusinessName).toBe(`Legacy-${suffix}`);
  });
});
