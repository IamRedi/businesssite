import { getOwnerPostgresPool } from "@platform/database";
import { applyCustomDesign, customerPublicLegalIdentityComplete, type SiteDocument } from "@platform/website-engine";

export type OwnerCustomSiteSnapshot = { document: SiteDocument; domain: { customDomain: string | null; status: string; verification: unknown; checkedAt: string | null }; visibility: string; publicationIntent: string };
export class PostgresOwnerCustomDesignRepository {
  async mediaContext(sessionHash: string, slug: string): Promise<{ siteId: string; maxDurationSeconds: number } | null> {
    const result = await getOwnerPostgresPool().query("select owner_custom_media_context($1,$2) as context", [sessionHash, slug]);
    return result.rows[0]?.context ?? null;
  }
  async registerMedia(sessionHash: string, slug: string, media: { authority: string; key: string; url: string; mimeType: string; bytes: number; width: number; height: number; durationSeconds?: number }): Promise<string | null> {
    const result = await getOwnerPostgresPool().query("select owner_custom_media_register($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id", [sessionHash, slug, media.authority, media.key, media.url, media.mimeType, media.bytes, media.width, media.height, media.durationSeconds ?? null]);
    return result.rows[0]?.id ?? null;
  }
  async read(sessionHash: string, slug: string): Promise<OwnerCustomSiteSnapshot | null> {
    const result = await getOwnerPostgresPool().query("select owner_custom_site_read($1,$2) as snapshot", [sessionHash, slug]);
    return result.rows[0]?.snapshot ?? null;
  }
  async publish(sessionHash: string, slug: string, expected: SiteDocument, design: unknown, media: unknown, correlationId: string) {
    const candidate = applyCustomDesign(expected, design, media);
    if (expected.visibility === "public" && !customerPublicLegalIdentityComplete(expected)) throw new Error("Complete customer legal identity is required before publication.");
    const result = await getOwnerPostgresPool().query("select owner_custom_site_apply($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,false,$6) as document", [sessionHash, slug, JSON.stringify(expected), JSON.stringify(candidate.customDesign), JSON.stringify(candidate.customMedia), correlationId]);
    return (result.rows[0]?.document as SiteDocument | null) ?? null;
  }
  async restore(sessionHash: string, slug: string, expected: SiteDocument, correlationId: string) {
    const result = await getOwnerPostgresPool().query("select owner_custom_site_apply($1,$2,$3::jsonb,null,null,true,$4) as document", [sessionHash, slug, JSON.stringify(expected), correlationId]);
    return (result.rows[0]?.document as SiteDocument | null) ?? null;
  }
}
