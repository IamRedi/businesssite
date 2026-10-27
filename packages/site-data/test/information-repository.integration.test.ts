import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  InformationRepositoryError,
  PostgresInformationRepository,
  PostgresSiteRepository,
} from "../src/index";
import { generateSiteDocument } from "@platform/website-engine";

const connectionString = process.env.DATABASE_URL;

describe.runIf(Boolean(connectionString))("PostgresInformationRepository", () => {
  const suffix = randomUUID();
  const siteA = `information-a-${suffix}`;
  const siteB = `information-b-${suffix}`;
  const legacySite = `information-legacy-${suffix}`;
  const ownerPublicationSite = `owner-publication-${suffix}`;
  const domainA = `info-${suffix}.example.test`;
  const domainB = `other-${suffix}.example.test`;
  const legacyDomain = `business-${suffix}.example.test`;
  const integrationId = randomUUID();
  const externalInstallationId = `redi-information-${suffix}`;
  const actor = { actorType: "owner" as const, actorId: `integration-${suffix}` };
  let pool: Pool;
  let repository: PostgresInformationRepository;
  let categoryId = "";
  let articleId = "";
  let accountA = "";
  let mediaA = "";
  let mediaB = "";
  let mediaBlobA = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    repository = new PostgresInformationRepository(connectionString);
    await pool.query(
      `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at)
       values($1,$2,'private','private','{}'::jsonb,now() + interval '3 days',now() + interval '33 days'),
             ($3,$4,'private','private','{}'::jsonb,now() + interval '3 days',now() + interval '33 days'),
             ($5,$6,'private','private','{"legacy":true}'::jsonb,now() + interval '3 days',now() + interval '33 days')`,
      [siteA, `information-a-${suffix}`, siteB, `information-b-${suffix}`, legacySite, `information-legacy-${suffix}`],
    );
    await repository.configureSite({ ...actor, siteId: siteA, publicationName: "Publication A", subcategory: "technology_ai", locale: "en" });
    await repository.configureSite({ ...actor, siteId: siteB, publicationName: "Publication B", subcategory: "local_news", locale: "de" });
    await pool.query(
      "update sites set custom_domain=case id when $1 then $4 when $2 then $5 else $6 end,custom_domain_status='verified' where id=any($3::text[])",
      [siteA, siteB, [siteA, siteB, legacySite], domainA, domainB, legacyDomain],
    );
    const siteRepository = new PostgresSiteRepository(connectionString);
    accountA = (await siteRepository.createOrUpdateAdmin(siteA, `editorial-a-${suffix}@example.test`, "test-hash")).id;
    await siteRepository.createOrUpdateAdmin(siteB, `editorial-b-${suffix}@example.test`, "test-hash");
    const category = await repository.createCategory({ ...actor, siteId: siteA, name: "Technology", slug: "technology" });
    categoryId = category.id;
    mediaBlobA = await siteRepository.saveMediaBlob(siteA, "article-a.webp", Buffer.from("site-a-media"));
    const blobB = await siteRepository.saveMediaBlob(siteB, "article-b.webp", Buffer.from("site-b-media"));
    mediaA = (await repository.registerMediaAsset({ ...actor, siteId: siteA, storageProvider: "postgres", storageKey: mediaBlobA, storageAccess: "private", mimeType: "image/webp", width: 1200, height: 800, byteSize: 12 })).id;
    mediaB = (await repository.registerMediaAsset({ ...actor, siteId: siteB, storageProvider: "postgres", storageKey: blobB, storageAccess: "private", mimeType: "image/webp", width: 1200, height: 800, byteSize: 12 })).id;
  });

  afterAll(async () => {
    await pool.query("delete from sites where id=any($1::text[])", [[siteA, siteB, legacySite, ownerPublicationSite]]);
    await pool.end();
  });

  it("creates an activated owner-managed publication with a tenant-scoped editorial administrator", async () => {
    const document = generateSiteDocument({
      id: `publication-profile-${suffix}`, version: 1, sourceLeadId: `owner-${suffix}`, locale: "sq",
      business: { name: "Info Esence", category: "Information and news", subcategory: "news" },
      services: [], approvedSources: [], preparedAt: new Date().toISOString(),
    }, undefined, "gold");
    document.id = ownerPublicationSite;
    document.slug = `info-esence-${suffix.slice(0, 8)}`;
    document.visibility = "public";
    const created = await repository.createOwnerPublication({
      site: document,
      email: `publication-editor-${suffix}@example.test`,
      passwordHash: "test-hash",
      publicationName: "Info Esence",
      tagline: "Independent reporting.",
      subcategory: "news",
      locale: "sq",
      themeKey: "gold",
    });
    expect(created.slug).toBe(document.slug);
    expect(await new PostgresSiteRepository(connectionString).isSiteAvailable(ownerPublicationSite)).toBe(true);
    expect(await repository.getEditorialRole(created.accountId, ownerPublicationSite)).toBe("administrator");
    const row = await pool.query("select visibility,activated_at,onboarding_source,site_kind from sites where id=$1", [ownerPublicationSite]);
    expect(row.rows[0]).toMatchObject({ visibility: "public", onboarding_source: "owner_outreach", site_kind: "information" });
    expect(row.rows[0].activated_at).toBeTruthy();
    await expect(repository.createOwnerPublication({
      site: { ...document, id: `${ownerPublicationSite}-duplicate` }, email: `other-${suffix}@example.test`, passwordHash: "test-hash",
      publicationName: "Duplicate", subcategory: "news", locale: "sq",
    })).rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "publication_slug_taken" }));
  });

  it("preserves legacy site data while opting a site into information mode", async () => {
    const legacy = await pool.query("select site_kind,generated_document from sites where id=$1", [legacySite]);
    expect(legacy.rows[0]).toMatchObject({ site_kind: "business", generated_document: { legacy: true } });
    const result = await pool.query("select site_kind,generated_document from sites where id=$1", [siteA]);
    expect(result.rows[0]).toMatchObject({ site_kind: "information", generated_document: {} });
    expect(await repository.getSettings(siteA)).toMatchObject({
      siteId: siteA,
      publicationName: "Publication A",
      subcategory: "technology_ai",
    });
  });

  it("stores only structured tenant-scoped ad slots and audits configuration", async () => {
    const slots = await repository.configureAdSlots({
      ...actor,
      siteId: siteA,
      slots: [
        { slotKey: "home_after_featured", format: "leaderboard", enabled: true },
        { slotKey: "article_sidebar", format: "rectangle", enabled: false },
      ],
    });
    expect(slots).toMatchObject([
      { siteId: siteA, slotKey: "article_sidebar", format: "rectangle", enabled: false },
      { siteId: siteA, slotKey: "home_after_featured", format: "leaderboard", enabled: true },
    ]);
    expect(await repository.listAdSlots(siteB)).toEqual([]);
    await expect(repository.configureAdSlots({
      ...actor,
      siteId: siteA,
      slots: [{ slotKey: "external_script" as "home_after_featured", format: "auto", enabled: true }],
    })).rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "invalid_ad_slot_configuration" }));
    await expect(repository.configureAdSlots({
      ...actor,
      siteId: legacySite,
      slots: [{ slotKey: "home_after_featured", format: "auto", enabled: true }],
    })).rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "information_site_required" }));
    const audit = await pool.query(
      "select details from site_content_audit_events where site_id=$1 and action='information_ad_slots.configured' order by created_at desc limit 1",
      [siteA],
    );
    expect(audit.rows[0].details.slots[0]).not.toHaveProperty("html");
  });

  it("backfills the site owner as editorial administrator and rejects cross-tenant membership", async () => {
    expect(await repository.getEditorialRole(accountA, siteA)).toBe("administrator");
    await expect(pool.query(
      "insert into site_editorial_memberships(account_id,site_id,role,granted_by) values($1,$2,'editor','test')",
      [accountA, siteB],
    )).rejects.toMatchObject({ code: "23503" });
    expect(await repository.getEditorialRole(accountA, siteB)).toBeNull();
  });

  it("creates tenant-scoped articles, sources and audit events", async () => {
    const article = await repository.createArticle({
      ...actor,
      siteId: siteA,
      categoryId,
      externalSource: "owner",
      externalReference: `external-${suffix}`,
      slug: "first-article",
      title: "First article",
      excerpt: "A concise summary.",
      body: { version: 1, blocks: [{ type: "paragraph", text: "Verified content." }] },
      tags: ["Technology", "News"],
      sources: [{ label: "Primary source", url: "https://example.com/source" }],
    });
    articleId = article.id;
    expect(article).toMatchObject({ siteId: siteA, status: "draft", version: 1, tags: ["technology", "news"] });
    expect(article.sources).toEqual([{ label: "Primary source", url: "https://example.com/source", sortOrder: 0 }]);
    expect(await repository.getArticle(siteB, article.id)).toBeNull();
    const audit = await pool.query(
      "select action from site_content_audit_events where site_id=$1 and article_id=$2 order by created_at",
      [siteA, article.id],
    );
    expect(audit.rows.map((row) => row.action)).toContain("article.created");
  });

  it("rejects cross-tenant category references at the database boundary", async () => {
    await expect(repository.createArticle({
      ...actor,
      siteId: siteB,
      categoryId,
      externalSource: "owner",
      slug: "cross-tenant-category",
      title: "Must fail",
      body: { version: 1, blocks: [] },
    })).rejects.toMatchObject({ code: "23503" });
  });

  it("validates media metadata and rejects cross-tenant article media", async () => {
    await expect(repository.registerMediaAsset({ ...actor, siteId: siteA, storageProvider: "postgres", storageKey: mediaBlobA, storageAccess: "private", mimeType: "image/png", width: 1200, height: 800, byteSize: 12 }))
      .rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "invalid_media_mime_type" }));
    await expect(repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "cross-tenant-media",
      title: "Must fail",
      body: { version: 1, blocks: [] },
      featuredMediaId: mediaB,
      articleMediaIds: [mediaB],
    })).rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "media_not_owned_by_site" }));
  });

  it("keeps draft and scheduled media private and exposes tenant-owned media only after publication", async () => {
    await pool.query("update sites set visibility='public',activated_at=now() where id=$1", [siteA]);
    const mediaArticle = await repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "media-report",
      title: "Media report",
      body: { version: 1, blocks: [{ type: "paragraph", text: "Media body." }] },
      featuredMediaId: mediaA,
      articleMediaIds: [mediaA],
    });
    expect((await repository.getMediaAssetForDelivery(mediaA))?.publiclyAvailable).toBe(false);
    const published = await repository.transitionArticle({ ...actor, siteId: siteA, articleId: mediaArticle.id, expectedVersion: mediaArticle.version, status: "published" });
    expect((await repository.getMediaAssetForDelivery(mediaA))?.publiclyAvailable).toBe(true);
    const publicArticle = await repository.getPublicArticleBySlug(`information-a-${suffix}`, "media-report");
    expect(publicArticle).toMatchObject({
      featuredImageUrl: `/api/media/${mediaA}`,
      articleMedia: [{ id: mediaA, url: `/api/media/${mediaA}` }],
    });
    await repository.transitionArticle({ ...actor, siteId: siteA, articleId: published.id, expectedVersion: published.version, status: "archived" });
    expect((await repository.getMediaAssetForDelivery(mediaA))?.publiclyAvailable).toBe(false);

    const scheduled = await repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "scheduled-media-report",
      title: "Scheduled media report",
      body: { version: 1, blocks: [] },
      featuredMediaId: mediaA,
      publishAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await repository.transitionArticle({ ...actor, siteId: siteA, articleId: scheduled.id, expectedVersion: scheduled.version, status: "published" });
    expect((await repository.getMediaAssetForDelivery(mediaA))?.publiclyAvailable).toBe(false);
  });

  it("enforces optimistic versions and explicit publication lifecycle", async () => {
    const updated = await repository.updateArticle({
      ...actor,
      siteId: siteA,
      articleId,
      expectedVersion: 1,
      patch: { title: "Updated first article" },
    });
    expect(updated).toMatchObject({ title: "Updated first article", version: 2 });
    await expect(repository.updateArticle({
      ...actor,
      siteId: siteA,
      articleId,
      expectedVersion: 1,
      patch: { title: "Stale update" },
    })).rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "article_version_conflict" }));
    const pending = await repository.transitionArticle({ ...actor, siteId: siteA, articleId, expectedVersion: 2, status: "pending" });
    expect(pending).toMatchObject({ status: "pending", version: 3 });
    const published = await repository.transitionArticle({ ...actor, siteId: siteA, articleId, expectedVersion: 3, status: "published" });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();
    await expect(repository.transitionArticle({ ...actor, siteId: siteA, articleId, expectedVersion: 4, status: "draft" }))
      .rejects.toEqual(expect.objectContaining<Partial<InformationRepositoryError>>({ code: "invalid_article_transition" }));
    const archived = await repository.transitionArticle({ ...actor, siteId: siteA, articleId, expectedVersion: 4, status: "archived" });
    expect(archived).toMatchObject({ status: "archived", version: 5 });
  });

  it("returns bounded summaries with cursor pagination", async () => {
    await repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "second-article",
      title: "Second article",
      body: { version: 1, blocks: [{ type: "paragraph", text: "Second body" }] },
    });
    const firstPage = await repository.listArticles(siteA, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.items[0]).not.toHaveProperty("body");
    const secondPage = await repository.listArticles(siteA, { limit: 1, createdBefore: firstPage.nextCursor });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it("serves only activated, public and publication-eligible articles", async () => {
    const publicSlug = `information-a-${suffix}`;
    await pool.query("update sites set visibility='public',activated_at=now() where id=$1", [siteA]);
    const visible = await repository.createArticle({
      ...actor,
      siteId: siteA,
      categoryId,
      externalSource: "owner",
      slug: "public-report",
      title: "Public report",
      excerpt: "Visible to public readers.",
      body: { version: 1, blocks: [{ type: "paragraph", text: "Published body." }] },
    });
    await repository.transitionArticle({ ...actor, siteId: siteA, articleId: visible.id, expectedVersion: visible.version, status: "published" });
    const future = await repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "future-report",
      title: "Future report",
      publishAt: new Date(Date.now() + 86_400_000).toISOString(),
      body: { version: 1, blocks: [] },
    });
    await repository.transitionArticle({ ...actor, siteId: siteA, articleId: future.id, expectedVersion: future.version, status: "published" });

    expect(await repository.getPublicSiteBySlug(publicSlug)).toMatchObject({
      siteId: siteA,
      publicationName: "Publication A",
      adSlots: [{ siteId: siteA, slotKey: "home_after_featured", format: "leaderboard", enabled: true }],
    });
    const feed = await repository.listPublicArticlesBySlug({ siteSlug: publicSlug, limit: 50 });
    expect(feed.items.map((item) => item.slug)).toContain("public-report");
    expect(feed.items.map((item) => item.slug)).not.toContain("future-report");
    expect(await repository.getPublicArticleBySlug(publicSlug, "public-report")).toMatchObject({ title: "Public report", category: { slug: "technology" } });
    expect(await repository.getPublicArticleBySlug(publicSlug, "future-report")).toBeNull();
    expect(await repository.getPublicArticleBySlug(`information-b-${suffix}`, "public-report")).toBeNull();

    expect(await repository.getPublicSiteByDomain(domainA)).toMatchObject({ siteId: siteA, publicationName: "Publication A" });
    const domainFeed = await repository.listPublicArticlesByDomain({ domain: domainA, limit: 50 });
    expect(domainFeed.items.map((item) => item.slug)).toContain("public-report");
    expect(domainFeed.items.map((item) => item.slug)).not.toContain("future-report");
    expect(await repository.getPublicArticleByDomain(domainA, "public-report")).toMatchObject({ title: "Public report" });
    expect(await repository.getPublicArticleByDomain(domainA, "second-article")).toBeNull();
    expect(await repository.getPublicArticleByDomain(domainA, "future-report")).toBeNull();
    expect(await repository.getPublicSiteByDomain("unmapped.example.test")).toBeNull();
    expect(await repository.getPublicSiteByDomain(domainB)).toBeNull();
    await pool.query("update sites set visibility='public',activated_at=now() where id=$1", [siteB]);
    expect(await repository.getPublicSiteByDomain(domainB)).toMatchObject({ siteId: siteB });
    expect(await repository.getPublicArticleByDomain(domainB, "public-report")).toBeNull();
    await pool.query("update sites set custom_domain_status='pending_dns' where id=$1", [siteB]);
    expect(await repository.getPublicSiteByDomain(domainB)).toBeNull();
  });

  it("resolves a verified business custom domain only with active Starter entitlements", async () => {
    await pool.query("update sites set visibility='public',publication_intent='public',activated_at=now() where id=$1", [legacySite]);
    expect(await repository.getPublicSiteByDomain(legacyDomain)).toBeNull();
    const siteRepository = new PostgresSiteRepository(connectionString);
    expect(await siteRepository.getByVerifiedCustomDomain(legacyDomain)).toBeNull();
    await pool.query(
      "insert into site_subscriptions(site_id,billing_provider,provider_customer_id,provider_subscription_id,provider_price_id,plan_key,status) values($1,'stripe',$2,$3,'price-starter','starter','active')",
      [legacySite, `cus-${suffix}`, `sub-${suffix}`],
    );
    await pool.query(
      "insert into site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'custom_domain_existing',true)",
      [legacySite],
    );
    expect(await siteRepository.getByVerifiedCustomDomain(legacyDomain)).toMatchObject({ legacy: true, visibility: "public" });
  });

  it("prevents integration nonce replay and persists idempotent responses", async () => {
    await pool.query(
      `insert into site_external_integrations(
        id,site_id,provider,status,external_installation_id,inbound_enabled,
        inbound_permissions,inbound_approved_at,inbound_approved_by
       ) values($1,$2,'redi_control','active',$3,true,$4,now(),'owner-test')`,
      [integrationId, siteA, externalInstallationId, [
        "articles:read", "articles:create", "articles:update", "articles:submit",
        "articles:publish", "articles:archive", "media:read", "media:write",
      ]],
    );
    expect(await repository.getRediInboundAccess(externalInstallationId)).toMatchObject({
      integrationId,
      siteId: siteA,
      approvedBy: "owner-test",
    });
    expect(await repository.getRediInboundAccess(`missing-${suffix}`)).toBeNull();
    const disabled = await repository.configureRediInboundAccess({
      ...actor, siteId: siteA, enabled: false, permissions: ["articles:read"],
    });
    expect(disabled).toMatchObject({ enabled: false, permissions: ["articles:read"] });
    expect(await repository.getRediInboundAccess(externalInstallationId)).toBeNull();
    await repository.configureRediInboundAccess({
      ...actor, siteId: siteA, enabled: true,
      permissions: ["articles:read", "articles:create", "articles:update", "articles:submit", "articles:publish", "articles:archive", "media:read", "media:write"],
    });
    const grantAudit = await pool.query(
      "select count(*)::int as count from site_content_audit_events where site_id=$1 and action='integration.inbound_grant_changed'",
      [siteA],
    );
    expect(grantAudit.rows[0].count).toBe(2);
    const signedAt = new Date().toISOString();
    const nonce = `nonce-${randomUUID()}`;
    expect(await repository.consumeIntegrationNonce({ integrationId, siteId: siteA, nonce, signedAt })).toBe(true);
    expect(await repository.consumeIntegrationNonce({ integrationId, siteId: siteA, nonce, signedAt })).toBe(false);

    const claim = await repository.beginIntegrationRequest({
      integrationId,
      siteId: siteA,
      idempotencyKey: `article-create-${suffix}`,
      operation: "article.create",
      requestBody: '{"title":"Stable"}',
    });
    expect(claim.outcome).toBe("claimed");
    await repository.completeIntegrationRequest({
      integrationId,
      idempotencyKey: `article-create-${suffix}`,
      requestHash: claim.requestHash,
      responseStatus: 201,
      responseBody: { articleId },
    });
    const replay = await repository.beginIntegrationRequest({
      integrationId,
      siteId: siteA,
      idempotencyKey: `article-create-${suffix}`,
      operation: "article.create",
      requestBody: '{"title":"Stable"}',
    });
    expect(replay).toMatchObject({ outcome: "replay", responseStatus: 201, responseBody: { articleId } });
    const conflict = await repository.beginIntegrationRequest({
      integrationId,
      siteId: siteA,
      idempotencyKey: `article-create-${suffix}`,
      operation: "article.create",
      requestBody: '{"title":"Changed"}',
    });
    expect(conflict.outcome).toBe("conflict");

    const failedKey = `article-failed-${suffix}`;
    const failedClaim = await repository.beginIntegrationRequest({
      integrationId, siteId: siteA, idempotencyKey: failedKey,
      operation: "article.update", requestBody: '{"expectedVersion":1}',
    });
    expect(failedClaim.outcome).toBe("claimed");
    await repository.failIntegrationRequest({
      integrationId, idempotencyKey: failedKey, requestHash: failedClaim.requestHash,
      responseStatus: 500, responseBody: { error: { code: "internal_error" } },
    });
    expect((await repository.beginIntegrationRequest({
      integrationId, siteId: siteA, idempotencyKey: failedKey,
      operation: "article.update", requestBody: '{"expectedVersion":1}',
    })).outcome).toBe("claimed");
  });

  it("retains same-tenant deletion audit without retaining the deleted article", async () => {
    const temporary = await repository.createArticle({
      ...actor,
      siteId: siteA,
      externalSource: "owner",
      slug: "temporary-article",
      title: "Temporary article",
      body: { version: 1, blocks: [] },
    });
    await repository.deleteArticle({ ...actor, siteId: siteA, articleId: temporary.id, expectedVersion: temporary.version });
    expect(await repository.getArticle(siteA, temporary.id)).toBeNull();
    const audit = await pool.query(
      "select site_id,article_id,action,details from site_content_audit_events where site_id=$1 and action='article.deleted' and details->>'slug'='temporary-article'",
      [siteA],
    );
    expect(audit.rows[0]).toMatchObject({ site_id: siteA, article_id: null, action: "article.deleted" });
  });
  it("persists private R2 editorial authority without publishing the object", async () => {
    const authority = `r2-bucket:${"a".repeat(32)}:media-private`;
    const key = `sites/${siteA}/editorial/${randomUUID()}-fixture.webp`;
    const input = { ...actor, siteId: siteA, storageProvider: "r2" as const, providerAuthority: authority, storageKey: key, storageAccess: "private" as const, mimeType: "image/webp", width: 16, height: 16, byteSize: 44 };
    const asset = await repository.registerMediaAsset(input);
    expect(asset).toMatchObject({ site_id: siteA, storage_provider: "r2", storage_access: "private", provider_authority: authority, storage_key: key, public_url: `/api/media/${asset.id}` });
    expect((await repository.getMediaAssetForDelivery(asset.id))?.publiclyAvailable).toBe(false);
    for (const invalid of [{ ...input, storageKey: key.replace(siteA, siteB) }, { ...input, providerAuthority: authority.replace("media-private", "recovery-backups") }, { ...input, storageAccess: "public" as const }]) await expect(repository.registerMediaAsset(invalid)).rejects.toThrow();
  });
});
