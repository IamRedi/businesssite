import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  sameOrigin: true,
  passwordOk: true,
  requestCustomerExport: vi.fn(),
  getAdminByEmail: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@platform/site-data", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostgresSiteRepository: class {
    getAdminByEmail = state.getAdminByEmail;
  },
  PostgresPrivacyRepository: class {
    requestCustomerExport = state.requestCustomerExport;
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
const request = (
  body = "currentPassword=correct&siteId=site-b&accountId=account-b",
) =>
  new Request(
    "https://platform.example/api/site-admin/a/privacy-export/request",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-request-id": "request-a",
      },
      body,
    },
  );
describe("customer privacy export request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIVACY_EXPORT_ENABLED = "true";
    state.sameOrigin = true;
    state.passwordOk = true;
    state.getAdminByEmail.mockResolvedValue({
      id: "account-a",
      siteId: "site-a",
      email: "a@example.test",
      passwordHash: "stored-hash",
    });
    state.requestCustomerExport.mockResolvedValue({ ok: true, jobId: "job-a" });
    state.rate.mockResolvedValue({ allowed: true });
  });
  it("fails closed before database work when export execution is disabled", async () => {
    process.env.PRIVACY_EXPORT_ENABLED = "false";
    expect(
      (await POST(request(), { params: Promise.resolve({ slug: "a" }) }))
        .status,
    ).toBe(503);
    expect(state.getAdminByEmail).not.toHaveBeenCalled();
    expect(state.requestCustomerExport).not.toHaveBeenCalled();
  });
  it("requires same origin before authentication work", async () => {
    state.sameOrigin = false;
    expect(
      (await POST(request(), { params: Promise.resolve({ slug: "a" }) }))
        .status,
    ).toBe(403);
    expect(state.getAdminByEmail).not.toHaveBeenCalled();
  });
  it("derives scope from the trusted session and ignores body-supplied tenant IDs", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ slug: "a" }),
    });
    expect(response.status).toBe(202);
    expect(state.requestCustomerExport).toHaveBeenCalledWith(
      "trusted-session",
      "stored-hash",
      "request-a",
    );
    expect(
      JSON.stringify(state.requestCustomerExport.mock.calls),
    ).not.toContain("site-b");
  });
  it("rejects a wrong current password", async () => {
    state.passwordOk = false;
    expect(
      (await POST(request(), { params: Promise.resolve({ slug: "a" }) }))
        .status,
    ).toBe(403);
    expect(state.requestCustomerExport).not.toHaveBeenCalled();
  });
});
