import { createHash, randomUUID } from "node:crypto";
import {
  databaseRlsMode,
  getOwnerPostgresPool,
  getPostgresPool,
  getRuntimePostgresPool,
  getSystemPostgresPool,
  type Pool,
} from "@platform/database";
import {
  canTransitionArticleStatus,
  informationAdFormats,
  informationAdSlotKeys,
  type ArticleContent,
  type ArticleStatus,
  type InformationAdFormat,
  type InformationAdSlot,
  type InformationAdSlotKey,
  type InformationSponsorBanner,
  type InformationArticle,
  type InformationArticleMedia,
  type InformationSiteSettings,
  type InformationSubcategory,
  type SupportedLocale,
  type ThemeSelection,
  type SiteDocument,
} from "@platform/website-engine";
import type { PoolClient } from "pg";

export type ContentActor = {
  actorType: "owner" | "site_admin" | "integration" | "system";
  actorId: string;
};

/**
 * Creates an operator-managed publication. Unlike a self-service business
 * trial this is activated at creation time, so it is never affected by the
 * demo expiry cleanup job.
 */
export type OwnerInformationPublicationInput = {
  site: SiteDocument;
  email: string;
  passwordHash: string;
  publicationName: string;
  tagline?: string;
  subcategory: InformationSubcategory;
  locale: SupportedLocale;
  themeKey?: ThemeSelection;
};

export type EditorialRole = "editor" | "publisher" | "administrator";
export type EditorialPermission =
  | "article:read"
  | "article:create"
  | "article:update"
  | "article:submit"
  | "article:publish"
  | "article:archive"
  | "article:delete"
  | "category:manage"
  | "settings:manage";

const editorialPermissions: Record<EditorialRole, readonly EditorialPermission[]> = {
  editor: ["article:read", "article:create", "article:update", "article:submit"],
  publisher: ["article:read", "article:create", "article:update", "article:submit", "article:publish", "article:archive"],
  administrator: ["article:read", "article:create", "article:update", "article:submit", "article:publish", "article:archive", "article:delete", "category:manage", "settings:manage"],
};

export function roleHasEditorialPermission(role: EditorialRole, permission: EditorialPermission) {
  return editorialPermissions[role].includes(permission);
}

export type ArticleSourceInput = { label?: string; url: string };
export type ArticleExternalSource = "site_admin" | "owner" | "redi_control";

export const rediInboundPermissions = [
  "articles:read",
  "articles:create",
  "articles:update",
  "articles:submit",
  "articles:publish",
  "articles:archive",
  "media:read",
  "media:write",
] as const;
export type RediInboundPermission = (typeof rediInboundPermissions)[number];

export type CreateArticleInput = ContentActor & {
  siteId: string;
  categoryId?: string | null;
  externalSource: ArticleExternalSource;
  externalReference?: string;
  slug: string;
  title: string;
  excerpt?: string;
  body: ArticleContent;
  featuredMediaId?: string | null;
  articleMediaIds?: string[];
  featuredImageAlt?: string;
  tags?: string[];
  displayAuthor?: string;
  status?: "draft" | "pending";
  featured?: boolean;
  publishAt?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  sources?: ArticleSourceInput[];
};

export type UpdateArticleInput = ContentActor & {
  siteId: string;
  articleId: string;
  expectedVersion: number;
  patch: {
    categoryId?: string | null;
    slug?: string;
    title?: string;
    excerpt?: string;
    body?: ArticleContent;
    featuredMediaId?: string | null;
    articleMediaIds?: string[];
    featuredImageAlt?: string;
    tags?: string[];
    displayAuthor?: string;
    featured?: boolean;
    publishAt?: string | null;
    seoTitle?: string;
    seoDescription?: string;
    canonicalUrl?: string;
    sources?: ArticleSourceInput[];
  };
};

export type ArticleListFilters = {
  status?: ArticleStatus;
  categoryId?: string;
  tag?: string;
  query?: string;
  createdBefore?: { createdAt: string; id: string };
  limit?: number;
};

export type ArticleSummary = Omit<InformationArticle, "body" | "sources">;

export type PublicInformationCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
};

export type PublicInformationArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  displayAuthor?: string;
  featured: boolean;
  publishedAt: string;
  category?: PublicInformationCategory;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
};

export type PublicInformationSite = InformationSiteSettings & {
  slug: string;
  categories: PublicInformationCategory[];
  adSlots: InformationAdSlot[];
  sponsorBanners?: InformationSponsorBanner[];
};

export type PublicInformationArticle = PublicInformationArticleSummary & {
  body: ArticleContent;
  articleMedia: InformationArticleMedia[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  sources: InformationArticle["sources"];
};

type PublicInformationIdentity =
  | { kind: "slug"; value: string }
  | { kind: "domain"; value: string };

type PublicArticleListInput = {
  categorySlug?: string;
  publishedBefore?: { publishedAt: string; id: string };
  limit?: number;
  featuredFirst?: boolean;
};

function publicSiteIdentityPredicate(identity: PublicInformationIdentity) {
  return identity.kind === "slug"
    ? "site.slug=$1"
    : "site.custom_domain=$1 and site.custom_domain_status='verified'";
}

export class InformationRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "InformationRepositoryError";
  }
}

function optionalText(value: string | undefined, maximum: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length > maximum) throw new InformationRepositoryError("field_too_long");
  return normalized || undefined;
}

function requiredText(value: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized) throw new InformationRepositoryError("field_required");
  if (normalized.length > maximum) throw new InformationRepositoryError("field_too_long");
  return normalized;
}

function optionalHttpUrl(value: string | undefined, maximum: number) {
  const normalized = optionalText(value, maximum);
  if (!normalized) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new InformationRepositoryError("invalid_url");
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new InformationRepositoryError("invalid_url");
  return parsed.toString();
}

function sponsorDestination(value: string) {
  const normalized = requiredText(value, 2048);
  let parsed: URL;
  try { parsed = new URL(normalized); }
  catch { throw new InformationRepositoryError("invalid_sponsor_url"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname)
    throw new InformationRepositoryError("invalid_sponsor_url");
  return parsed.toString();
}

export type SaveSponsorBannerInput = ContentActor & {
  siteId: string;
  id?: string;
  expectedVersion?: number;
  slotKey: InformationAdSlotKey;
  sponsorName: string;
  headline: string;
  description?: string;
  callToAction: string;
  destinationUrl: string;
  imageMediaId?: string | null;
  enabled: boolean;
  sortOrder?: number;
};

function articleSlug(value: string) {
  const normalized = requiredText(value, 180).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized))
    throw new InformationRepositoryError("invalid_slug");
  return normalized;
}

function validateBody(body: ArticleContent) {
  if (body.version !== 1 || !Array.isArray(body.blocks) || body.blocks.length > 500)
    throw new InformationRepositoryError("invalid_article_body");
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > 500_000)
    throw new InformationRepositoryError("article_body_too_large");
  return body;
}

function normalizeTags(tags: string[] | undefined) {
  const normalized = [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length > 30 || normalized.some((tag) => tag.length > 60))
    throw new InformationRepositoryError("invalid_tags");
  return normalized;
}

function normalizeMediaIds(mediaIds: string[] | undefined) {
  const normalized = [...new Set((mediaIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (normalized.length > 20 || normalized.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))
    throw new InformationRepositoryError("invalid_media_reference");
  return normalized;
}

function isInformationAdSlotKey(value: string): value is InformationAdSlotKey {
  return informationAdSlotKeys.includes(value as InformationAdSlotKey);
}

function isInformationAdFormat(value: string): value is InformationAdFormat {
  return informationAdFormats.includes(value as InformationAdFormat);
}

function validateMediaRegistration(input: {
  storageProvider: "vercel_blob" | "postgres" | "r2";
  storageKey: string;
  storageAccess: "public" | "private";
  mimeType: string;
  width?: number;
  height?: number;
  byteSize: number;
}) {
  if (input.mimeType !== "image/webp") throw new InformationRepositoryError("invalid_media_mime_type");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 4 * 1024 * 1024)
    throw new InformationRepositoryError("invalid_media_byte_size");
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) ||
      input.width! < 1 || input.height! < 1 || input.width! > 2_000 || input.height! > 2_000)
    throw new InformationRepositoryError("invalid_media_dimensions");
  if (input.storageProvider === "postgres" &&
      (input.storageAccess !== "private" || !/^[0-9a-f-]{36}$/i.test(input.storageKey)))
    throw new InformationRepositoryError("invalid_media_storage");
}

function normalizeSources(sources: ArticleSourceInput[] | undefined) {
  if ((sources?.length ?? 0) > 50) throw new InformationRepositoryError("too_many_sources");
  return (sources ?? []).map((source) => {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new InformationRepositoryError("invalid_source_url");
    }
    if (!['http:', 'https:'].includes(url.protocol))
      throw new InformationRepositoryError("invalid_source_url");
    return { label: optionalText(source.label, 200), url: url.toString() };
  });
}

function iso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapArticle(
  row: Record<string, any>,
  sources: InformationArticle["sources"],
  articleMedia: InformationArticleMedia[] = [],
): InformationArticle {
  return {
    id: row.id,
    siteId: row.site_id,
    categoryId: row.category_id ?? undefined,
    externalSource: row.external_source,
    externalReference: row.external_reference ?? undefined,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    featuredMediaId: row.featured_media_id ?? undefined,
    featuredImageAlt: row.featured_image_alt ?? undefined,
    articleMedia,
    tags: row.tags,
    displayAuthor: row.display_author ?? undefined,
    status: row.status,
    featured: row.featured,
    publishAt: iso(row.publish_at),
    publishedAt: iso(row.published_at),
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    canonicalUrl: row.canonical_url ?? undefined,
    version: row.lock_version,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    sources,
  };
}

function mapPublicCategory(row: Record<string, any>): PublicInformationCategory | undefined {
  if (!row.category_id) return undefined;
  return {
    id: row.category_id,
    name: row.category_name,
    slug: row.category_slug,
    description: row.category_description ?? undefined,
    sortOrder: row.category_sort_order ?? 0,
  };
}

function mapPublicSummary(row: Record<string, any>): PublicInformationArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    tags: row.tags ?? [],
    displayAuthor: row.display_author ?? undefined,
    featured: row.featured,
    publishedAt: iso(row.published_at)!,
    category: mapPublicCategory(row),
    featuredImageUrl: row.featured_image_url ?? undefined,
    featuredImageAlt: row.featured_image_alt ?? undefined,
  };
}

async function assertInformationSite(client: Pool | PoolClient, siteId: string) {
  const result = await client.query("select site_kind from sites where id=$1", [siteId]);
  if (!result.rows[0]) throw new InformationRepositoryError("site_not_found");
  if (result.rows[0].site_kind !== "information")
    throw new InformationRepositoryError("information_site_required");
}

async function recordAudit(
  client: PoolClient,
  input: ContentActor & { siteId: string; articleId?: string; action: string; details?: object },
) {
  await client.query(
    `insert into site_content_audit_events(id,site_id,article_id,actor_type,actor_id,action,details)
     values($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), input.siteId, input.articleId ?? null, input.actorType, requiredText(input.actorId, 200), input.action, input.details ?? {}],
  );
}

export class PostgresInformationRepository {
  private readonly pool: Pool;
  private readonly boundary: "compatibility" | "public" | "owner" | "system" | "site_admin";
  private readonly sessionHash?: string;
  private readonly correlationId?: string;
  private readonly integrationId?: string;
  private readonly integrationSiteId?: string;
  private readonly integrationPermission?: RediInboundPermission;

  constructor(urlOrBoundary?: string | {
    boundary: "public" | "owner" | "system" | "site_admin";
    sessionHash?: string;
    correlationId?: string;
    integrationId?: string;
    siteId?: string;
    permission?: RediInboundPermission;
  }) {
    if (typeof urlOrBoundary === "string") {
      this.pool = getPostgresPool(urlOrBoundary);
      this.boundary = "compatibility";
      return;
    }
    if (!urlOrBoundary) {
      if (databaseRlsMode() !== "off") throw new Error("An explicit Information database actor boundary is required.");
      this.pool = getPostgresPool(process.env.DATABASE_URL);
      this.boundary = "compatibility";
      return;
    }
    this.boundary = urlOrBoundary.boundary;
    this.sessionHash = urlOrBoundary.sessionHash;
    this.correlationId = urlOrBoundary.correlationId;
    this.integrationId = urlOrBoundary.integrationId;
    this.integrationSiteId = urlOrBoundary.siteId;
    this.integrationPermission = urlOrBoundary.permission;
    this.pool = this.boundary === "public" || this.boundary === "site_admin"
      ? getRuntimePostgresPool()
      : this.boundary === "owner"
        ? getOwnerPostgresPool()
        : getSystemPostgresPool();
  }

  private async installEditorialContext(client: PoolClient, siteId: string, actorId?: string) {
    if (this.boundary !== "site_admin") return;
    if (!this.sessionHash) throw new InformationRepositoryError("editorial_access_denied");
    const result = await client.query(
      "select * from information_editorial_install_context($1,$2)",
      [this.sessionHash, siteId],
    );
    const accountId = result.rows[0]?.account_id as string | undefined;
    if (!accountId || (actorId && accountId !== actorId))
      throw new InformationRepositoryError("editorial_access_denied");
  }

  private async editorialRead<T>(siteId: string, query: (client: PoolClient) => Promise<T>) {
    if (this.boundary !== "site_admin") return query(this.pool as unknown as PoolClient);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, siteId);
      const value = await query(client);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createOwnerPublication(input: OwnerInformationPublicationInput) {
    if (this.boundary === "owner") {
      if (!this.sessionHash) throw new InformationRepositoryError("owner_required");
      const result = await this.pool.query(
        "select owner_information_create_publication($1,$2::jsonb,$3,$4) value",
        [this.sessionHash, JSON.stringify({
          id: input.site.id, slug: input.site.slug, visibility: input.site.visibility,
          document: input.site, email: input.email, publicationName: input.publicationName,
          tagline: input.tagline, subcategory: input.subcategory, locale: input.locale,
          themeKey: input.themeKey ?? "auto",
        }), input.passwordHash, this.correlationId ?? ""],
      );
      const value = result.rows[0]?.value;
      if (!value) throw new InformationRepositoryError("owner_required");
      return value;
    }
    const client = await this.pool.connect();
    const email = requiredText(input.email, 320).toLowerCase();
    const siteId = requiredText(input.site.id, 160);
    const slug = requiredText(input.site.slug, 180);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new InformationRepositoryError("invalid_publication_slug");
    if (input.site.visibility !== "public")
      throw new InformationRepositoryError("publication_must_be_public");
    try {
      await client.query("begin");
      const [existingSlug, existingEmail] = await Promise.all([
        client.query("select id from sites where slug=$1 for update", [slug]),
        client.query("select site_id from site_admin_accounts where email=$1 for update", [email]),
      ]);
      if (existingSlug.rows[0]) throw new InformationRepositoryError("publication_slug_taken");
      if (existingEmail.rows[0]) throw new InformationRepositoryError("publication_admin_email_taken");

      await client.query(
        `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,onboarding_source,trial_email,site_kind)
         values($1,$2,'public','public',$3,now(),now(),now(),'owner_outreach',$4,'information')`,
        [siteId, slug, JSON.stringify(input.site), email],
      );
      const accountId = randomUUID();
      await client.query(
        "insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,$3,$4)",
        [accountId, siteId, email, requiredText(input.passwordHash, 1000)],
      );
      const settings = await client.query(
        `insert into site_editorial_settings(site_id,publication_name,tagline,subcategory,locale,theme_key,navigation)
         values($1,$2,$3,$4,$5,$6,'[]'::jsonb) returning *`,
        [siteId, requiredText(input.publicationName, 160), optionalText(input.tagline, 500) ?? null, input.subcategory, input.locale, input.themeKey ?? "auto"],
      );
      await client.query(
        "insert into site_editorial_memberships(account_id,site_id,role,granted_by) values($1,$2,'administrator','owner-publication-create')",
        [accountId, siteId],
      );
      await client.query(
        "insert into audit_events(id,entity_type,entity_id,action,details) values($1,'information_publication',$2,'owner_publication_created',$3)",
        [randomUUID(), siteId, JSON.stringify({ slug, email })],
      );
      await recordAudit(client, {
        actorType: "owner", actorId: "owner-publication-create", siteId,
        action: "information_site.created", details: { slug, subcategory: input.subcategory },
      });
      await client.query("commit");
      const row = settings.rows[0];
      return {
        siteId,
        slug,
        accountId,
        email,
        settings: {
          siteId: row.site_id,
          publicationName: row.publication_name,
          tagline: row.tagline ?? undefined,
          subcategory: row.subcategory,
          locale: row.locale,
          themeKey: row.theme_key,
          navigation: row.navigation,
          updatedAt: iso(row.updated_at)!,
        } as InformationSiteSettings,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async configureSite(input: ContentActor & {
    siteId: string;
    publicationName: string;
    tagline?: string;
    subcategory: InformationSubcategory;
    locale: SupportedLocale;
    themeKey?: ThemeSelection;
    navigation?: InformationSiteSettings["navigation"];
  }): Promise<InformationSiteSettings> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      const site = await client.query("select id from sites where id=$1 for update", [input.siteId]);
      if (!site.rows[0]) throw new InformationRepositoryError("site_not_found");
      if (this.boundary !== "site_admin")
        await client.query("update sites set site_kind='information' where id=$1", [input.siteId]);
      const result = await client.query(this.boundary === "site_admin" ?
        `update site_editorial_settings set publication_name=$2,tagline=$3,subcategory=$4,locale=$5,theme_key=$6,
           navigation=$7,settings_version=settings_version+1,updated_at=now() where site_id=$1 returning *` :
        `insert into site_editorial_settings(site_id,publication_name,tagline,subcategory,locale,theme_key,navigation)
         values($1,$2,$3,$4,$5,$6,$7)
         on conflict(site_id) do update set publication_name=excluded.publication_name,tagline=excluded.tagline,
           subcategory=excluded.subcategory,locale=excluded.locale,theme_key=excluded.theme_key,
           navigation=excluded.navigation,settings_version=site_editorial_settings.settings_version+1,updated_at=now()
         returning *`,
        [input.siteId, requiredText(input.publicationName, 160), optionalText(input.tagline, 500) ?? null, input.subcategory, input.locale, input.themeKey ?? "auto", JSON.stringify(input.navigation ?? [])],
      );
      if (this.boundary !== "site_admin") await client.query(
        `insert into site_editorial_memberships(account_id,site_id,role,granted_by)
         select id,site_id,'administrator',$2 from site_admin_accounts where site_id=$1
         on conflict(account_id,site_id) do nothing`,
        [input.siteId, input.actorId],
      );
      await recordAudit(client, { ...input, action: "information_site.configured", details: { subcategory: input.subcategory } });
      await client.query("commit");
      const row = result.rows[0];
      return {
        siteId: row.site_id,
        publicationName: row.publication_name,
        tagline: row.tagline ?? undefined,
        subcategory: row.subcategory,
        locale: row.locale,
        themeKey: row.theme_key,
        navigation: row.navigation,
        updatedAt: iso(row.updated_at)!,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSettings(siteId: string): Promise<InformationSiteSettings | null> {
    const result = await this.editorialRead(siteId, (client) => client.query("select * from site_editorial_settings where site_id=$1", [siteId]));
    const row = result.rows[0];
    return row ? {
      siteId: row.site_id,
      publicationName: row.publication_name,
      tagline: row.tagline ?? undefined,
      subcategory: row.subcategory,
      locale: row.locale,
      themeKey: row.theme_key,
      navigation: row.navigation,
      updatedAt: iso(row.updated_at)!,
    } : null;
  }

  async configureAdSlots(input: ContentActor & {
    siteId: string;
    slots: Array<{ slotKey: InformationAdSlotKey; format: InformationAdFormat; enabled: boolean }>;
  }): Promise<InformationAdSlot[]> {
    if (this.boundary === "site_admin")
      throw new InformationRepositoryError("owner_required");
    const unique = new Set(input.slots.map((slot) => slot.slotKey));
    if (unique.size !== input.slots.length || input.slots.length > informationAdSlotKeys.length ||
        input.slots.some((slot) => !isInformationAdSlotKey(slot.slotKey) || !isInformationAdFormat(slot.format)))
      throw new InformationRepositoryError("invalid_ad_slot_configuration");
    if (this.boundary === "owner") {
      if (!this.sessionHash) throw new InformationRepositoryError("owner_required");
      const result = await this.pool.query(
        "select owner_information_configure_ad_slots($1,$2,$3::jsonb,$4) value",
        [this.sessionHash, input.siteId, JSON.stringify(input.slots), this.correlationId ?? ""],
      );
      const value = result.rows[0]?.value as InformationAdSlot[] | null | undefined;
      if (!value) throw new InformationRepositoryError("owner_required");
      return value;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      for (const slot of input.slots) {
        await client.query(
          `insert into site_information_ad_slots(site_id,slot_key,format,enabled)
           values($1,$2,$3,$4)
           on conflict(site_id,slot_key) do update set
             format=excluded.format,enabled=excluded.enabled,updated_at=now()`,
          [input.siteId, slot.slotKey, slot.format, slot.enabled],
        );
      }
      await recordAudit(client, {
        ...input,
        action: "information_ad_slots.configured",
        details: { slots: input.slots.map(({ slotKey, format, enabled }) => ({ slotKey, format, enabled })) },
      });
      await client.query("commit");
      return this.listAdSlots(input.siteId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAdSlots(siteId: string, enabledOnly = false): Promise<InformationAdSlot[]> {
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    const result = await client.query(
      `select site_id,slot_key,format,enabled,updated_at
       from site_information_ad_slots
       where site_id=$1 ${enabledOnly ? "and enabled" : ""}
       order by slot_key`,
      [siteId],
    );
    return result.rows.map((row) => ({
      siteId: row.site_id as string,
      slotKey: row.slot_key as InformationAdSlotKey,
      format: row.format as InformationAdFormat,
      enabled: row.enabled as boolean,
      updatedAt: iso(row.updated_at)!,
    }));
    });
  }

  async listAdSlotsForSiteAdmin(siteId: string, enabledOnly = false): Promise<InformationAdSlot[]> {
    if (this.boundary === "site_admin") return this.listAdSlots(siteId, enabledOnly);
    if (databaseRlsMode() === "off") return this.listAdSlots(siteId, enabledOnly);
    throw new InformationRepositoryError("editorial_access_denied");
  }

  private mapSponsorBanner(row: Record<string, any>): InformationSponsorBanner {
    return {
      id: row.id, siteId: row.site_id, slotKey: row.slot_key,
      sponsorName: row.sponsor_name, headline: row.headline, description: row.description,
      callToAction: row.call_to_action, destinationUrl: row.destination_url,
      imageMediaId: row.image_media_id ?? undefined,
      imageUrl: row.image_media_id ? `/api/media/${row.image_media_id}` : undefined,
      enabled: row.enabled, sortOrder: row.sort_order, version: row.lock_version,
    };
  }

  async listSponsorBanners(siteId: string): Promise<InformationSponsorBanner[]> {
    return this.editorialRead(siteId, async (client) => {
      await assertInformationSite(client, siteId);
      const result = await client.query(
        `select * from site_information_sponsor_banners where site_id=$1
         order by slot_key,sort_order,created_at,id limit 100`, [siteId],
      );
      return result.rows.map((row) => this.mapSponsorBanner(row));
    });
  }

  async saveSponsorBanner(input: SaveSponsorBannerInput): Promise<InformationSponsorBanner> {
    if (this.boundary !== "site_admin" || input.actorType !== "site_admin")
      throw new InformationRepositoryError("editorial_access_denied");
    if (!isInformationAdSlotKey(input.slotKey))
      throw new InformationRepositoryError("invalid_ad_slot_configuration");
    const sponsorName = requiredText(input.sponsorName, 160);
    const headline = requiredText(input.headline, 200);
    const description = optionalText(input.description, 300) ?? "";
    const callToAction = requiredText(input.callToAction, 60);
    const destinationUrl = sponsorDestination(input.destinationUrl);
    const sortOrder = input.sortOrder ?? 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000)
      throw new InformationRepositoryError("invalid_sponsor_order");
    if (input.enabled && !input.imageMediaId)
      throw new InformationRepositoryError("sponsor_image_required");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      if (input.imageMediaId) await this.assertMediaOwned(client, input.siteId, [input.imageMediaId]);
      const id = input.id ?? randomUUID();
      let result;
      if (input.id) {
        if (!Number.isInteger(input.expectedVersion) || input.expectedVersion! < 1)
          throw new InformationRepositoryError("invalid_sponsor_version");
        result = await client.query(
          `update site_information_sponsor_banners set
             slot_key=$4,sponsor_name=$5,headline=$6,description=$7,call_to_action=$8,
             destination_url=$9,image_media_id=$10,enabled=$11,sort_order=$12,
             lock_version=lock_version+1,updated_at=now()
           where site_id=$1 and id=$2 and lock_version=$3 returning *`,
          [input.siteId, id, input.expectedVersion, input.slotKey, sponsorName, headline,
            description, callToAction, destinationUrl, input.imageMediaId || null, input.enabled, sortOrder],
        );
        if (!result.rowCount) throw new InformationRepositoryError("sponsor_banner_not_found_or_stale");
      } else {
        result = await client.query(
          `insert into site_information_sponsor_banners
             (id,site_id,slot_key,sponsor_name,headline,description,call_to_action,
              destination_url,image_media_id,enabled,sort_order)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
          [id, input.siteId, input.slotKey, sponsorName, headline, description,
            callToAction, destinationUrl, input.imageMediaId || null, input.enabled, sortOrder],
        );
      }
      await recordAudit(client, { ...input,
        action: input.id ? "sponsor_banner.updated" : "sponsor_banner.created",
        details: { bannerId: id, slotKey: input.slotKey, enabled: input.enabled },
      });
      await client.query("commit");
      return this.mapSponsorBanner(result.rows[0]);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async getEditorialRole(accountId: string, siteId: string): Promise<EditorialRole | null> {
    const result = await this.editorialRead(siteId, (client) => client.query(
      `select membership.role
       from site_editorial_memberships membership
       join sites site on site.id=membership.site_id and site.site_kind='information'
       where membership.account_id=$1 and membership.site_id=$2`,
      [accountId, siteId],
    ));
    return (result.rows[0]?.role as EditorialRole | undefined) ?? null;
  }

  async createCategory(input: ContentActor & { siteId: string; name: string; slug: string; description?: string; sortOrder?: number }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const id = randomUUID();
      const result = await client.query(
        `insert into site_article_categories(id,site_id,name,slug,description,sort_order)
         values($1,$2,$3,$4,$5,$6) returning *`,
        [id, input.siteId, requiredText(input.name, 120), articleSlug(input.slug), optionalText(input.description, 1000) ?? null, input.sortOrder ?? 0],
      );
      await recordAudit(client, { ...input, action: "article_category.created", details: { categoryId: id } });
      await client.query("commit");
      return result.rows[0];
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCategories(siteId: string) {
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    return (await client.query(
      "select id,site_id,name,slug,description,sort_order,created_at,updated_at from site_article_categories where site_id=$1 order by sort_order,name",
      [siteId],
    )).rows;
    });
  }

  async registerMediaAsset(input: ContentActor & {
    siteId: string;
    storageProvider: "vercel_blob" | "postgres" | "r2";
    providerAuthority?: string;
    storageKey: string;
    storageAccess?: "public" | "private";
    mimeType: string;
    altText?: string;
    width?: number;
    height?: number;
    byteSize: number;
  }) {
    if (this.boundary === "system") {
      if (input.storageProvider === "r2") throw new InformationRepositoryError("integration_not_authorized");
      if (!this.integrationId || this.integrationSiteId !== input.siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const result = await this.pool.query(
        "select information_redi_register_media($1,$2,$3::jsonb) value",
        [this.integrationId, input.siteId, JSON.stringify(input)],
      );
      const row = result.rows[0]?.value;
      if (!row) throw new InformationRepositoryError("integration_not_authorized");
      return {
        id: row.id, siteId: row.site_id, storageProvider: row.storage_provider,
        storageKey: "", storageAccess: row.storage_access, publicUrl: row.public_url,
        mimeType: row.mime_type, altText: row.alt_text ?? undefined, width: row.width,
        height: row.height, byteSize: row.byte_size, createdAt: iso(row.created_at)!,
      };
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const id = randomUUID();
      const storageAccess = input.storageAccess ?? "private";
      validateMediaRegistration({ ...input, storageAccess });
      if ((input.storageProvider === "vercel_blob" || input.storageProvider === "r2") &&
          (storageAccess !== "private" || !input.storageKey.startsWith(`sites/${input.siteId}/editorial/`)))
        throw new InformationRepositoryError("invalid_media_storage");
      if (input.storageProvider === "r2" && (!/^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.providerAuthority ?? "") || /backup|recovery/.test(input.providerAuthority ?? "") || input.storageKey.includes("..") || /[%?#\\\s]/.test(input.storageKey))) throw new InformationRepositoryError("invalid_media_storage");
      const publicUrl = `/api/media/${id}`;
      const result = await client.query(
        `insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,alt_text,width,height,byte_size,provider_authority)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [id, input.siteId, input.storageProvider, requiredText(input.storageKey, 1000), storageAccess, publicUrl,
          input.mimeType, optionalText(input.altText, 500) ?? null, input.width, input.height, input.byteSize, input.providerAuthority ?? null],
      );
      await recordAudit(client, { ...input, action: "media_asset.registered", details: { mediaAssetId: id } });
      await client.query("commit");
      return result.rows[0];
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listMediaAssets(siteId: string) {
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    return (await client.query(
      `select id,site_id,storage_provider,storage_key,public_url,mime_type,alt_text,width,height,byte_size,created_at
       from site_media_assets where site_id=$1 order by created_at desc limit 200`,
      [siteId],
    )).rows.map((row) => ({
      id: row.id as string,
      siteId: row.site_id as string,
      storageProvider: row.storage_provider as "vercel_blob" | "postgres" | "r2",
      storageKey: row.storage_key as string,
      publicUrl: `/api/media/${row.id}`,
      mimeType: row.mime_type as string,
      altText: row.alt_text as string | null,
      width: row.width as number | null,
      height: row.height as number | null,
      byteSize: row.byte_size as number,
      createdAt: iso(row.created_at)!,
    }));
    });
  }

  async listMediaAssetsPage(siteId: string, input: { limit?: number; before?: { createdAt: string; id: string } } = {}) {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
      const result = await this.pool.query(
        "select information_redi_list_media($1,$2,$3::jsonb) value",
        [this.integrationId, siteId, JSON.stringify({ limit, createdAt: input.before?.createdAt, id: input.before?.id })],
      );
      const rows = (result.rows[0]?.value ?? []) as Record<string, any>[];
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return { items: page.map((row) => ({
        id: row.id, siteId: row.site_id, storageProvider: row.storage_provider,
        storageAccess: row.storage_access, mimeType: row.mime_type, altText: row.alt_text ?? undefined,
        width: row.width, height: row.height, byteSize: row.byte_size, createdAt: iso(row.created_at)!,
      })), nextCursor: rows.length > limit && last ? { createdAt: iso(last.created_at)!, id: last.id } : undefined };
    }
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
    const values: unknown[] = [siteId];
    const cursor = input.before;
    const cursorWhere = cursor
      ? `and (created_at,id) < ($2::timestamptz,$3::uuid)`
      : "";
    if (cursor) values.push(cursor.createdAt, cursor.id);
    values.push(limit + 1);
    const result = await client.query(
      `select id,site_id,storage_provider,storage_key,mime_type,alt_text,width,height,byte_size,created_at
       from site_media_assets where site_id=$1 ${cursorWhere}
       order by created_at desc,id desc limit $${values.length}`,
      values,
    );
    const rows = result.rows.slice(0, limit);
    const items = rows.map((row) => ({
      id: row.id as string,
      siteId: row.site_id as string,
      url: `/api/media/${row.id}`,
      mimeType: row.mime_type as string,
      altText: row.alt_text as string | null,
      width: row.width as number | null,
      height: row.height as number | null,
      byteSize: row.byte_size as number,
      createdAt: iso(row.created_at)!,
    }));
    const last = rows.at(-1);
    return {
      items,
      nextCursor: result.rows.length > limit && last
        ? { createdAt: iso(last.created_at)!, id: last.id as string }
        : undefined,
    };
    });
  }

  private async assertMediaOwned(client: Pool | PoolClient, siteId: string, mediaIds: string[]) {
    const ids = normalizeMediaIds(mediaIds);
    if (!ids.length) return ids;
    const result = await client.query(
      "select id from site_media_assets where site_id=$1 and id=any($2::uuid[])",
      [siteId, ids],
    );
    if (result.rowCount !== ids.length) throw new InformationRepositoryError("media_not_owned_by_site");
    return ids;
  }

  private async replaceArticleMedia(client: PoolClient, siteId: string, articleId: string, mediaIds: string[]) {
    const ids = await this.assertMediaOwned(client, siteId, mediaIds);
    await client.query("delete from site_article_media where site_id=$1 and article_id=$2", [siteId, articleId]);
    for (const [sortOrder, mediaId] of ids.entries()) {
      await client.query(
        "insert into site_article_media(site_id,article_id,media_id,sort_order) values($1,$2,$3,$4)",
        [siteId, articleId, mediaId, sortOrder],
      );
    }
  }

  private async getArticleMedia(client: Pool | PoolClient, siteId: string, articleId: string): Promise<InformationArticleMedia[]> {
    const result = await client.query(
      `select media.id,media.alt_text,media.width,media.height
       from site_article_media relation
       join site_media_assets media on media.site_id=relation.site_id and media.id=relation.media_id
       where relation.site_id=$1 and relation.article_id=$2 order by relation.sort_order`,
      [siteId, articleId],
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      url: `/api/media/${row.id}`,
      altText: row.alt_text ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
    }));
  }

  async getMediaAssetForDelivery(assetId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) return null;
    if (this.boundary === "public" || this.boundary === "site_admin") {
      const result = await this.pool.query(
        this.boundary === "public"
          ? "select * from resolve_public_information_media($1)"
          : "select * from resolve_editor_information_media($1,$2)",
        this.boundary === "public" ? [assetId] : [this.sessionHash ?? "", assetId],
      );
      const row = result.rows[0];
      const authority = row?.storage_provider === "r2" ? (await this.pool.query("select resolve_information_r2_authority($1,$2) as authority", [assetId, this.boundary === "site_admin" ? this.sessionHash ?? "" : null])).rows[0]?.authority : undefined;
      return row ? {
        providerAuthority: authority as string | undefined,
        id: assetId, siteId: row.site_id as string,
        storageProvider: row.storage_provider as "vercel_blob" | "postgres" | "r2",
        storageKey: row.storage_key as string,
        storageAccess: row.storage_access as "public" | "private",
        mimeType: row.mime_type as string, width: 0, height: 0,
        byteSize: row.byte_size as number, customDomain: row.custom_domain as string | null,
        customDomainVerified: row.custom_domain_verified as boolean,
        publiclyAvailable: row.publicly_available as boolean,
      } : null;
    }
    const result = await this.pool.query(
      `select media.id,media.site_id,media.storage_provider,media.storage_key,media.storage_access,
        media.provider_authority,media.mime_type,media.width,media.height,media.byte_size,
        site.custom_domain,site.custom_domain_status,site.visibility,site.activated_at,
        exists(
          select 1 from site_articles article
          where article.site_id=media.site_id and article.status='published'
            and article.published_at is not null
            and (article.publish_at is null or article.publish_at <= now())
            and (
              article.featured_media_id=media.id or exists(
                select 1 from site_article_media relation
                where relation.site_id=article.site_id and relation.article_id=article.id and relation.media_id=media.id
              )
            )
        ) as referenced_by_published_article,
        exists(
          select 1 from site_information_sponsor_banners banner
          where banner.site_id=media.site_id and banner.image_media_id=media.id and banner.enabled
        ) as referenced_by_active_sponsor
       from site_media_assets media
       join sites site on site.id=media.site_id and site.site_kind='information'
       where media.id=$1`,
      [assetId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      providerAuthority: row.provider_authority as string | undefined,
      id: row.id as string,
      siteId: row.site_id as string,
      storageProvider: row.storage_provider as "vercel_blob" | "postgres" | "r2",
      storageKey: row.storage_key as string,
      storageAccess: row.storage_access as "public" | "private",
      mimeType: row.mime_type as string,
      width: row.width as number,
      height: row.height as number,
      byteSize: row.byte_size as number,
      customDomain: row.custom_domain as string | null,
      customDomainVerified: row.custom_domain_status === "verified",
      publiclyAvailable: row.visibility === "public" && Boolean(row.activated_at) &&
        (row.referenced_by_published_article || row.referenced_by_active_sponsor),
    };
  }

  async getInformationMediaBlob(siteId: string, storageKey: string, assetId?: string) {
    if ((this.boundary === "public" || this.boundary === "site_admin") && assetId) {
      const result = await this.pool.query(
        "select * from resolve_information_media_blob($1,$2)",
        [assetId, this.boundary === "site_admin" ? this.sessionHash ?? "" : null],
      );
      return result.rows[0]
        ? { contentType: result.rows[0].content_type as string, data: result.rows[0].data as Buffer }
        : null;
    }
    const result = await this.pool.query(
      `select blob.content_type,blob.data from site_media_blobs blob
       join sites site on site.id=blob.site_id and site.site_kind='information'
       where blob.site_id=$1 and blob.id=$2`,
      [siteId, storageKey],
    );
    return result.rows[0]
      ? { contentType: result.rows[0].content_type as string, data: result.rows[0].data as Buffer }
      : null;
  }

  async createArticle(input: CreateArticleInput): Promise<InformationArticle> {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== input.siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const result = await this.pool.query(
        "select information_redi_create_article($1,$2,$3::jsonb) value",
        [this.integrationId, input.siteId, JSON.stringify(input)],
      );
      const row = result.rows[0]?.value;
      if (!row) throw new InformationRepositoryError("integration_not_authorized");
      return mapArticle(row, row.sources ?? [], (row.article_media ?? []).map((media: Record<string, any>) => ({ id: media.id, url: media.url, altText: media.alt_text ?? undefined, sortOrder: media.sort_order })));
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const id = randomUUID();
      const sources = normalizeSources(input.sources);
      const featuredMediaId = input.featuredMediaId ?? null;
      if (featuredMediaId) await this.assertMediaOwned(client, input.siteId, [featuredMediaId]);
      const articleMediaIds = await this.assertMediaOwned(client, input.siteId, input.articleMediaIds ?? []);
      const result = await client.query(
        `insert into site_articles(
          id,site_id,category_id,external_source,external_reference,slug,title,excerpt,body,
          featured_media_id,featured_image_alt,tags,display_author,status,featured,publish_at,
          seo_title,seo_description,canonical_url
        ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        returning *`,
        [id, input.siteId, input.categoryId ?? null, input.externalSource, optionalText(input.externalReference, 300) ?? null,
          articleSlug(input.slug), requiredText(input.title, 240), optionalText(input.excerpt, 1000) ?? "", JSON.stringify(validateBody(input.body)),
          featuredMediaId, optionalText(input.featuredImageAlt, 500) ?? null, normalizeTags(input.tags),
          optionalText(input.displayAuthor, 200) ?? null, input.status ?? "draft", input.featured ?? false,
          input.publishAt ?? null, optionalText(input.seoTitle, 240) ?? null, optionalText(input.seoDescription, 500) ?? null,
          optionalHttpUrl(input.canonicalUrl, 2000) ?? null],
      );
      await this.replaceSources(client, input.siteId, id, sources);
      await this.replaceArticleMedia(client, input.siteId, id, articleMediaIds);
      await recordAudit(client, { ...input, articleId: id, action: "article.created", details: { status: input.status ?? "draft" } });
      const articleMedia = await this.getArticleMedia(client, input.siteId, id);
      await client.query("commit");
      return mapArticle(
        result.rows[0],
        sources.map((source, sortOrder) => ({ ...source, sortOrder })),
        articleMedia,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getArticle(siteId: string, articleId: string): Promise<InformationArticle | null> {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== siteId) return null;
      const result = await this.pool.query(
        "select information_redi_article_json($1,$2,$3,$4) value",
        [this.integrationId, siteId, articleId, this.integrationPermission ?? "articles:read"],
      );
      const row = result.rows[0]?.value;
      return row ? mapArticle(row, row.sources ?? [], (row.article_media ?? []).map((media: Record<string, any>) => ({ id: media.id, url: media.url, altText: media.alt_text ?? undefined, sortOrder: media.sort_order }))) : null;
    }
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    const result = await client.query("select * from site_articles where site_id=$1 and id=$2", [siteId, articleId]);
    if (!result.rows[0]) return null;
    return mapArticle(
      result.rows[0],
      await this.getSourcesWithClient(client, siteId, articleId),
      await this.getArticleMedia(client, siteId, articleId),
    );
    });
  }

  async listArticles(siteId: string, filters: ArticleListFilters = {}) {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
      const result = await this.pool.query(
        "select information_redi_list_articles($1,$2,$3::jsonb) value",
        [this.integrationId, siteId, JSON.stringify({ ...filters, createdAt: filters.createdBefore?.createdAt, id: filters.createdBefore?.id })],
      );
      const rows = (result.rows[0]?.value ?? []) as Record<string, any>[];
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return { items: page.map((row) => { const { body: _body, sources: _sources, ...summary } = mapArticle(row, []); return summary; }), nextCursor: rows.length > limit && last ? { createdAt: iso(last.created_at)!, id: last.id } : undefined };
    }
    return this.editorialRead(siteId, async (client) => {
    await assertInformationSite(client, siteId);
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 50);
    const values: unknown[] = [siteId];
    const where = ["site_id=$1"];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (filters.status) where.push(`status=${add(filters.status)}`);
    if (filters.categoryId) where.push(`category_id=${add(filters.categoryId)}`);
    if (filters.tag) where.push(`${add(filters.tag.toLowerCase())}=any(tags)`);
    if (filters.query?.trim()) {
      const placeholder = add(`%${filters.query.trim()}%`);
      where.push(`(title ilike ${placeholder} or excerpt ilike ${placeholder})`);
    }
    if (filters.createdBefore) {
      const createdAt = add(filters.createdBefore.createdAt);
      const id = add(filters.createdBefore.id);
      where.push(`(created_at,id) < (${createdAt}::timestamptz,${id}::uuid)`);
    }
    values.push(limit + 1);
    const result = await client.query(
      `select id,site_id,category_id,external_source,external_reference,slug,title,excerpt,
        featured_media_id,featured_image_alt,tags,display_author,status,featured,publish_at,
        published_at,seo_title,seo_description,canonical_url,lock_version,created_at,updated_at
       from site_articles where ${where.join(" and ")}
       order by created_at desc,id desc limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const items: ArticleSummary[] = rows.map((row) => {
      const { body: _body, sources: _sources, ...summary } = mapArticle({ ...row, body: { version: 1, blocks: [] } }, []);
      return summary;
    });
    const last = rows.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? { createdAt: iso(last.created_at)!, id: last.id } : undefined,
    };
    });
  }

  private async getPublicSiteByIdentity(identity: PublicInformationIdentity): Promise<PublicInformationSite | null> {
    if (this.boundary === "public") {
      const result = await this.pool.query(
        "select resolve_public_information_site($1,$2) value",
        [identity.kind, identity.value],
      );
      const site = (result.rows[0]?.value as PublicInformationSite | null | undefined) ?? null;
      if (!site) return null;
      const banners = await this.pool.query(
        "select resolve_public_information_sponsors($1,$2) value",
        [identity.kind, identity.value],
      );
      return { ...site, sponsorBanners: (banners.rows[0]?.value as InformationSponsorBanner[]) ?? [] };
    }
    const site = await this.pool.query(
      `select site.id,site.slug,settings.*
       from sites site
       join site_editorial_settings settings on settings.site_id=site.id
       where ${publicSiteIdentityPredicate(identity)} and site.site_kind='information'
         and site.visibility='public' and site.activated_at is not null`,
      [identity.value],
    );
    const row = site.rows[0];
    if (!row) return null;
    const categories = (await this.pool.query(
      `select id as category_id,name as category_name,slug as category_slug,
        description as category_description,sort_order as category_sort_order
       from site_article_categories where site_id=$1 order by sort_order,name`,
      [row.id],
    )).rows.map((category) => mapPublicCategory(category)!);
    return {
      siteId: row.id,
      slug: row.slug,
      publicationName: row.publication_name,
      tagline: row.tagline ?? undefined,
      subcategory: row.subcategory,
      locale: row.locale,
      themeKey: row.theme_key,
      navigation: row.navigation,
      updatedAt: iso(row.updated_at)!,
      categories,
      adSlots: await this.listAdSlots(row.id, true),
      sponsorBanners: (await this.pool.query(
        `select * from site_information_sponsor_banners where site_id=$1 and enabled
         order by slot_key,sort_order,created_at,id limit 100`, [row.id],
      )).rows.map((banner) => this.mapSponsorBanner(banner)),
    };
  }

  async getPublicSiteBySlug(slug: string) {
    return this.getPublicSiteByIdentity({ kind: "slug", value: slug });
  }

  async getPublicSiteByDomain(domain: string) {
    return this.getPublicSiteByIdentity({ kind: "domain", value: domain });
  }

  private async listPublicArticlesByIdentity(identity: PublicInformationIdentity, input: PublicArticleListInput) {
    if (this.boundary === "public") {
      const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
      const result = await this.pool.query(
        "select resolve_public_information_articles($1,$2,$3::jsonb) value",
        [identity.kind, identity.value, JSON.stringify({
          categorySlug: input.categorySlug,
          publishedAt: input.publishedBefore?.publishedAt,
          id: input.publishedBefore?.id,
          featuredFirst: input.featuredFirst ?? false,
          limit,
        })],
      );
      const rows = (result.rows[0]?.value?.items ?? []) as Record<string, any>[];
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(mapPublicSummary),
        nextCursor: hasMore && last ? { publishedAt: iso(last.published_at)!, id: last.id as string } : undefined,
      };
    }
    const limit = Math.min(Math.max(input.limit ?? 13, 1), 50);
    const values: unknown[] = [identity.value];
    const where = [
      publicSiteIdentityPredicate(identity),
      "site.site_kind='information'",
      "site.visibility='public'",
      "site.activated_at is not null",
      "article.status='published'",
      "article.published_at is not null",
      "(article.publish_at is null or article.publish_at <= now())",
    ];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (input.categorySlug) where.push(`category.slug=${add(input.categorySlug)}`);
    if (input.publishedBefore) {
      const publishedAt = add(input.publishedBefore.publishedAt);
      const id = add(input.publishedBefore.id);
      where.push(`(article.published_at,article.id) < (${publishedAt}::timestamptz,${id}::uuid)`);
    }
    values.push(limit + 1);
    const result = await this.pool.query(
      `select article.id,article.slug,article.title,article.excerpt,article.tags,
        article.display_author,article.featured,article.published_at,article.featured_image_alt,
        category.id as category_id,category.name as category_name,category.slug as category_slug,
        category.description as category_description,category.sort_order as category_sort_order,
        case when media.id is not null then '/api/media/' || media.id end as featured_image_url
       from site_articles article
       join sites site on site.id=article.site_id
       left join site_article_categories category on category.site_id=article.site_id and category.id=article.category_id
       left join site_media_assets media on media.site_id=article.site_id and media.id=article.featured_media_id
       where ${where.join(" and ")}
       order by ${input.featuredFirst ? "article.featured desc," : ""} article.published_at desc,article.id desc
       limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: rows.map(mapPublicSummary),
      nextCursor: hasMore && last
        ? { publishedAt: iso(last.published_at)!, id: last.id as string }
        : undefined,
    };
  }

  async listPublicArticlesBySlug(input: PublicArticleListInput & { siteSlug: string }) {
    const { siteSlug, ...filters } = input;
    return this.listPublicArticlesByIdentity({ kind: "slug", value: siteSlug }, filters);
  }

  async listPublicArticlesByDomain(input: PublicArticleListInput & { domain: string }) {
    const { domain, ...filters } = input;
    return this.listPublicArticlesByIdentity({ kind: "domain", value: domain }, filters);
  }

  private async getPublicArticleByIdentity(identity: PublicInformationIdentity, articleSlug: string): Promise<PublicInformationArticle | null> {
    if (this.boundary === "public") {
      const result = await this.pool.query(
        "select resolve_public_information_article($1,$2,$3) value",
        [identity.kind, identity.value, articleSlug],
      );
      const row = result.rows[0]?.value as Record<string, any> | null | undefined;
      if (!row) return null;
      return {
        ...mapPublicSummary({ ...row, category_id: row.category?.id, category_name: row.category?.name,
          category_slug: row.category?.slug, category_description: row.category?.description,
          category_sort_order: row.category?.sortOrder }),
        body: row.body,
        articleMedia: (row.article_media ?? []).map((media: Record<string, any>) => ({
          id: media.id, url: media.url, altText: media.altText ?? undefined, sortOrder: media.sortOrder,
        })),
        seoTitle: row.seo_title ?? undefined,
        seoDescription: row.seo_description ?? undefined,
        canonicalUrl: row.canonical_url ?? undefined,
        sources: (row.sources ?? []).map((source: Record<string, any>) => ({
          label: source.label ?? undefined, url: source.url, sortOrder: source.sortOrder,
        })),
      };
    }
    const result = await this.pool.query(
      `select article.*,category.id as category_id,category.name as category_name,
        category.slug as category_slug,category.description as category_description,
        category.sort_order as category_sort_order,
        case when media.id is not null then '/api/media/' || media.id end as featured_image_url
       from site_articles article
       join sites site on site.id=article.site_id
       left join site_article_categories category on category.site_id=article.site_id and category.id=article.category_id
       left join site_media_assets media on media.site_id=article.site_id and media.id=article.featured_media_id
       where ${publicSiteIdentityPredicate(identity)} and article.slug=$2 and site.site_kind='information'
         and site.visibility='public' and site.activated_at is not null
         and article.status='published' and article.published_at is not null
         and (article.publish_at is null or article.publish_at <= now())`,
      [identity.value, articleSlug],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...mapPublicSummary(row),
      body: row.body,
      articleMedia: await this.getArticleMedia(this.pool, row.site_id, row.id),
      seoTitle: row.seo_title ?? undefined,
      seoDescription: row.seo_description ?? undefined,
      canonicalUrl: row.canonical_url ?? undefined,
      sources: await this.getSources(row.site_id, row.id),
    };
  }

  async getPublicArticleBySlug(siteSlug: string, articleSlug: string) {
    return this.getPublicArticleByIdentity({ kind: "slug", value: siteSlug }, articleSlug);
  }

  async getPublicArticleByDomain(domain: string, articleSlug: string) {
    return this.getPublicArticleByIdentity({ kind: "domain", value: domain }, articleSlug);
  }

  async updateArticle(input: UpdateArticleInput): Promise<InformationArticle> {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== input.siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const result = await this.pool.query(
        "select information_redi_update_article($1,$2,$3,$4,$5::jsonb) value",
        [this.integrationId, input.siteId, input.articleId, input.expectedVersion, JSON.stringify(input.patch)],
      );
      const row = result.rows[0]?.value;
      if (!row) throw new InformationRepositoryError("article_not_found");
      return mapArticle(row, row.sources ?? [], (row.article_media ?? []).map((media: Record<string, any>) => ({ id: media.id, url: media.url, altText: media.alt_text ?? undefined, sortOrder: media.sort_order })));
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const current = await client.query("select * from site_articles where site_id=$1 and id=$2 for update", [input.siteId, input.articleId]);
      if (!current.rows[0]) throw new InformationRepositoryError("article_not_found");
      if (current.rows[0].lock_version !== input.expectedVersion)
        throw new InformationRepositoryError("article_version_conflict");
      const patch = input.patch;
      if (patch.featuredMediaId) await this.assertMediaOwned(client, input.siteId, [patch.featuredMediaId]);
      const articleMediaIds = patch.articleMediaIds === undefined
        ? undefined
        : await this.assertMediaOwned(client, input.siteId, patch.articleMediaIds);
      const values = {
        categoryId: patch.categoryId === undefined ? current.rows[0].category_id : patch.categoryId,
        slug: patch.slug === undefined ? current.rows[0].slug : articleSlug(patch.slug),
        title: patch.title === undefined ? current.rows[0].title : requiredText(patch.title, 240),
        excerpt: patch.excerpt === undefined ? current.rows[0].excerpt : optionalText(patch.excerpt, 1000) ?? "",
        body: patch.body === undefined ? current.rows[0].body : validateBody(patch.body),
        mediaId: patch.featuredMediaId === undefined ? current.rows[0].featured_media_id : patch.featuredMediaId,
        imageAlt: patch.featuredImageAlt === undefined ? current.rows[0].featured_image_alt : optionalText(patch.featuredImageAlt, 500) ?? null,
        tags: patch.tags === undefined ? current.rows[0].tags : normalizeTags(patch.tags),
        author: patch.displayAuthor === undefined ? current.rows[0].display_author : optionalText(patch.displayAuthor, 200) ?? null,
        featured: patch.featured === undefined ? current.rows[0].featured : patch.featured,
        publishAt: patch.publishAt === undefined ? current.rows[0].publish_at : patch.publishAt,
        seoTitle: patch.seoTitle === undefined ? current.rows[0].seo_title : optionalText(patch.seoTitle, 240) ?? null,
        seoDescription: patch.seoDescription === undefined ? current.rows[0].seo_description : optionalText(patch.seoDescription, 500) ?? null,
        canonicalUrl: patch.canonicalUrl === undefined ? current.rows[0].canonical_url : optionalHttpUrl(patch.canonicalUrl, 2000) ?? null,
      };
      const result = await client.query(
        `update site_articles set category_id=$3,slug=$4,title=$5,excerpt=$6,body=$7,featured_media_id=$8,
          featured_image_alt=$9,tags=$10,display_author=$11,featured=$12,publish_at=$13,seo_title=$14,
          seo_description=$15,canonical_url=$16,lock_version=lock_version+1,updated_at=now()
         where site_id=$1 and id=$2 returning *`,
        [input.siteId, input.articleId, values.categoryId ?? null, values.slug, values.title, values.excerpt,
          JSON.stringify(values.body), values.mediaId ?? null, values.imageAlt, values.tags, values.author,
          values.featured, values.publishAt ?? null, values.seoTitle, values.seoDescription, values.canonicalUrl],
      );
      const sources = patch.sources === undefined
        ? await this.getSourcesWithClient(client, input.siteId, input.articleId)
        : normalizeSources(patch.sources);
      if (patch.sources !== undefined) await this.replaceSources(client, input.siteId, input.articleId, sources);
      if (articleMediaIds !== undefined)
        await this.replaceArticleMedia(client, input.siteId, input.articleId, articleMediaIds);
      await recordAudit(client, { ...input, action: "article.updated", details: { fromVersion: input.expectedVersion, fields: Object.keys(patch) } });
      const articleMedia = await this.getArticleMedia(client, input.siteId, input.articleId);
      await client.query("commit");
      return mapArticle(
        result.rows[0],
        sources.map((source, sortOrder) => ({ ...source, sortOrder })),
        articleMedia,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async transitionArticle(input: ContentActor & { siteId: string; articleId: string; expectedVersion: number; status: ArticleStatus; auditDetails?: Record<string, unknown> }) {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== input.siteId)
        throw new InformationRepositoryError("integration_not_authorized");
      const result = await this.pool.query(
        "select information_redi_transition_article($1,$2,$3,$4,$5) value",
        [this.integrationId, input.siteId, input.articleId, input.expectedVersion, input.status],
      );
      const row = result.rows[0]?.value;
      if (!row) throw new InformationRepositoryError("article_not_found");
      return mapArticle(row, row.sources ?? [], (row.article_media ?? []).map((media: Record<string, any>) => ({ id: media.id, url: media.url, altText: media.alt_text ?? undefined, sortOrder: media.sort_order })));
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const current = await client.query("select status,lock_version from site_articles where site_id=$1 and id=$2 for update", [input.siteId, input.articleId]);
      if (!current.rows[0]) throw new InformationRepositoryError("article_not_found");
      if (current.rows[0].lock_version !== input.expectedVersion)
        throw new InformationRepositoryError("article_version_conflict");
      if (!canTransitionArticleStatus(current.rows[0].status, input.status))
        throw new InformationRepositoryError("invalid_article_transition");
      const result = await client.query(
        `update site_articles set status=$3,
           published_at=case when $3='published' then coalesce(published_at,now()) else published_at end,
           lock_version=lock_version+1,updated_at=now()
         where site_id=$1 and id=$2 returning *`,
        [input.siteId, input.articleId, input.status],
      );
      await recordAudit(client, { ...input, action: `article.${input.status}`, details: { fromStatus: current.rows[0].status, ...input.auditDetails } });
      const sources = await this.getSourcesWithClient(client, input.siteId, input.articleId);
      const articleMedia = await this.getArticleMedia(client, input.siteId, input.articleId);
      await client.query("commit");
      return mapArticle(
        result.rows[0],
        sources,
        articleMedia,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteArticle(input: ContentActor & { siteId: string; articleId: string; expectedVersion: number }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.installEditorialContext(client, input.siteId, input.actorId);
      await assertInformationSite(client, input.siteId);
      const current = await client.query("select slug,lock_version from site_articles where site_id=$1 and id=$2 for update", [input.siteId, input.articleId]);
      if (!current.rows[0]) throw new InformationRepositoryError("article_not_found");
      if (current.rows[0].lock_version !== input.expectedVersion)
        throw new InformationRepositoryError("article_version_conflict");
      await recordAudit(client, { ...input, action: "article.deleted", details: { slug: current.rows[0].slug } });
      await client.query("delete from site_articles where site_id=$1 and id=$2", [input.siteId, input.articleId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeIntegrationNonce(input: { integrationId: string; siteId: string; nonce: string; signedAt: string; toleranceSeconds?: number }) {
    const tolerance = Math.min(Math.max(input.toleranceSeconds ?? 300, 30), 900);
    const signedAt = new Date(input.signedAt);
    if (!Number.isFinite(signedAt.getTime()) || Math.abs(Date.now() - signedAt.getTime()) > tolerance * 1000)
      return false;
    if (this.boundary === "system") {
      const result = await this.pool.query(
        "select information_redi_reserve_nonce($1,$2,$3,$4,$5) consumed",
        [input.integrationId, input.siteId, input.nonce, signedAt.toISOString(), tolerance],
      );
      return result.rows[0]?.consumed === true;
    }
    const result = await this.pool.query(
      `insert into integration_nonces(integration_id,site_id,nonce,signed_at,expires_at)
       values($1,$2,$3,$4,$4::timestamptz + ($5 * interval '1 second'))
       on conflict do nothing returning nonce`,
      [input.integrationId, input.siteId, input.nonce, signedAt.toISOString(), tolerance],
    );
    return result.rowCount === 1;
  }

  async getRediInboundAccess(externalInstallationId: string, requiredPermission?: RediInboundPermission) {
    if (this.boundary === "system") {
      const result = await this.pool.query(
        "select * from information_redi_bootstrap($1,$2)",
        [requiredText(externalInstallationId, 300), requiredPermission ?? "articles:read"],
      );
      const row = result.rows[0];
      return row ? {
        integrationId: row.integration_id as string, siteId: row.site_id as string,
        permissions: row.permissions as RediInboundPermission[], approvedAt: iso(row.approved_at)!,
        approvedBy: row.approved_by as string,
      } : null;
    }
    const result = await this.pool.query(
      `select integration.id,integration.site_id,integration.inbound_permissions,
        integration.inbound_approved_at,integration.inbound_approved_by
       from site_external_integrations integration
       join sites site on site.id=integration.site_id and site.site_kind='information'
       where integration.provider='redi_control' and integration.external_installation_id=$1
         and integration.status='active' and integration.inbound_enabled=true
         and integration.inbound_approved_at is not null and integration.inbound_approved_by is not null`,
      [requiredText(externalInstallationId, 300)],
    );
    const row = result.rows[0];
    return row ? {
      integrationId: row.id as string,
      siteId: row.site_id as string,
      permissions: row.inbound_permissions as RediInboundPermission[],
      approvedAt: iso(row.inbound_approved_at)!,
      approvedBy: row.inbound_approved_by as string,
    } : null;
  }

  async configureRediInboundAccess(input: ContentActor & {
    siteId: string;
    enabled: boolean;
    permissions: RediInboundPermission[];
  }) {
    if (input.actorType !== "owner") throw new InformationRepositoryError("owner_required");
    const permissions = [...new Set(input.permissions)];
    if (permissions.some((permission) => !rediInboundPermissions.includes(permission)))
      throw new InformationRepositoryError("invalid_inbound_permission");
    if (this.boundary === "owner") {
      if (!this.sessionHash) throw new InformationRepositoryError("owner_required");
      const result = await this.pool.query(
        "select owner_information_configure_redi($1,$2,$3,$4,$5) value",
        [this.sessionHash, input.siteId, input.enabled, permissions, this.correlationId ?? ""],
      );
      const value = result.rows[0]?.value;
      if (!value) throw new InformationRepositoryError("integration_not_ready");
      return value;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await assertInformationSite(client, input.siteId);
      const result = await client.query(
        `update site_external_integrations set
          inbound_enabled=$3,inbound_permissions=$4,
          inbound_approved_at=case when $3 then now() else null end,
          inbound_approved_by=case when $3 then $2 else null end,
          updated_at=now()
         where site_id=$1 and provider='redi_control' and status='active'
           and external_installation_id is not null
         returning external_installation_id,inbound_enabled,inbound_permissions,
           inbound_approved_at,inbound_approved_by`,
        [input.siteId, requiredText(input.actorId, 200), input.enabled, permissions],
      );
      if (!result.rows[0]) throw new InformationRepositoryError("integration_not_ready");
      await recordAudit(client, {
        ...input,
        action: "integration.inbound_grant_changed",
        details: { enabled: input.enabled, permissions },
      });
      await client.query("commit");
      return {
        externalInstallationId: result.rows[0].external_installation_id as string,
        enabled: result.rows[0].inbound_enabled as boolean,
        permissions: result.rows[0].inbound_permissions as RediInboundPermission[],
        approvedAt: iso(result.rows[0].inbound_approved_at),
        approvedBy: result.rows[0].inbound_approved_by as string | null,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getArticleByExternalReference(siteId: string, externalReference: string) {
    if (this.boundary === "system") {
      if (!this.integrationId || this.integrationSiteId !== siteId) return null;
      const result = await this.pool.query(
        "select information_redi_external_article($1,$2,$3) value",
        [this.integrationId, siteId, requiredText(externalReference, 300)],
      );
      const row = result.rows[0]?.value;
      return row ? mapArticle(row, row.sources ?? [], (row.article_media ?? []).map((media: Record<string, any>) => ({ id: media.id, url: media.url, altText: media.alt_text ?? undefined, sortOrder: media.sort_order }))) : null;
    }
    await assertInformationSite(this.pool, siteId);
    const result = await this.pool.query(
      "select id from site_articles where site_id=$1 and external_source='redi_control' and external_reference=$2",
      [siteId, requiredText(externalReference, 300)],
    );
    return result.rows[0] ? this.getArticle(siteId, result.rows[0].id as string) : null;
  }

  async beginIntegrationRequest(input: { integrationId: string; siteId: string; idempotencyKey: string; operation: string; requestBody: string; ttlSeconds?: number }) {
    const requestHash = createHash("sha256").update(input.requestBody).digest("hex");
    const ttl = Math.min(Math.max(input.ttlSeconds ?? 86_400, 300), 604_800);
    if (this.boundary === "system") {
      const result = await this.pool.query(
        "select information_redi_begin_request($1,$2,$3,$4,$5,$6) value",
        [input.integrationId, input.siteId, requiredText(input.idempotencyKey, 200), requiredText(input.operation, 120), requestHash, ttl],
      );
      return result.rows[0]?.value;
    }
    const result = await this.pool.query(
      `insert into integration_api_requests(integration_id,site_id,idempotency_key,operation,request_hash,expires_at)
       values($1,$2,$3,$4,$5,now() + ($6 * interval '1 second'))
       on conflict(integration_id,idempotency_key) do update set
         site_id=excluded.site_id,operation=excluded.operation,request_hash=excluded.request_hash,
         state='processing',response_status=null,response_body=null,expires_at=excluded.expires_at,updated_at=now()
       where integration_api_requests.expires_at <= now()
          or (integration_api_requests.state='failed'
              and integration_api_requests.site_id=excluded.site_id
              and integration_api_requests.operation=excluded.operation
              and integration_api_requests.request_hash=excluded.request_hash)
       returning *`,
      [input.integrationId, input.siteId, requiredText(input.idempotencyKey, 200), requiredText(input.operation, 120), requestHash, ttl],
    );
    const row = result.rows[0] ?? (await this.pool.query(
      "select * from integration_api_requests where integration_id=$1 and idempotency_key=$2",
      [input.integrationId, input.idempotencyKey],
    )).rows[0];
    if (row.site_id !== input.siteId || row.operation !== input.operation || row.request_hash !== requestHash)
      return { outcome: "conflict" as const, requestHash };
    if (result.rows[0]) return { outcome: "claimed" as const, requestHash };
    if (row.state === "completed") return { outcome: "replay" as const, requestHash, responseStatus: row.response_status, responseBody: row.response_body };
    return { outcome: "in_progress" as const, requestHash };
  }

  async completeIntegrationRequest(input: { integrationId: string; idempotencyKey: string; requestHash: string; responseStatus: number; responseBody: unknown }) {
    if (this.boundary === "system") {
      const result = await this.pool.query(
        "select information_redi_finish_request($1,$2,$3,'completed',$4,$5::jsonb) ok",
        [input.integrationId, input.idempotencyKey, input.requestHash, input.responseStatus, JSON.stringify(input.responseBody)],
      );
      if (!result.rows[0]?.ok) throw new InformationRepositoryError("idempotency_request_not_claimed");
      return;
    }
    const result = await this.pool.query(
      `update integration_api_requests set state='completed',response_status=$4,response_body=$5,updated_at=now()
       where integration_id=$1 and idempotency_key=$2 and request_hash=$3 and state='processing' returning idempotency_key`,
      [input.integrationId, input.idempotencyKey, input.requestHash, input.responseStatus, JSON.stringify(input.responseBody)],
    );
    if (result.rowCount !== 1) throw new InformationRepositoryError("idempotency_request_not_claimed");
  }

  async failIntegrationRequest(input: { integrationId: string; idempotencyKey: string; requestHash: string; responseStatus: number; responseBody: unknown }) {
    if (this.boundary === "system") {
      const result = await this.pool.query(
        "select information_redi_finish_request($1,$2,$3,'failed',$4,$5::jsonb) ok",
        [input.integrationId, input.idempotencyKey, input.requestHash, input.responseStatus, JSON.stringify(input.responseBody)],
      );
      if (!result.rows[0]?.ok) throw new InformationRepositoryError("idempotency_request_not_claimed");
      return;
    }
    const result = await this.pool.query(
      `update integration_api_requests set state='failed',response_status=$4,response_body=$5,updated_at=now()
       where integration_id=$1 and idempotency_key=$2 and request_hash=$3 and state='processing' returning idempotency_key`,
      [input.integrationId, input.idempotencyKey, input.requestHash, input.responseStatus, JSON.stringify(input.responseBody)],
    );
    if (result.rowCount !== 1) throw new InformationRepositoryError("idempotency_request_not_claimed");
  }

  private async replaceSources(client: PoolClient, siteId: string, articleId: string, sources: Array<{ label?: string; url: string }>) {
    await client.query("delete from site_article_sources where site_id=$1 and article_id=$2", [siteId, articleId]);
    for (const [sortOrder, source] of sources.entries()) {
      await client.query(
        "insert into site_article_sources(id,site_id,article_id,label,url,sort_order) values($1,$2,$3,$4,$5,$6)",
        [randomUUID(), siteId, articleId, source.label ?? null, source.url, sortOrder],
      );
    }
  }

  private async getSources(siteId: string, articleId: string) {
    return this.getSourcesWithClient(this.pool, siteId, articleId);
  }

  private async getSourcesWithClient(client: Pool | PoolClient, siteId: string, articleId: string) {
    const result = await client.query(
      "select label,url,sort_order from site_article_sources where site_id=$1 and article_id=$2 order by sort_order",
      [siteId, articleId],
    );
    return result.rows.map((row) => ({ label: row.label ?? undefined, url: row.url, sortOrder: row.sort_order }));
  }
}
