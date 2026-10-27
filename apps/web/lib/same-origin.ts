import { configuredControlPanelHost, normalizeRequestHost } from "./host-security";

export function isSameOriginRequest(request: Request) {
  return isSameOriginHeaders(request.headers, request.url);
}

export function isSameOriginHeaders(headers: Headers, fallbackUrl?: string) {
  const origin = headers.get("origin");
  if (!origin) return false;
  let expectedOrigin: string;
  try {
    const fallback = fallbackUrl ? new URL(fallbackUrl) : undefined;
    const requestHost = normalizeRequestHost(headers.get("host"))
      ?? normalizeRequestHost(fallback?.host);
    const controlHost = configuredControlPanelHost();
    const deploymentHost = normalizeRequestHost(process.env.VERCEL_URL);
    const configured = process.env.PUBLIC_APP_URL?.trim();
    if (controlHost && requestHost === controlHost) {
      const protocol = (configured ? new URL(configured).protocol : undefined) ?? fallback?.protocol
        ?? `${headers.get("x-forwarded-proto") ?? "http"}:`;
      const control = new URL(`${protocol}//${process.env.CONTROL_PANEL_HOST?.trim()}`);
      if (normalizeRequestHost(control.host) !== controlHost || control.username || control.password || control.pathname !== "/" || control.search || control.hash)
        return false;
      expectedOrigin = control.origin;
    } else if (deploymentHost?.endsWith(".vercel.app") && requestHost === deploymentHost) {
      const protocol = fallback?.protocol
        ?? `${headers.get("x-forwarded-proto") ?? "https"}:`;
      expectedOrigin = `${protocol}//${deploymentHost}`;
    } else if (configured) expectedOrigin = new URL(configured).origin;
    else if (fallback) expectedOrigin = fallback.origin;
    else {
      const host = headers.get("host");
      if (!host) return false;
      expectedOrigin = `${headers.get("x-forwarded-proto") ?? "http"}://${host}`;
    }
  } catch {
    return false;
  }
  const fetchSite = headers.get("sec-fetch-site");
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}
