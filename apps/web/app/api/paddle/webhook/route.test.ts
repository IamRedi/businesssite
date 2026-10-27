import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unmarshal: vi.fn(),
  process: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("../../../../lib/paddle", () => ({
  paddleClient: () => ({ webhooks: { unmarshal: mocks.unmarshal } }),
  paddleLegacyLifecycleEnabled: () => process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED === "true",
  planForPaddlePrice: () => undefined,
}));
vi.mock("../../../../lib/public-site-cache", () => ({ invalidatePublicSiteById: mocks.invalidate }));
vi.mock("@platform/site-data", () => ({ PostgresSiteRepository: class { processBillingSubscriptionEvent = mocks.process; } }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED;
  process.env.PADDLE_WEBHOOK_SECRET = "pdl_ntfset_test";
  mocks.process.mockResolvedValue({ processed: true, siteId: "site-1" });
});

describe("Paddle webhook", () => {
  it("is runtime-disabled by default before signature or provider processing", async () => {
    const response = await POST(new Request("https://platform.example/api/paddle/webhook", {
      method: "POST",
      body: "{}",
    }));
    expect(response.status).toBe(410);
    expect(mocks.unmarshal).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("fails closed without a valid signature", async () => {
    process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED = "true";
    mocks.unmarshal.mockRejectedValue(new Error("invalid"));
    const response = await POST(new Request("https://platform.example/api/paddle/webhook", {
      method: "POST",
      headers: { "paddle-signature": "ts=1;h1=bad" },
      body: "{}",
    }));
    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("sanitizes a verified legacy event so it can only resolve an existing binding", async () => {
    process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED = "true";
    mocks.unmarshal.mockResolvedValue({
      eventId: "evt_1",
      eventType: "subscription.created",
      data: { id: "sub_1", status: "active", customerId: "ctm_1", items: [], customData: { siteId: "site-1", planKey: "starter" } },
    });
    const response = await POST(new Request("https://platform.example/api/paddle/webhook", {
      method: "POST",
      headers: { "paddle-signature": "ts=1;h1=verified" },
      body: "{\"event\":true}",
    }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({
      provider: "paddle",
      eventId: "evt_1",
      providerSubscriptionId: "sub_1",
      intakeId: undefined,
      siteId: undefined,
      planKey: undefined,
    }));
    expect(mocks.invalidate).toHaveBeenCalledWith(expect.anything(), "site-1");
  });
});
