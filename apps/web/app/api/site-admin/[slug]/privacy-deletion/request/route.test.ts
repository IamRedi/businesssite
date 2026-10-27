import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  sameOrigin: true,
  passwordOk: true,
  request: vi.fn(),
  account: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@platform/site-data", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostgresSiteRepository: class {
    getAdminByEmail = state.account;
  },
  PostgresPrivacyRepository: class {
    requestCustomerDeletion = state.request;
  },
}));
vi.mock("../../../../../../lib/rate-limit", () => ({
  enforceSubjectRateLimit: state.rate,
}));
vi.mock("../../../../../../lib/request-body", () => ({
  readUrlEncodedBody: async (request: Request) => ({
    ok: true,
    value: new URLSearchParams(await request.text()),
  }),
}));
vi.mock("../../../../../../lib/same-origin", () => ({
  isSameOriginRequest: () => state.sameOrigin,
}));
vi.mock("../../../../../../lib/site-admin-auth", () => ({
  passwordMatches: () => state.passwordOk,
  requireSiteAdmin: async () => ({
    accountId: "account-a",
    siteId: "site-a",
    email: "a@example.test",
    preferredLocale: "en",
  }),
  trustedSiteAdminSessionHash: () => "trusted-session",
}));
import { POST } from "./route";
const make = (
  body = "reason=business_closed&acknowledge=yes&currentPassword=correct&siteId=site-b",
) =>
  new Request(
    "https://platform.example/api/site-admin/a/privacy-deletion/request",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-request-id": "request-a",
      },
      body,
    },
  );
describe("customer deletion request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PRIVACY_DELETION_REQUESTS_ENABLED", "true");
    state.sameOrigin = true;
    state.passwordOk = true;
    state.rate.mockResolvedValue({ allowed: true });
    state.account.mockResolvedValue({
      id: "account-a",
      passwordHash: "stored-hash",
    });
    state.request.mockResolvedValue({ ok: true, jobId: "job-a" });
  });
  it("does no database work while disabled", async () => {
    vi.stubEnv("PRIVACY_DELETION_REQUESTS_ENABLED", "false");
    expect(
      (await POST(make(), { params: Promise.resolve({ slug: "a" }) })).status,
    ).toBe(503);
    expect(state.account).not.toHaveBeenCalled();
    expect(state.request).not.toHaveBeenCalled();
  });
  it("requires same origin and irreversible acknowledgement", async () => {
    state.sameOrigin = false;
    expect(
      (await POST(make(), { params: Promise.resolve({ slug: "a" }) })).status,
    ).toBe(403);
    state.sameOrigin = true;
    expect(
      (
        await POST(make("reason=business_closed&currentPassword=correct"), {
          params: Promise.resolve({ slug: "a" }),
        })
      ).status,
    ).toBe(400);
  });
  it("derives exact scope from the session and ignores body tenant ids", async () => {
    expect(
      (await POST(make(), { params: Promise.resolve({ slug: "a" }) })).status,
    ).toBe(202);
    expect(state.request).toHaveBeenCalledWith({
      sessionHash: "trusted-session",
      currentPasswordHash: "stored-hash",
      reason: "business_closed",
      note: undefined,
      acknowledged: true,
      correlationId: "request-a",
    });
    expect(JSON.stringify(state.request.mock.calls)).not.toContain("site-b");
  });
  it("rejects wrong password and rate limit", async () => {
    state.passwordOk = false;
    expect(
      (await POST(make(), { params: Promise.resolve({ slug: "a" }) })).status,
    ).toBe(403);
    state.passwordOk = true;
    state.rate.mockResolvedValue({ allowed: false });
    expect(
      (await POST(make(), { params: Promise.resolve({ slug: "a" }) })).status,
    ).toBe(429);
  });
});
