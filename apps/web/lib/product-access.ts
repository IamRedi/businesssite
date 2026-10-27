import { capabilityIsPubliclyActive, type EntitlementCapability } from "@platform/product-catalog";

type CustomerSession = { siteId: string };
type CapabilityRepository = {
  getSiteIdBySlug(slug: string): Promise<string | undefined>;
  hasCapabilityAccess(siteId: string, capability: EntitlementCapability): Promise<boolean>;
};

export async function authorizedSiteCapability(
  repository: CapabilityRepository,
  session: CustomerSession | null,
  slug: string,
  capability: EntitlementCapability,
) {
  if (!session || !capabilityIsPubliclyActive(capability)) return null;
  const siteId = await repository.getSiteIdBySlug(slug);
  if (!siteId || siteId !== session.siteId) return null;
  return (await repository.hasCapabilityAccess(siteId, capability)) ? siteId : null;
}
