import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSiteAdmin: vi.fn(), stripeClient: vi.fn() }));

vi.mock("../../../../../../../lib/site-admin-auth", () => ({ requireSiteAdmin: mocks.requireSiteAdmin }));
vi.mock("../../../../../../../lib/stripe", () => ({ stripeClient: mocks.stripeClient }));

import { POST } from "./route";

describe("Social Media add-on checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_APP_URL = "https://platform.example";
    mocks.requireSiteAdmin.mockResolvedValue(null);
  });

  const request = (origin = "https://platform.example") => new Request(
    "https://platform.example/api/site-admin/example/addons/social-media/checkout",
    { method: "POST", headers: { origin, "sec-fetch-site": origin === "https://platform.example" ? "same-origin" : "cross-site" } },
  );

  it("denies a request without the matching business-admin session", async () => {
    const response = await POST(
      request(),
      { params: Promise.resolve({ slug: "example" }) },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Business admin authorization required." });
  });

  it("returns controlled unavailable without calling Stripe", async () => {
    mocks.requireSiteAdmin.mockResolvedValue({ siteId: "site-1" });
    const response = await POST(request(), { params: Promise.resolve({ slug: "example" }) });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: "Social Media is coming soon and cannot be purchased." });
    expect(mocks.stripeClient).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation attempts before session lookup", async () => {
    const response = await POST(request("https://attacker.example"), { params: Promise.resolve({ slug: "example" }) });
    expect(response.status).toBe(403);
    expect(mocks.requireSiteAdmin).not.toHaveBeenCalled();
  });
});
