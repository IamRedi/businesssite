import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { generateSiteDocument, type PreparedBusinessProfile } from "@platform/website-engine";
import { PostgresLegalRepository, PostgresSiteRepository } from "../src/index";

const connectionString = process.env.DATABASE_URL;
const runDatabaseTests = Boolean(connectionString);

describe.runIf(runDatabaseTests)("PostgresLegalRepository", () => {
  const suffix = randomUUID();
  const ownerId = randomUUID();
  const adminOwnerId = randomUUID();
  const ownerHash = `owner-hash-${suffix}`;
  const ownerSession = `a`.repeat(32)+suffix.replaceAll("-","").slice(0,32);
  const email = `legal-${suffix}@example.test`;
  const profile: PreparedBusinessProfile = {
    id: `legal-profile-${suffix}`, version: 1, sourceLeadId: `legal-lead-${suffix}`,
    locale: "en", preparedAt: new Date().toISOString(), approvedSources: [],
    business: { name: `Legal Fixture ${suffix.slice(0, 8)}`, category: "Professional services", email },
    services: [],
  };
  let pool: Pool;
  let legal: PostgresLegalRepository;
  let sites: PostgresSiteRepository;
  let siteId: string;
  let accountId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    legal = new PostgresLegalRepository(connectionString, ownerSession);
    sites = new PostgresSiteRepository(connectionString);
    await pool.query(
      `insert into owner_accounts(id,email,password_hash,status,mfa_secret_encrypted,mfa_enrolled_at,role)
       values($1,$2,$3,'active','fixture',now(),'owner'),($4,$5,'admin-hash','active','fixture',now(),'admin')`,
      [ownerId, `owner-${suffix}@example.test`, ownerHash, adminOwnerId, `admin-${suffix}@example.test`],
    );
    await pool.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),$1,$2,now(),now()+interval '12 hours')",[ownerId,ownerSession]);
    const document = generateSiteDocument(profile);
    document.id = `site-legal-${suffix}`;
    const trial = await sites.createSelfServiceTrial({
      site: document, profile, leadId: profile.sourceLeadId, preparedProfileId: profile.id,
      email, passwordHash: "site-admin-hash", trialDurationDays: 3, preferredLocale: "en",
    });
    siteId = trial.site.id;
    accountId = (await sites.getAdminBySiteId(siteId))!.id;
  });

  afterAll(async () => { await pool.end(); });

  const configInput = {
    legalBusinessName: "Operator Fixture", street: "Example Street 1", postalCode: "45127",
    city: "Essen", countryCode: "DE", countryName: "Germany",
    contactEmail: "legal@example.test", supportEmail: "support@example.test",
    taxDisplayMode: "net_plus_tax" as const, currency: "EUR" as const, priceTaxLabel: "plus VAT",
  };
  const evidence = (termsVersion = "terms-v1") => ({
    legalBusinessName: profile.business.name, countryCode: "DE", businessType: "sole_proprietor" as const,
    vatSyntaxPlausible: true, locale: "en" as const,
    terms: { documentKey: "terms" as const, locale: "en", version: termsVersion, contentHash: "a".repeat(64) },
    privacy: { documentKey: "privacy" as const, locale: "en", version: "privacy-v1", contentHash: "b".repeat(64) },
    b2bAttestationVersion: "b2b-v1", authorityAttestationVersion: "authority-v1",
    automaticRenewalVersion: "renewal-v1", privacyAcknowledgementVersion: "privacy-ack-v1",
    commercialConfigVersion: 0, currency: "EUR" as const, taxDisplayMode: "net_plus_tax" as const,
    priceTaxLabelSnapshot: "plus VAT", normalPriceDisplaySnapshot: "€29 / month",
    trialDurationDays: 14, billingInterval: "month" as const,
  });

  it("enforces owner-only version creation and fresh activation", async () => {
    await expect(legal.createConfig({actorId:adminOwnerId,currentPasswordHash:"admin-hash",totpStep:1}, configInput)).rejects.toThrow(/freshly authenticated owner/);
    const first = await legal.createConfig({actorId:ownerId,currentPasswordHash:ownerHash,totpStep:1}, configInput);
    const second = await legal.createConfig({actorId:ownerId,currentPasswordHash:ownerHash,totpStep:2}, { ...configInput, priceTaxLabel: "net plus applicable VAT" });
    expect(second.version).toBe(first.version + 1);
    await expect(legal.activateConfig({ actorId: adminOwnerId, currentPasswordHash: "admin-hash", totpStep: 1 }, first.id)).resolves.toBeNull();
    await expect(legal.activateConfig({ actorId: ownerId, currentPasswordHash: "wrong", totpStep: 3 }, first.id)).resolves.toBeNull();
    await expect(legal.activateConfig({ actorId: ownerId, currentPasswordHash: ownerHash, totpStep: 3 }, first.id)).resolves.toMatchObject({ status: "active", legalReviewStatus: "reviewed" });
    await expect(legal.activateConfig({ actorId: ownerId, currentPasswordHash: ownerHash, totpStep: 3 }, second.id)).resolves.toBeNull();
    await expect(pool.query("update platform_legal_config_versions set legal_business_name='mutated' where id=$1", [first.id])).rejects.toThrow(/immutable/i);
  });

  it("keeps document content evidence versioned and immutable", async () => {
    const source = { documentKey: "terms" as const, locale: "en", version: `legal-integration-${suffix}`, contentHash: "c".repeat(64) };
    await expect(legal.registerDocument({actorId:adminOwnerId,currentPasswordHash:"admin-hash",totpStep:4}, source)).rejects.toThrow(/freshly authenticated owner/);
    const registered = await legal.registerDocument({actorId:ownerId,currentPasswordHash:ownerHash,totpStep:4}, source);
    const privacy = await legal.registerDocument({actorId:ownerId,currentPasswordHash:ownerHash,totpStep:5}, { documentKey: "privacy", locale: "en", version: `privacy-integration-${suffix}`, contentHash: "f".repeat(64) });
    await expect(legal.registerDocument({actorId:ownerId,currentPasswordHash:ownerHash,totpStep:6}, { ...source, contentHash: "d".repeat(64) })).rejects.toThrow(/immutable legal hash mismatch/i);
    await expect(legal.activateDocument({ actorId: ownerId, currentPasswordHash: ownerHash, totpStep: 6 }, registered.id)).resolves.toMatchObject({ status: "active" });
    await expect(legal.activateDocument({ actorId: ownerId, currentPasswordHash: ownerHash, totpStep: 7 }, privacy.id)).resolves.toMatchObject({ status: "active" });
    await expect(legal.getActiveCheckoutDocuments("de")).resolves.toEqual([]);
    await expect(legal.getActiveCheckoutDocuments("en")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ documentKey: "terms", locale: "en", version: source.version })]));
    await expect(pool.query("update platform_legal_document_versions set content_hash=$2 where id=$1", [registered.id, "e".repeat(64)])).rejects.toThrow(/immutable/i);
  });

  it("binds idempotent acceptance to the exact account, site, intake and identity", async () => {
    const first = await sites.createSubscriberIntake({
      email, demoSiteId: siteId, siteAdminAccountId: accountId, planKey: "starter",
      billingProvider: "stripe", checkoutPriceId: "price-fixture", b2bEvidence: evidence(),
    });
    const retry = await sites.createSubscriberIntake({
      email, demoSiteId: siteId, siteAdminAccountId: accountId, planKey: "starter",
      billingProvider: "stripe", checkoutPriceId: "price-fixture", b2bEvidence: evidence(),
    });
    expect(retry).toMatchObject({ id: first.id, contractAcceptanceId: first.contractAcceptanceId, checkoutAttempt: first.checkoutAttempt });
    const stored = await pool.query(
      `select site_id,actor_account_id,business_identity_id,terms_version,
              platform_legal_config_version,plan_key,currency,tax_display_mode,
              price_tax_label_snapshot,normal_price_display_snapshot,trial_duration_days,billing_interval
       from contract_acceptances where id=$1`,
      [first.contractAcceptanceId],
    );
    expect(stored.rows[0]).toMatchObject({
      site_id: siteId, actor_account_id: accountId, business_identity_id: first.businessIdentityId,
      terms_version: "terms-v1", platform_legal_config_version: 0, plan_key: "starter",
      currency: "EUR", tax_display_mode: "net_plus_tax", price_tax_label_snapshot: "plus VAT",
      normal_price_display_snapshot: "€29 / month", trial_duration_days: 14, billing_interval: "month",
    });
    const acceptanceColumns = (await pool.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='contract_acceptances'",
    )).rows.map((row) => row.column_name);
    expect(acceptanceColumns).not.toEqual(expect.arrayContaining([
      "session_token", "password", "totp_code", "payment_method", "payment_data",
    ]));
    await expect(pool.query("update contract_acceptances set terms_version='spoofed' where id=$1", [first.contractAcceptanceId])).rejects.toThrow(/immutable/i);
    await expect(pool.query("delete from contract_acceptances where id=$1", [first.contractAcceptanceId])).rejects.toThrow(/immutable/i);

    const changed = await sites.createSubscriberIntake({
      email, demoSiteId: siteId, siteAdminAccountId: accountId, planKey: "starter",
      billingProvider: "stripe", checkoutPriceId: "price-fixture", b2bEvidence: evidence("terms-v2"),
    });
    expect(changed.checkoutAttempt).toBe(first.checkoutAttempt + 1);
    expect(changed.contractAcceptanceId).not.toBe(first.contractAcceptanceId);
    expect((await pool.query("select terms_version from contract_acceptances where id=$1", [first.contractAcceptanceId])).rows[0].terms_version).toBe("terms-v1");
    expect((await pool.query("select verification_state,vat_id_normalized from customer_business_identities where id=$1", [first.businessIdentityId])).rows[0])
      .toMatchObject({ verification_state: "self_attested", vat_id_normalized: null });
  });

  it("does not manufacture acceptance for a legacy subscription", async () => {
    const legacySiteId = `legacy-legal-${suffix}`;
    await pool.query(
      `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at)
       values($1,$2,'private','private','{}'::jsonb,now()+interval '3 days',now()+interval '33 days')`,
      [legacySiteId, `legacy-legal-${suffix}`],
    );
    await pool.query("insert into site_subscriptions(site_id,plan_key,status) values($1,'starter','active')", [legacySiteId]);
    expect((await pool.query("select contract_acceptance_state from site_subscriptions where site_id=$1", [legacySiteId])).rows[0].contract_acceptance_state).toBe("acceptance_unknown");
    expect((await pool.query("select count(*)::int as count from contract_acceptances where site_id=$1", [legacySiteId])).rows[0].count).toBe(0);
  });
});
