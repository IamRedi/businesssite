import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireOwnerSession: vi.fn() }));
const recordPermissionDenial = vi.hoisted(() => vi.fn());
vi.mock("./owner-auth", () => ({
  requireOwnerSession: auth.requireOwnerSession,
  decryptOwnerMfaSecret: vi.fn(), ownerPasswordMatches: vi.fn(), verifyOwnerTotp: vi.fn(),
}));
vi.mock("@platform/site-data", () => ({
  PostgresOwnerTeamRepository: class { recordPermissionDenial = recordPermissionDenial; },
  PostgresOwnerAuthRepository: class {},
}));

import { authorizeOwnerRequest } from "./owner-authorization";

const origin = "https://platform.example";
const request = (requestOrigin = origin) => new Request(`${origin}/api/owner/team/invitations`, {
  method: "POST",
  headers: { origin: requestOrigin, "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site" },
});

describe("owner server authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_APP_URL", origin);
  });

  it("allows a database-backed owner session with the explicit permission", async () => {
    auth.requireOwnerSession.mockResolvedValue({ ownerId: "owner-id", sessionId: "session-id", sessionHash: "a".repeat(64), email: "owner@example.test", role: "owner" });
    expect((await authorizeOwnerRequest(request(), "team.manage")).ok).toBe(true);
  });

  it("denies a viewer at the server even if the UI/API is called directly and audits the denial", async () => {
    auth.requireOwnerSession.mockResolvedValue({ ownerId: "viewer-id", sessionId: "session-id", sessionHash: "b".repeat(64), email: "viewer@example.test", role: "viewer" });
    const result = await authorizeOwnerRequest(request(), "team.manage");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(recordPermissionDenial).toHaveBeenCalledWith("viewer-id", "team.manage", expect.any(String));
  });

  it("rejects cross-origin requests before reading a session", async () => {
    const result = await authorizeOwnerRequest(request("https://attacker.example"), "team.manage");
    expect(result.ok).toBe(false);
    expect(auth.requireOwnerSession).not.toHaveBeenCalled();
  });
});
