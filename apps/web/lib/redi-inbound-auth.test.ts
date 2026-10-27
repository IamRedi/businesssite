import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateRediInboundRequest, signRediInboundRequest } from "./redi-inbound-auth";
import type { PostgresInformationRepository } from "@platform/site-data";

const secret = "r".repeat(48);
const timestamp = "1787100000";
const nonce = "nonce-unique-123456789";
const pathname = "/api/integrations/redi-control/v1/articles";

function repository(overrides: Record<string, unknown> = {}) {
  return {
    getRediInboundAccess: vi.fn().mockResolvedValue({
      integrationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      siteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      permissions: ["articles:read"],
      approvedAt: "2026-08-19T00:00:00.000Z",
      approvedBy: "owner@example.test",
    }),
    consumeIntegrationNonce: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as PostgresInformationRepository;
}

function request(input: { host?: string; signature?: string; timestamp?: string; nonce?: string; integrationId?: string } = {}) {
  const signedTimestamp = input.timestamp ?? timestamp;
  const signedNonce = input.nonce ?? nonce;
  const signature = input.signature ?? signRediInboundRequest(secret, {
    integrationId: "redi-installation-1",
    timestamp: signedTimestamp,
    nonce: signedNonce,
    method: "GET",
    pathname,
    rawBody: "",
  });
  return new Request(`https://platform.test${pathname}`, {
    headers: {
      host: input.host ?? "platform.test",
      "x-integration-id": input.integrationId ?? "redi-installation-1",
      "x-signature-timestamp": signedTimestamp,
      "x-signature-nonce": signedNonce,
      "x-signature": signature,
    },
  });
}

describe("REDI CONTROL inbound authentication", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_APP_URL", "https://platform.test");
    vi.stubEnv("REDI_CONTROL_INBOUND_ENABLED", "true");
    vi.stubEnv("REDI_CONTROL_INBOUND_SECRET", secret);
  });

  it("accepts a signed platform-host request and consumes its nonce", async () => {
    const repo = repository();
    const result = await authenticateRediInboundRequest({
      request: request(), rawBody: "", permission: "articles:read", repository: repo, now: Number(timestamp) * 1000,
    });
    expect(result.ok).toBe(true);
    expect(repo.consumeIntegrationNonce).toHaveBeenCalledOnce();
  });

  it("denies custom hosts before resolving an integration", async () => {
    const repo = repository();
    const result = await authenticateRediInboundRequest({
      request: request({ host: "customer.example" }), rawBody: "", permission: "articles:read", repository: repo, now: Number(timestamp) * 1000,
    });
    expect(result).toEqual({ ok: false, status: 404, code: "route_not_found" });
    expect(repo.getRediInboundAccess).not.toHaveBeenCalled();
  });

  it.each([
    ["bad signature", { signature: `v1=${"0".repeat(64)}` }],
    ["expired timestamp", { timestamp: "1787090000" }],
    ["tampered tenant installation", { integrationId: "redi-installation-forged" }],
  ])("denies %s", async (_label, headers) => {
    const repo = repository();
    const result = await authenticateRediInboundRequest({
      request: request(headers), rawBody: "", permission: "articles:read", repository: repo, now: Number(timestamp) * 1000,
    });
    expect(result.ok).toBe(false);
    expect(repo.consumeIntegrationNonce).not.toHaveBeenCalled();
  });

  it("denies a replayed nonce and a permission outside the explicit grant", async () => {
    const replay = await authenticateRediInboundRequest({
      request: request(), rawBody: "", permission: "articles:read", repository: repository({ consumeIntegrationNonce: vi.fn().mockResolvedValue(false) }), now: Number(timestamp) * 1000,
    });
    const permission = await authenticateRediInboundRequest({
      request: request({ nonce: "nonce-unique-987654321" }), rawBody: "", permission: "articles:publish", repository: repository(), now: Number(timestamp) * 1000,
    });
    expect(replay).toEqual({ ok: false, status: 401, code: "authentication_failed" });
    expect(permission).toEqual({ ok: false, status: 403, code: "permission_denied" });
  });
});
