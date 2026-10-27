import { getRuntimePostgresPool } from "@platform/database";
import { applyCustomDesign, parsePriceList, type SiteDocument } from "@platform/website-engine";

export type CustomContentField = "priceList" | "customMedia";
export type CustomerCustomContext = { siteId: string; document: SiteDocument; customDomain: string | null; maxDurationSeconds: number };

/** Restrict price edits to labels, amounts and starting-price flags. Preserve table structure. */
export function customerCustomValue(site: SiteDocument, field: CustomContentField, input: unknown) {
  if (!site.customDesign || !site.customMedia) throw new Error("Custom website required.");
  if (field === "customMedia") return applyCustomDesign(site, site.customDesign, input).customMedia!;
  if (field !== "priceList" || !site.priceList) throw new Error("Existing price list required.");
  const next = parsePriceList(input), previous = site.priceList;
  const structure = (list: typeof next) => ({ ...list, groups: list.groups.map(group => ({ ...group, items: group.items.map(item => ({ ...item, label: "", prices: item.prices.map(() => null) })) })) });
  if (JSON.stringify(structure(next)) !== JSON.stringify(structure(parsePriceList(previous)))) throw new Error("Price table structure must be preserved.");
  return next;
}

export class PostgresSiteAdminCustomContentRepository {
  async context(session: string, slug: string, media = false): Promise<CustomerCustomContext | null> {
    const result = await getRuntimePostgresPool().query("select site_admin_custom_context($1,$2,$3) as context", [session, slug, media]);
    return result.rows[0]?.context ?? null;
  }
  async apply(session: string, slug: string, site: SiteDocument, field: CustomContentField, expected: unknown, expectedDesign: unknown, input: unknown) {
    const value = customerCustomValue(site, field, input);
    const result = await getRuntimePostgresPool().query("select site_admin_custom_apply($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) as value", [session, slug, field, JSON.stringify(expected), JSON.stringify(expectedDesign), JSON.stringify(value)]);
    return result.rows[0]?.value ?? null;
  }
  async registerMedia(session: string, slug: string, media: { authority: string; key: string; url: string; mimeType: string; bytes: number; width: number; height: number; durationSeconds?: number }): Promise<string | null> {
    const result = await getRuntimePostgresPool().query("select site_admin_custom_media_register($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id", [session, slug, media.authority, media.key, media.url, media.mimeType, media.bytes, media.width, media.height, media.durationSeconds ?? null]);
    return result.rows[0]?.id ?? null;
  }
}
