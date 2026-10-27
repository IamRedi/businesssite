import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateOwnerSessionToken } from "./lib/owner-auth";
import { proxy } from "./proxy";

vi.mock("./lib/owner-auth", () => ({ validateOwnerSessionToken: vi.fn() }));
const validateSession = vi.mocked(validateOwnerSessionToken);

afterEach(() => { vi.unstubAllEnvs(); validateSession.mockReset(); });

function productionEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PUBLIC_APP_URL", "https://platform.example");
}

const request = (url: string) => {
  const parsed = new URL(url);
  return new NextRequest(parsed, { headers: { host: parsed.host } });
};

describe("platform proxy security", () => {
  it("permits media only from self and the exact configured public business Blob authority", async () => {
    productionEnvironment();
    vi.stubEnv("BLOB_STORE_ID", "store_ExampleStore0001");
    vi.stubEnv("INFORMATION_BLOB_STORE_ID", "store_LXTZGwnvcAY0QoPo");
    const policy = (await proxy(request("https://platform.example/site/example"))).headers.get("content-security-policy")!;
    expect(policy.split("; ").find(value => value.startsWith("media-src")))
      .toBe("media-src 'self' https://examplestore0001.public.blob.vercel-storage.com");
    expect(policy.startsWith("default-src 'self';")).toBe(true);
    expect(policy).not.toContain("private.blob");
    expect(policy).not.toContain("lxtzgwnvcay0qopo");
  });

  it.each(["", "https://arbitrary.example", "store_ExampleStore0001; media-src *", "store_short"])("fails closed for invalid business Blob authority %s", async store => {
    productionEnvironment();
    vi.stubEnv("BLOB_STORE_ID", store);
    const policy = (await proxy(request("https://platform.example/site/example"))).headers.get("content-security-policy")!;
    expect(policy.split("; ").find(value => value.startsWith("media-src"))).toBe("media-src 'self'");
  });

  it("accepts only a full database-backed owner session", async () => {
    productionEnvironment();
    validateSession.mockResolvedValueOnce({ sessionId: "s", ownerId: "o", email: "owner@example.test", role: "owner", mfaCompletedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastUsedAt: new Date().toISOString() });
    const authenticated = new NextRequest("https://platform.example/owner", { headers: { host: "platform.example", cookie: `owner_session=${"a".repeat(64)}` } });
    expect((await proxy(authenticated)).status).toBe(200);
    expect(validateSession).toHaveBeenCalledWith("a".repeat(64));
  });

  it("never accepts an MFA challenge cookie as owner authorization", async () => {
    productionEnvironment();
    validateSession.mockResolvedValue(null);
    const challengeOnly = new NextRequest("https://platform.example/api/owner/search", { headers: { host: "platform.example", cookie: `owner_mfa_challenge=${"b".repeat(64)}` } });
    expect((await proxy(challengeOnly)).status).toBe(403);
    expect(validateSession).toHaveBeenCalledWith(undefined);
  });

  it("does not expose a public owner signup route", async () => {
    productionEnvironment();
    validateSession.mockResolvedValue(null);
    const response = await proxy(request("https://platform.example/owner/signup"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://platform.example/owner/login");
  });

  it("does not accept customer, preview or pending-MFA cookies for owner APIs", async () => {
    productionEnvironment();
    validateSession.mockResolvedValue(null);
    for (const cookie of [
      `site_admin_session=${"a".repeat(64)}`,
      `preview_access=${"b".repeat(64)}`,
      `owner_mfa_challenge=${"c".repeat(64)}`,
    ]) {
      const denied = new NextRequest("https://platform.example/api/owner/search", { headers: { host: "platform.example", cookie } });
      expect((await proxy(denied)).status).toBe(403);
    }
    const teamWithCustomerSession = new NextRequest("https://platform.example/api/owner/team/invitations", { headers: { host: "platform.example", cookie: `site_admin_session=${"d".repeat(64)}` } });
    expect((await proxy(teamWithCustomerSession)).status).toBe(403);
  });

  it("denies an unauthenticated owner API on the canonical host", async () => {
    productionEnvironment();
    const response = await proxy(request("https://platform.example/api/owner/search"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Owner authorization required." });
    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
  });

  it("allows only read-only public R2 media previews on the control host", async () => {
    productionEnvironment(); vi.stubEnv("CONTROL_PANEL_HOST", "control.platform.example");
    const url = "https://control.platform.example/api/media/r2/sites/a/custom/fixture.webp";
    expect((await proxy(request(url))).status).toBe(200);
    expect((await proxy(new NextRequest(url, { method: "POST", headers: { host: "control.platform.example" } }))).status).toBe(421);
    expect((await proxy(request("https://control.platform.example/api/media/private-editorial-id"))).status).toBe(421);
  });

  it("isolates the dedicated control host to owner and health routes", async () => {
    productionEnvironment();
    vi.stubEnv("CONTROL_PANEL_HOST", "control.platform.example");
    const root = await proxy(request("https://control.platform.example/"));
    expect(root.status).toBe(307);
    expect(root.headers.get("location")).toBe("https://control.platform.example/owner");
    const ownerApi = await proxy(request("https://control.platform.example/api/owner/search"));
    expect(ownerApi.status).toBe(403);
    const publicPage = await proxy(request("https://control.platform.example/site/example"));
    expect(publicPage.status).toBe(307);
    expect(publicPage.headers.get("location")).toBe("https://platform.example/");
    const otherApi = await proxy(request("https://control.platform.example/api/subscribe"));
    expect(otherApi.status).toBe(421);
  });

  it("rejects privileged APIs on arbitrary Vercel hosts", async () => {
    productionEnvironment();
    const response = await proxy(request("https://attacker.vercel.app/api/owner/search"));
    expect(response.status).toBe(421);
  });

  it("rewrites customer homepages but redirects customer login to the canonical host", async () => {
    productionEnvironment();
    const homepage = await proxy(request("https://customer.example/"));
    expect(homepage.headers.get("x-middleware-rewrite")).toBe("https://customer.example/customer-domain");
    const login = await proxy(request("https://customer.example/site-admin/login?from=footer"));
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe("https://platform.example/site-admin/login?from=footer");
  });

  it("overwrites the internal document locale boundary for platform, owner and tenant routes", async () => {
    productionEnvironment();
    const platform = await proxy(new NextRequest("https://platform.example/legal/privacy?lang=de", { headers: { host: "platform.example", "x-businesssite-document-boundary": "owner", cookie: "platform_locale=en" } }));
    expect(platform.headers.get("x-middleware-request-x-businesssite-document-boundary")).toBe("platform:de");
    const owner = await proxy(new NextRequest("https://platform.example/owner/login", { headers: { host: "platform.example", cookie: "platform_locale=sq" } }));
    expect(owner.headers.get("x-middleware-request-x-businesssite-document-boundary")).toBe("owner");
    const site = await proxy(request("https://platform.example/site/kunde"));
    expect(site.headers.get("x-middleware-request-x-businesssite-document-boundary")).toBe("site:kunde");
    const domain = await proxy(request("https://customer.example/"));
    expect(domain.headers.get("x-middleware-request-x-businesssite-document-boundary")).toBe("domain:customer.example");
  });

  it("rewrites only allowlisted information paths on customer hosts", async () => {
    productionEnvironment();
    const article = await proxy(request("https://customer.example/articles/verified-report?ref=home"));
    expect(article.headers.get("x-middleware-rewrite")).toBe("https://customer.example/customer-domain/articles/verified-report?ref=home");
    const category = await proxy(request("https://customer.example/category/local-news"));
    expect(category.headers.get("x-middleware-rewrite")).toBe("https://customer.example/customer-domain/category/local-news");

    for (const path of ["/api/owner/search", "/api/internal/cleanup-expired-demos", "/api/public/trials", "/owner", "/preview/token"]) {
      const denied = await proxy(request(`https://customer.example${path}`));
      expect(denied.status).toBe(path.startsWith("/api/") ? 421 : 404);
      expect(denied.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("rejects spoofed Host headers before custom-domain routing", async () => {
    productionEnvironment();
    const spoofed = new NextRequest("https://customer.example/articles/report", {
      headers: { host: "customer.example,attacker.example" },
    });
    const response = await proxy(spoofed);
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid Host");
  });
});
