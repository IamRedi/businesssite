import { BlobNotFoundError, del, head } from "@vercel/blob";
import type {
  ProviderCleanupAdapter,
  ProviderCleanupResult,
  ProviderCleanupWork,
} from "@platform/site-data";

type Environment = Record<string, string | undefined>;
type DomainTarget =
  | {
      url: URL;
      config: { token: string; projectId: string; teamId: string };
      authority: { projectId: string; teamId: string };
    }
  | { failure: ProviderCleanupResult };
export const providerCleanupProductionTarget = (environment: Environment = process.env) => {
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  return environment.RELEASE_TARGET === "production" ||
    vercelEnvironment === "production" ||
    (!vercelEnvironment && environment.NODE_ENV === "production");
};
const safeBlobKey = (siteId: string, value: string) =>
  value.startsWith(`sites/${siteId}/`) &&
  value.length <= 500 &&
  !value.includes("..") &&
  !/[?#\\\s]/.test(value);
const safeBlobAuthority = (value: string | undefined) =>
  /^store_[A-Za-z0-9]{16}$/.test(value ?? "") ? value! : undefined;
const normalizedStoreId = (value: string) => value.replace(/^store_/, "").toLowerCase();
const tokenStoreAuthority = (value: string | undefined) => {
  const storeId = value?.trim().split("_")[3];
  return /^[A-Za-z0-9]{16}$/.test(storeId ?? "") ? `store_${storeId}` : undefined;
};
export function vercelBlobUrlMatchesAuthority(url: string, pathname: string, authority: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === `${normalizedStoreId(authority)}.public.blob.vercel-storage.com`
      && decodeURIComponent(parsed.pathname.slice(1)) === pathname;
  } catch { return false; }
}
export function vercelBlobCommandOptions(environment: Environment, authority: string) {
  const storeId = safeBlobAuthority(authority);
  if (!storeId) return null;
  const configuredStoreId = safeBlobAuthority(environment.BLOB_STORE_ID?.trim());
  const oidcToken = environment.VERCEL_OIDC_TOKEN?.trim();
  if (oidcToken && configuredStoreId === storeId)
    return { oidcToken, storeId };
  // Vercel Functions receive OIDC through request context rather than a runtime
  // environment variable. @vercel/blob resolves that short-lived token itself;
  // we still bind the call to the exact connected store authority here.
  if (environment.VERCEL === "1" && configuredStoreId === storeId)
    return { storeId };
  const token = environment.BLOB_READ_WRITE_TOKEN?.trim();
  if (token && tokenStoreAuthority(token) === storeId) return { token };
  return null;
}
const safeDomain = (value: string) =>
  value === value.toLowerCase() &&
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(value);
const safeVercelProjectId = (value: string | undefined) =>
  /^prj_[A-Za-z0-9]{20,64}$/.test(value ?? "") ? value! : undefined;
const safeVercelTeamId = (value: string | undefined) =>
  /^team_[A-Za-z0-9]{20,64}$/.test(value ?? "") ? value! : undefined;
export const vercelDomainProjectAuthority = (teamId: string, projectId: string) =>
  safeVercelTeamId(teamId) && safeVercelProjectId(projectId)
    ? `vercel-project:${teamId}:${projectId}`
    : undefined;
const parseVercelDomainProjectAuthority = (value: string | undefined) => {
  const match = /^vercel-project:(team_[A-Za-z0-9]{20,64}):(prj_[A-Za-z0-9]{20,64})$/.exec(value ?? "");
  return match ? { teamId: match[1]!, projectId: match[2]! } : undefined;
};
const receipt = (work: ProviderCleanupWork, suffix: string) =>
  `${work.provider}.${work.resourceKind}.${suffix}.${work.id}`.slice(0, 160);

export class PlatformProviderCleanupAdapter implements ProviderCleanupAdapter {
  constructor(
    private readonly environment: Environment = process.env,
    private readonly blob: { del: typeof del; head: typeof head } = { del, head },
    private readonly request: typeof fetch = fetch,
  ) {}
  async execute(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.operation === "retain") return this.retained(work);
    if (work.provider === "vercel_blob") return this.deleteBlob(work);
    if (work.provider === "vercel_domains") return this.detachDomain(work);
    if (work.provider === "paddle")
      return { outcome: "unsupported", reasonCode: "paddle_cleanup_not_accepted" };
    if (work.provider === "redi_control")
      return { outcome: "manual_review_required", reasonCode: "redi_cleanup_receiver_unavailable" };
    return { outcome: "manual_review_required", reasonCode: "provider_operation_not_allowlisted" };
  }
  async reconcile(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.provider === "vercel_blob") return this.verifyBlobAbsent(work);
    if (work.provider === "vercel_domains") return this.verifyDomainDetached(work);
    if (work.operation === "retain") return this.retained(work);
    return { outcome: "manual_review_required", reasonCode: "reconciliation_not_supported" };
  }
  private retained(work: ProviderCleanupWork): ProviderCleanupResult {
    if (work.provider === "stripe" && work.resourceKind === "subscription_retained")
      return { outcome: "retained_by_policy", reasonCode: "financial_evidence_retained", receiptReference: receipt(work, "retained") };
    if (work.provider === "resend" && work.resourceKind === "transactional_no_customer_object")
      return { outcome: "no_provider_object", reasonCode: "transactional_delivery_retained", receiptReference: receipt(work, "no-object") };
    if (work.provider === "openai" && work.resourceKind === "stateless_ai_no_customer_object")
      return { outcome: "no_provider_object", reasonCode: "stateless_inference_no_object", receiptReference: receipt(work, "no-object") };
    if (work.provider === "google" && work.resourceKind === "finder_no_customer_object")
      return { outcome: "no_provider_object", reasonCode: "finder_reference_not_customer_object", receiptReference: receipt(work, "no-object") };
    return { outcome: "manual_review_required", reasonCode: "retention_binding_invalid" };
  }
  private blobAuthority(work: ProviderCleanupWork) {
    const bound = safeBlobAuthority(work.providerAuthority);
    const configured = safeBlobAuthority(this.environment.PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID?.trim());
    return bound && configured === bound ? bound : undefined;
  }
  private async deleteBlob(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.resourceKind !== "blob_object" || !safeBlobKey(work.siteId, work.providerReference))
      return { outcome: "blocked", reasonCode: "blob_binding_invalid" };
    const authority = this.blobAuthority(work);
    const options = authority ? vercelBlobCommandOptions(this.environment, authority) : null;
    if (!authority) return { outcome: "blocked", reasonCode: "blob_authority_mismatch" };
    if (!options) return { outcome: "manual_review_required", reasonCode: "blob_provider_unconfigured" };
    try {
      const existing = await this.blob.head(work.providerReference, options);
      if (existing.pathname !== work.providerReference || !vercelBlobUrlMatchesAuthority(existing.url,work.providerReference,authority))
        return { outcome: "blocked", reasonCode: "blob_provider_identity_mismatch" };
      await this.blob.del(work.providerReference, { ...options, ifMatch: existing.etag });
      return this.verifyBlobAbsent(work);
    } catch (error) {
      if (error instanceof BlobNotFoundError)
        return { outcome: "already_absent", reasonCode: "blob_already_absent", receiptReference: receipt(work, "absent") };
      return classifyProviderError(error, "blob");
    }
  }
  private async verifyBlobAbsent(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.resourceKind !== "blob_object" || !safeBlobKey(work.siteId, work.providerReference))
      return { outcome: "blocked", reasonCode: "blob_binding_invalid" };
    const authority = this.blobAuthority(work);
    const options = authority ? vercelBlobCommandOptions(this.environment, authority) : null;
    if (!authority) return { outcome: "blocked", reasonCode: "blob_authority_mismatch" };
    if (!options) return { outcome: "manual_review_required", reasonCode: "blob_provider_unconfigured" };
    try {
      const existing = await this.blob.head(work.providerReference, options);
      if (existing.pathname !== work.providerReference || !vercelBlobUrlMatchesAuthority(existing.url,work.providerReference,authority))
        return { outcome: "blocked", reasonCode: "blob_provider_identity_mismatch" };
      return { outcome: "uncertain", reasonCode: "blob_still_present" };
    } catch (error) {
      if (error instanceof BlobNotFoundError)
        return { outcome: work.reconcile ? "already_absent" : "completed", reasonCode: "blob_absence_verified", receiptReference: receipt(work, "verified") };
      return classifyProviderError(error, "blob");
    }
  }
  private domainConfig() {
    const token = this.environment.VERCEL_TOKEN?.trim();
    const projectId = safeVercelProjectId(
      this.environment.PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID?.trim(),
    );
    const teamId = safeVercelTeamId(
      this.environment.PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID?.trim(),
    );
    return token && projectId && teamId ? { token, projectId, teamId } : null;
  }
  private domainUrl(work: ProviderCleanupWork): DomainTarget {
    const authority = parseVercelDomainProjectAuthority(work.providerAuthority);
    if (!authority) return { failure: { outcome: "blocked", reasonCode: "domain_authority_invalid" } };
    const config = this.domainConfig();
    if (!config) return { failure: { outcome: "manual_review_required", reasonCode: "domain_provider_unconfigured" } };
    if (config.projectId !== authority.projectId || config.teamId !== authority.teamId)
      return { failure: { outcome: "blocked", reasonCode: "domain_authority_mismatch" } };
    const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(authority.projectId)}/domains/${encodeURIComponent(work.providerReference)}`);
    url.searchParams.set("teamId", authority.teamId);
    return { url, config, authority };
  }
  private async detachDomain(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.resourceKind !== "project_domain_attachment" || !safeDomain(work.providerReference))
      return { outcome: "blocked", reasonCode: "domain_binding_invalid" };
    const target = this.domainUrl(work);
    if ("failure" in target) return target.failure;
    try {
      const current = await this.request(target.url, { headers: { authorization: `Bearer ${target.config.token}` }, signal: AbortSignal.timeout(10_000) });
      if (current.status === 404) return { outcome: "already_absent", reasonCode: "domain_already_detached", receiptReference: receipt(work, "absent") };
      if (!current.ok) return responseResult(current, "domain_inspection");
      const body = await current.json().catch(() => null) as { name?: unknown; projectId?: unknown } | null;
      if (body?.name !== work.providerReference || body.projectId !== target.authority.projectId)
        return { outcome: "blocked", reasonCode: "domain_project_binding_mismatch" };
      const removed = await this.request(target.url, { method: "DELETE", headers: { authorization: `Bearer ${target.config.token}` }, signal: AbortSignal.timeout(10_000) });
      if (removed.status !== 200 && removed.status !== 204 && removed.status !== 404) return responseResult(removed, "domain_detach");
      return this.verifyDomainDetached(work);
    } catch (error) { return classifyProviderError(error, "domain"); }
  }
  private async verifyDomainDetached(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    if (work.resourceKind !== "project_domain_attachment" || !safeDomain(work.providerReference))
      return { outcome: "blocked", reasonCode: "domain_binding_invalid" };
    const target = this.domainUrl(work);
    if ("failure" in target) return target.failure;
    try {
      const response = await this.request(target.url, { headers: { authorization: `Bearer ${target.config.token}` }, signal: AbortSignal.timeout(10_000) });
      if (response.status === 404) return { outcome: work.reconcile ? "already_absent" : "detached", reasonCode: "domain_detachment_verified", receiptReference: receipt(work, "verified") };
      if (!response.ok) return responseResult(response, "domain_verify");
      const body = await response.json().catch(() => null) as { name?: unknown; projectId?: unknown } | null;
      if (body?.name !== work.providerReference || body.projectId !== target.authority.projectId)
        return { outcome: "blocked", reasonCode: "domain_project_binding_mismatch" };
      return { outcome: "uncertain", reasonCode: "domain_still_attached" };
    } catch (error) { return classifyProviderError(error, "domain"); }
  }
}

function responseResult(response: Response, scope: string): ProviderCleanupResult {
  if (response.status === 401 || response.status === 403) return { outcome: "manual_review_required", reasonCode: `${scope}_unauthorized` };
  if (response.status === 429) return { outcome: "retryable_failure", reasonCode: `${scope}_rate_limited`, retryAfterSeconds: retryAfter(response) };
  if (response.status >= 500) return { outcome: "retryable_failure", reasonCode: `${scope}_unavailable` };
  return { outcome: "permanent_failure", reasonCode: `${scope}_rejected` };
}
function retryAfter(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isSafeInteger(value) && value >= 1 && value <= 3600 ? value : undefined;
}
function classifyProviderError(error: unknown, scope: string): ProviderCleanupResult {
  const description = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/rate/i.test(description)) return { outcome: "retryable_failure", reasonCode: `${scope}_rate_limited` };
  if (/timeout|abort|network|fetch/i.test(description)) return { outcome: "uncertain", reasonCode: `${scope}_transport_uncertain` };
  return { outcome: "retryable_failure", reasonCode: `${scope}_transport_failure` };
}

export function providerCleanupAdapterConfigured(environment: Environment = process.env) {
  if (!providerCleanupProductionTarget(environment)) return true;
  return environment.PRIVACY_PROVIDER_CLEANUP_ADAPTER?.trim() === "platform_v1";
}
