import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repositoryCreated: vi.fn(),
  createSelfServiceTrial: vi.fn(),
  passwordHash: vi.fn(),
  tokenHash: vi.fn(() => "d".repeat(64)),
  enforceRateLimit: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  sendTrialWelcome: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    constructor() { mocks.repositoryCreated(); }
    createSelfServiceTrial = mocks.createSelfServiceTrial;
  },
  SiteAdminAccountConflictError: class extends Error {
    code = "SITE_ADMIN_ACCOUNT_CONFLICT";
  },
}));
vi.mock("../../../../lib/site-admin-auth", () => ({
  passwordHash: mocks.passwordHash,
  tokenHash: mocks.tokenHash,
  SITE_ADMIN_SESSION_COOKIE: "site_admin_session",
  siteAdminSessionCookieOptions: (maxAge: number) => ({ httpOnly: true, sameSite: "strict", path: "/", maxAge }),
  siteAdminSessionTokenFromCookieHeader: (header: string | null) => header?.includes("site_admin_session=") ? "a".repeat(64) : undefined,
}));
vi.mock("../../../../lib/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../lib/email", () => ({ sendTrialWelcome: mocks.sendTrialWelcome }));
vi.mock("../../../../lib/preview-token", () => ({ previewToken: () => "signed-preview" }));

import { POST } from "./route";

const validInput = {
  businessName: "Example Studio",
  category: "Hair salon",
  email: "owner@example.test",
  password: "a-long-trial-password",
  locale: "en",
  b2bAttested: true,
  privacyAcknowledged: true,
};
const request = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Request("https://platform.example/api/public/trials", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.passwordHash.mockResolvedValue("password-hash");
  mocks.createSelfServiceTrial.mockResolvedValue({
    site: { id: "site-1", slug: "example-studio" },
    accountId: "account-1",
    expiresAt: "2026-09-01T00:00:00.000Z",
    previewTokenId: "preview-token-id",
  });
  mocks.sendTrialWelcome.mockResolvedValue({ status: "sent" });
});

describe("public trial endpoint", () => {
  it.each(["b2bAttested", "privacyAcknowledged"])("rejects trial signup without %s", async (field) => {
    const response = await POST(request({ ...validInput, [field]: false }));
    expect(response.status).toBe(400);
    expect(mocks.createSelfServiceTrial).not.toHaveBeenCalled();
  });
  it("rejects oversized JSON before password hashing or persistence", async () => {
    const response = await POST(request({}, { "content-length": "30000" }));
    expect(response.status).toBe(413);
    expect(mocks.passwordHash).not.toHaveBeenCalled();
    expect(mocks.repositoryCreated).not.toHaveBeenCalled();
  });

  it("rejects a filled honeypot before expensive work", async () => {
    const response = await POST(request({ ...validInput, website: "spam" }));
    expect(response.status).toBe(400);
    expect(mocks.passwordHash).not.toHaveBeenCalled();
    expect(mocks.repositoryCreated).not.toHaveBeenCalled();
  });

  it("enforces the email layer before hashing a password", async () => {
    mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const response = await POST(request(validInput));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.passwordHash).not.toHaveBeenCalled();
    expect(mocks.createSelfServiceTrial).not.toHaveBeenCalled();
  });

  it("creates a 14-day trial, session and private preview without card details", async () => {
    const response = await POST(request(validInput));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      previewUrl: "/preview/signed-preview",
      editorUrl: "/site-admin/example-studio",
      emailDelivery: "sent",
    });
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledTimes(1);
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledWith(
      expect.objectContaining({ trialDurationDays: 14 }),
    );
    const createdSite = mocks.createSelfServiceTrial.mock.calls[0]?.[0].site;
    expect(createdSite.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new Set(createdSite.services.map((service: { description: string }) => service.description)).size).toBe(3);
    expect(createdSite.services[0].description).toContain("cut");
    expect(createdSite.services[1].description).toContain("Colour");
    expect(createdSite.services[2].description).toContain("Hair treatments");
    expect(mocks.createSelfServiceTrial.mock.calls[0]?.[0]).toMatchObject({
      sessionTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sessionExpiresAt: expect.any(String),
    });
    expect(mocks.sendTrialWelcome).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toContain("site_admin_session=");
  });

  it("stores and emails the server-derived customer locale independently from website content locale", async () => {
    const response = await POST(request({ ...validInput, locale: "sq" }, { cookie: "platform_locale=de" }));
    expect(response.status).toBe(201);
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledWith(expect.objectContaining({
      preferredLocale: "de",
      site: expect.objectContaining({ locale: "sq" }),
    }));
    expect(mocks.sendTrialWelcome).toHaveBeenCalledWith(expect.objectContaining({ locale: "de" }));
  });

  it("normalizes email casing and whitespace before persistence and rate limiting", async () => {
    await POST(request({ ...validInput, email: "  Owner@Example.TEST  " }));
    expect(mocks.enforceSubjectRateLimit).toHaveBeenCalledWith(
      "public_trial_email",
      "owner@example.test",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.test" }),
    );
  });

  it("returns a generic conflict without existing account, site or slug identity", async () => {
    mocks.createSelfServiceTrial.mockRejectedValue(
      Object.assign(new Error("private detail: existing-site-slug"), {
        code: "SITE_ADMIN_ACCOUNT_CONFLICT",
      }),
    );
    const response = await POST(request(validInput));
    const payload = JSON.stringify(await response.json());
    expect(response.status).toBe(409);
    expect(payload).toBe('{"errorCode":"trial_conflict"}');
    expect(payload).not.toContain("existing-site-slug");
    expect(payload).not.toContain("account");
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledTimes(1);
  });

  it("atomically replaces a prior browser session hash without exposing either token", async () => {
    const response = await POST(request(validInput, { cookie: `site_admin_session=${"a".repeat(64)}` }));
    expect(mocks.createSelfServiceTrial).toHaveBeenCalledWith(expect.objectContaining({
      previousSessionTokenHash: "d".repeat(64),
      sessionTokenHash: "d".repeat(64),
    }));
    const payload = JSON.stringify(await response.json());
    expect(payload).not.toContain("a".repeat(64));
    expect(payload).not.toContain("b".repeat(64));
  });

  it("creates professional-services trials with the consultation template and media", async () => {
    const response = await POST(request({
      ...validInput,
      businessName: "Professional Advisory",
      category: "Professional services",
    }));

    expect(response.status).toBe(201);
    const input = mocks.createSelfServiceTrial.mock.calls[0]?.[0];
    expect(input.site.templateKey).toBe("consultation");
    expect(input.site.media.heroImageUrl).toBe(
      "/images/templates/wl-professional-consultation-v1.png",
    );
    expect(
      [
        input.site.media.heroImageUrl,
        ...input.site.media.serviceImageUrls,
        ...input.site.media.galleryImageUrls,
      ].every((image: string) => !image.includes("auto-repair")),
    ).toBe(true);
  });

  it("stores canonical combobox keys and resolves the template canonically (BSRC-DESIGN-P4-001)", async () => {
    const response = await POST(request({
      ...validInput,
      businessName: "Metalika",
      category: "Ndërtim metalik",
      categoryKey: "construction-trades",
      subcategoryKey: "metal-construction",
    }));
    expect(response.status).toBe(201);
    const input = mocks.createSelfServiceTrial.mock.calls[0]?.[0];
    expect(input.profile.business.categoryKey).toBe("construction-trades");
    expect(input.profile.business.subcategoryKey).toBe("metal-construction");
    expect(input.site.templateKey).toBe("construction");
    expect(input.site.templateKey).not.toBe("midnight");
  });

  it("drops unknown canonical keys and keeps creating the trial through the legacy path", async () => {
    const response = await POST(request({
      ...validInput,
      category: "Ndërtim metalik",
      categoryKey: "not-a-family",
      subcategoryKey: "not-a-subcategory",
    }));
    expect(response.status).toBe(201);
    const input = mocks.createSelfServiceTrial.mock.calls[0]?.[0];
    expect(input.profile.business.categoryKey).toBeUndefined();
    expect(input.profile.business.subcategoryKey).toBeUndefined();
  });
});
