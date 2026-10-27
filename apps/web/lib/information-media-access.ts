import {
  configuredPlatformHosts,
  normalizeCustomDomainHost,
  normalizeRequestHost,
  trustedCustomerDomainHost,
} from "./host-security";

export type InformationMediaAccess = "public" | "site-admin" | "deny" | "invalid-host";

export function informationMediaAccess(input: {
  host: string | null | undefined;
  platformHosts?: ReadonlySet<string>;
  customDomain: string | null;
  customDomainVerified: boolean;
  publiclyAvailable: boolean;
  sameSiteAdmin: boolean;
}): InformationMediaAccess {
  const host = normalizeRequestHost(input.host);
  if (!host) return "invalid-host";
  const platformHosts = input.platformHosts ?? configuredPlatformHosts();
  if (platformHosts.has(host)) {
    if (input.sameSiteAdmin) return "site-admin";
    return input.publiclyAvailable ? "public" : "deny";
  }
  const customerHost = trustedCustomerDomainHost(host, platformHosts);
  const mappedDomain = normalizeCustomDomainHost(input.customDomain);
  return customerHost && input.customDomainVerified && mappedDomain === customerHost && input.publiclyAvailable
    ? "public"
    : "deny";
}
