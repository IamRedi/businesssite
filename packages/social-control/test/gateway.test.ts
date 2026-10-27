import { describe, expect, it, vi } from "vitest";
import { HttpSocialControlGateway, signedRequestHeaders, validateSocialControlConfiguration } from "../src/index";

const config = {
  enabled: true,
  apiUrl: "https://api.social.example",
  appUrl: "https://social.example",
  integrationId: "business-site",
  secret: "s".repeat(32),
  timeoutMs: 8000,
};

describe("Redi Control boundary", () => {
  it("creates a deterministic HMAC signature without exposing the secret", () => {
    const headers = signedRequestHeaders({ integrationId: "id", secret: "secret", timestamp: "1", nonce: "n", method: "POST", pathname: "/x", body: "{}", idempotencyKey: "key" });
    expect(headers["x-integration-signature"]).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(JSON.stringify(headers)).not.toContain("secret");
  });

  it("provisions through the versioned endpoint with signed headers", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ installationId: "i1", tenantId: "t1", workspaceId: "w1", status: "active" }), { status: 200 }));
    const gateway = new HttpSocialControlGateway(config, { fetch: fetcher as typeof fetch, now: () => 1000, nonce: () => "nonce" });
    await expect(gateway.provisionWorkspace({ externalSiteId: "s1", businessName: "Cafe", locale: "de", admin: { externalUserId: "a1", email: "a@example.com" } }, "provision:s1")).resolves.toMatchObject({ workspaceId: "w1" });
    expect(fetcher).toHaveBeenCalledWith("https://api.social.example/api/integrations/v1/workspaces/provision", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-integration-id": "business-site", "x-idempotency-key": "provision:s1" }) }));
  });

  it("rejects a session URL outside the configured application origin", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ url: "https://phishing.example/session", expiresAt: new Date(Date.now() + 60000).toISOString() }), { status: 200 }));
    const gateway = new HttpSocialControlGateway(config, { fetch: fetcher as typeof fetch });
    await expect(gateway.createSession({ installationId: "i1", externalSiteId: "s1", externalUserId: "a1", locale: "en" }, "session:s1:a1")).rejects.toMatchObject({ code: "invalid_session_origin" });
  });

  it("requires a strong secret when enabled", () => {
    expect(() => validateSocialControlConfiguration({ ...config, secret: "short" })).toThrowError("weak_integration_secret");
  });
});
