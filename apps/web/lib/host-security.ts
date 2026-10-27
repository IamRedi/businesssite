const domainPattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export function normalizeRequestHost(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || /[\s,\\/@]/.test(raw)) return null;
  try {
    const hostname = new URL(`http://${raw}`).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    return hostname && hostname.length <= 253 ? hostname : null;
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    return normalizeRequestHost(new URL(value).host);
  } catch {
    return null;
  }
}

function vercelDeploymentHost(value: string | undefined) {
  const host = normalizeRequestHost(value);
  return host?.endsWith(".vercel.app") ? host : null;
}

export function configuredPlatformHosts(
  environment: Record<string, string | undefined> = process.env,
) {
  const hosts = new Set<string>();
  const canonical = hostFromUrl(environment.PUBLIC_APP_URL);
  if (canonical) hosts.add(canonical);
  const controlPanel = normalizeRequestHost(environment.CONTROL_PANEL_HOST);
  if (controlPanel) hosts.add(controlPanel);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const) {
    // A Vercel production URL can be a customer's custom domain. Trust only
    // Vercel-owned deployment hosts implicitly; branded platform hosts remain
    // explicitly configured through PUBLIC_APP_URL or the host allowlist.
    const host = vercelDeploymentHost(environment[key]);
    if (host) hosts.add(host);
  }
  for (const value of (environment.PLATFORM_ADDITIONAL_HOSTS ?? "").split(",")) {
    const host = normalizeRequestHost(value);
    if (host) hosts.add(host);
  }
  if (environment.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
    hosts.add("::1");
  }
  return hosts;
}

export function configuredControlPanelHost(
  environment: Record<string, string | undefined> = process.env,
) {
  return normalizeRequestHost(environment.CONTROL_PANEL_HOST);
}

export function normalizeCustomDomainHost(value: string | null | undefined) {
  const host = normalizeRequestHost(value)?.replace(/^www\./, "") ?? "";
  return domainPattern.test(host) ? host : null;
}

export function trustedCustomerDomainHost(
  value: string | null | undefined,
  platformHosts: ReadonlySet<string> = configuredPlatformHosts(),
) {
  const host = normalizeCustomDomainHost(value);
  return host && !platformHosts.has(host) && !platformHosts.has(`www.${host}`) ? host : null;
}

export function isCustomerDomainPassThrough(pathname: string) {
  return pathname === "/api/public/appointments" ||
    pathname === "/api/public/appointments/receipt" ||
    pathname === "/api/public/booking" ||
    pathname.startsWith("/api/media/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i.test(pathname);
}

export function isCanonicalPlatformNavigation(pathname: string) {
  return /^(?:\/site-admin(?:\/|$)|\/subscribe(?:\/|$))/.test(pathname);
}

const editorialPathSlug = "[a-z0-9]+(?:-[a-z0-9]+)*";
const customerArticlePath = new RegExp(`^/articles/(${editorialPathSlug})$`);
const customerCategoryPath = new RegExp(`^/category/(${editorialPathSlug})$`);

export function customerDomainRewritePath(pathname: string) {
  if (pathname === "/") return "/customer-domain";
  if (pathname === "/privacy") return "/customer-domain/privacy";
  const article = pathname.match(customerArticlePath);
  if (article?.[1] && article[1].length <= 180) return `/customer-domain/articles/${article[1]}`;
  const category = pathname.match(customerCategoryPath);
  if (category?.[1] && category[1].length <= 180) return `/customer-domain/category/${category[1]}`;
  return null;
}

export type HostDisposition =
  | "platform"
  | "customer-site"
  | "customer-pass-through"
  | "canonical-redirect"
  | "reject";

export function classifyHostRequest(input: {
  host: string;
  pathname: string;
  method: string;
  platformHosts: ReadonlySet<string>;
}): HostDisposition {
  if (input.platformHosts.has(input.host)) return "platform";
  if (isCustomerDomainPassThrough(input.pathname)) return "customer-pass-through";
  if (
    (input.method === "GET" || input.method === "HEAD") &&
    customerDomainRewritePath(input.pathname)
  ) return "customer-site";
  if (
    (input.method === "GET" || input.method === "HEAD") &&
    isCanonicalPlatformNavigation(input.pathname)
  ) return "canonical-redirect";
  return "reject";
}
