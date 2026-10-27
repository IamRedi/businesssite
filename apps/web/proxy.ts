import { NextResponse, type NextRequest } from "next/server";
import {
  configuredPlatformHosts,
  configuredControlPanelHost,
  classifyHostRequest,
  customerDomainRewritePath,
  normalizeRequestHost,
} from "./lib/host-security";
import { validateOwnerSessionToken } from "./lib/owner-auth";
import { customerUiLocaleFromCookieHeader, exactLegalDocumentLocale } from "./lib/locale-model";
import { documentBoundaryHeader, serializeDocumentBoundary, type DocumentLocaleBoundary } from "./lib/document-locale-boundary";

function secureResponse(response = NextResponse.next()) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  const developmentEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  const businessStoreId = process.env.BLOB_STORE_ID?.trim();
  const businessMediaOrigin = businessStoreId && /^store_[A-Za-z0-9]{16}$/.test(businessStoreId)
    ? ` https://${businessStoreId.slice(6).toLowerCase()}.public.blob.vercel-storage.com`
    : "";
  response.headers.set("Content-Security-Policy", `default-src 'self'; media-src 'self'${businessMediaOrigin}; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline'${developmentEval} https://cdn.paddle.com; connect-src 'self' https://api.stripe.com https://*.paddle.com; frame-src https://www.google.com https://js.stripe.com https://*.paddle.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://*.paddle.com`);
  if (process.env.NODE_ENV === "production")
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export async function proxy(request: NextRequest) {
  const host = normalizeRequestHost(request.headers.get("host"));
  if (!host)
    return secureResponse(new NextResponse("Invalid Host", { status: 400 }));
  const platformHosts = configuredPlatformHosts();
  const controlPanelHost = configuredControlPanelHost();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(documentBoundaryHeader);
  const withBoundary = (boundary: DocumentLocaleBoundary) => {
    requestHeaders.set(documentBoundaryHeader, serializeDocumentBoundary(boundary));
    return requestHeaders;
  };
  if (controlPanelHost && host === controlPanelHost) {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/") return secureResponse(NextResponse.redirect(new URL("/owner", request.url)));
    const publicR2Media = (request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/api/media/r2/");
    const controlRoute = pathname.startsWith("/owner") || pathname.startsWith("/api/owner") || pathname === "/api/health" || publicR2Media;
    if (!controlRoute) {
      if (pathname.startsWith("/api/"))
        return secureResponse(NextResponse.json({ error: "This API is not available on the control host." }, { status: 421 }));
      const canonical = process.env.PUBLIC_APP_URL?.trim();
      if (canonical && (request.method === "GET" || request.method === "HEAD"))
        return secureResponse(NextResponse.redirect(new URL("/", canonical)));
      return secureResponse(new NextResponse("Not Found", { status: 404 }));
    }
  }
  const disposition = classifyHostRequest({
    host,
    pathname: request.nextUrl.pathname,
    method: request.method,
    platformHosts,
  });
  if (disposition !== "platform") {
    const pathname = request.nextUrl.pathname;
    if (disposition === "customer-pass-through") return secureResponse(NextResponse.next({ request: { headers: withBoundary({ kind: "domain", value: host }) } }));
    if (disposition === "customer-site") {
      const rewritePath = customerDomainRewritePath(pathname);
      if (rewritePath)
        return secureResponse(NextResponse.rewrite(new URL(`${rewritePath}${request.nextUrl.search}`, request.url), { request: { headers: withBoundary({ kind: "domain", value: host }) } }));
    }
    if (disposition === "canonical-redirect") {
      const canonical = process.env.PUBLIC_APP_URL?.trim();
      if (canonical) {
        const destination = new URL(`${pathname}${request.nextUrl.search}`, canonical);
        return secureResponse(NextResponse.redirect(destination));
      }
    }
    if (pathname.startsWith("/api/"))
      return secureResponse(NextResponse.json({ error: "Request host is not allowed for this API." }, { status: 421 }));
    return secureResponse(new NextResponse("Not Found", { status: 404 }));
  }
  const pathname = request.nextUrl.pathname;
  const platformLocale = exactLegalDocumentLocale(request.nextUrl.searchParams.get("lang"))
    ?? customerUiLocaleFromCookieHeader(request.headers.get("cookie"));
  const segments = pathname.split("/").filter(Boolean);
  const boundary: DocumentLocaleBoundary = pathname.startsWith("/owner") || pathname.startsWith("/api/owner")
    ? { kind: "owner" }
    : segments[0] === "site" && segments[1]
      ? { kind: "site", value: segments[1] }
      : segments[0] === "site-admin" && segments[1] && !["login", "forgot-password", "reset-password"].includes(segments[1])
        ? { kind: "site-admin", value: segments[1] }
        : segments[0] === "preview" && segments[1]
          ? { kind: "preview", value: segments[1] }
          : { kind: "platform", locale: platformLocale };
  requestHeaders.set(documentBoundaryHeader, serializeDocumentBoundary(boundary));
  if (!pathname.startsWith("/owner") && !pathname.startsWith("/api/owner")) return secureResponse(NextResponse.next({ request: { headers: requestHeaders } }));
  const publicOwnerRoutes = new Set([
    "/owner/login", "/owner/mfa", "/api/owner/auth/login",
    "/api/owner/auth/mfa/enroll", "/api/owner/auth/mfa/verify",
    "/api/owner/auth/logout", "/owner/invitation", "/api/owner/invitations/accept",
  ]);
  if (publicOwnerRoutes.has(request.nextUrl.pathname)) {
    const response = secureResponse(NextResponse.next({ request: { headers: requestHeaders } }));
    if (request.nextUrl.pathname === "/owner/invitation") {
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
    }
    return response;
  }
  const ownerSession = request.cookies.get("owner_session")?.value;
  if (await validateOwnerSessionToken(ownerSession)) return secureResponse(NextResponse.next({ request: { headers: requestHeaders } }));
  if (request.nextUrl.pathname.startsWith("/api/"))
    return secureResponse(NextResponse.json({ error: "Owner authorization required." }, { status: 403 }));
  return secureResponse(NextResponse.redirect(new URL("/owner/login", request.url)));
}

// Next16's internal image optimizer uses a synthetic request without Host.
// These first-party public files have no tenant/auth boundary, like static JS.
// Keep every application/media API behind the existing strict Host checks.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"] };
