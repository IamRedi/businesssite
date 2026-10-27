import { inspectClouviderDomain, type ClouviderDomainSetup } from "./clouvider-domains";
import { inspectVercelProjectDomain, prepareVercelProjectDomain, storedDomainSetup as storedVercelDomainSetup } from "./vercel-domains";

function provider() {
  const p = process.env.HOSTING_PROVIDER?.trim() || "vercel";
  if (!["vercel", "clouvider"].includes(p)) throw Error("Unknown domain hosting provider.");
  return p;
}
export const prepareHostingDomain = (domain: string, siteId: string) => provider() === "clouvider" ? inspectClouviderDomain(domain, siteId) : prepareVercelProjectDomain(domain);
export const inspectHostingDomain = (domain: string, siteId: string) => provider() === "clouvider" ? inspectClouviderDomain(domain, siteId) : inspectVercelProjectDomain(domain);
export function storedHostingDomainSetup(value: unknown) {
  if (!value || typeof value !== "object" || (value as { provider?: unknown }).provider !== "clouvider") return storedVercelDomainSetup(value);
  const v = value as Partial<ClouviderDomainSetup>;
  if (typeof v.domain !== "string" || typeof v.siteId !== "string" || typeof v.serviceId !== "string" || typeof v.ownershipVerified !== "boolean" || typeof v.dnsConfigured !== "boolean" || typeof v.ready !== "boolean" || typeof v.checkedAt !== "string" || !Array.isArray(v.records) || !v.records.every(r => r && typeof r.type === "string" && typeof r.name === "string" && typeof r.value === "string" && ["routing", "ownership"].includes(r.purpose))) return null;
  return v as ClouviderDomainSetup;
}
