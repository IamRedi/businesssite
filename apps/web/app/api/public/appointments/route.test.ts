import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteDocument } from "@platform/website-engine";

const mocks = vi.hoisted(() => ({
  repositoryCreated: vi.fn(),
  getPublicBySlug: vi.fn(),
  createPublicAppointmentBySlug: vi.fn(),
  getAdminBySiteId: vi.fn(),
  sendAppointmentRequestNotification: vi.fn(),
  enforceRateLimit: vi.fn(),
  enforceSubjectRateLimit: vi.fn(),
  enforceTenantQuota: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    constructor() { mocks.repositoryCreated(); }
    getPublicBySlug = mocks.getPublicBySlug;
    createPublicAppointmentBySlug = mocks.createPublicAppointmentBySlug;
    getAdminBySiteId = mocks.getAdminBySiteId;
  },
}));
vi.mock("../../../../lib/rate-limit", () => ({
  clientAddress: () => "203.0.113.10",
  enforceRateLimit: mocks.enforceRateLimit,
  enforceSubjectRateLimit: mocks.enforceSubjectRateLimit,
}));
vi.mock("../../../../lib/tenant-usage-policy", () => ({
  enforceTenantQuota: mocks.enforceTenantQuota,
}));
vi.mock("../../../../lib/email", () => ({
  sendAppointmentRequestNotification: mocks.sendAppointmentRequestNotification,
}));

import { POST } from "./route";

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://platform.example/api/public/appointments", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const siteServices = [{ title: "Consultation", description: "Synthetic service" }] satisfies SiteDocument["services"];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.enforceSubjectRateLimit.mockResolvedValue({ allowed: true });
  mocks.enforceTenantQuota.mockResolvedValue({ allowed: true, state: "normal" });
  mocks.getPublicBySlug.mockResolvedValue({ id: "site-1", content: { name: "Example" }, services: siteServices });
  mocks.createPublicAppointmentBySlug.mockResolvedValue({ id: "appointment-1", siteId: "site-1" });
  mocks.getAdminBySiteId.mockResolvedValue(null);
  mocks.sendAppointmentRequestNotification.mockResolvedValue({ status: "sent" });
});

describe("public appointment endpoint", () => {
  it("silently absorbs honeypot spam before repository work", async () => {
    const response = await POST(request({ slug: "business", customerName: "Bot", phone: "1", website: "spam" }));
    expect(response.status).toBe(201);
    expect(mocks.repositoryCreated).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before tenant lookups", async () => {
    const response = await POST(request({}, { "content-length": "9000" }));
    expect(response.status).toBe(413);
    expect(mocks.repositoryCreated).not.toHaveBeenCalled();
  });

  it("rejects a throttled replay without claiming persistence or inserting a duplicate", async () => {
    mocks.enforceSubjectRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });
    const response = await POST(request({ slug: "business", customerName: "Ada", phone: "123", preferredDate: "2026-09-01", preferredTime: "10:00" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(await response.json()).toEqual({ errorCode: "rate_limited" });
    expect(mocks.createPublicAppointmentBySlug).not.toHaveBeenCalled();
  });

  it.each([null, [], true, { slug: "business", customerName: 123, phone: "123" }, { slug: "business", customerName: " ", phone: "123" }])("rejects malformed input before tenant lookups %#", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.getPublicBySlug).not.toHaveBeenCalled();
    expect(mocks.createPublicAppointmentBySlug).not.toHaveBeenCalled();
  });

  it("rejects a service absent from the resolved site's catalog before quota consumption", async () => {
    const response = await POST(request({ slug: "business", customerName: "Synthetic Visitor", phone: "123", serviceTitle: "Another business service" }));
    expect(response.status).toBe(400);
    expect(mocks.enforceTenantQuota).not.toHaveBeenCalled();
    expect(mocks.createPublicAppointmentBySlug).not.toHaveBeenCalled();
  });

  it.each(["persistence", "quota"])("never converts a failed %s attempt into a successful replay", async (failure) => {
    if (failure === "persistence") mocks.createPublicAppointmentBySlug.mockRejectedValueOnce(new Error("synthetic failure"));
    else mocks.enforceTenantQuota.mockResolvedValueOnce({ allowed: false, state: "blocked", retryAfterSeconds: 60 });
    const body = { slug: "business", customerName: "Synthetic Visitor", phone: "123" };
    expect((await POST(request(body))).status).toBe(failure === "persistence" ? 403 : 429);
    mocks.enforceSubjectRateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });
    const replay = await POST(request(body));
    expect(replay.status).toBe(429);
    expect(await replay.json()).not.toHaveProperty("ok", true);
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledTimes(failure === "persistence" ? 1 : 0);
    expect(mocks.sendAppointmentRequestNotification).not.toHaveBeenCalled();
  });

  it("keeps the stored acknowledgement when recipient lookup fails after persistence", async () => {
    mocks.getAdminBySiteId.mockRejectedValueOnce(new Error("synthetic recipient lookup failure"));
    const response = await POST(request({ slug: "business", customerName: "Synthetic Visitor", phone: "123" }));
    expect(response.status).toBe(201);
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledOnce();
    expect(mocks.sendAppointmentRequestNotification).not.toHaveBeenCalled();
  });

  it("persists one valid tenant-scoped appointment", async () => {
    const response = await POST(request({ slug: "business", customerName: "Ada", phone: "123", serviceTitle: "Consultation", siteId: "attacker-site", status: "confirmed", createdAt: "2000-01-01" }));
    expect(response.status).toBe(201);
    expect(mocks.enforceTenantQuota).toHaveBeenCalledWith(expect.anything(), { siteId: "site-1", metric: "appointment_submission" });
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledTimes(1);
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledWith("business", expect.objectContaining({ customerName: "Ada" }));
    const persisted = mocks.createPublicAppointmentBySlug.mock.calls[0][1];
    expect(persisted).not.toHaveProperty("siteId");
    expect(persisted).not.toHaveProperty("status");
    expect(persisted).not.toHaveProperty("createdAt");
  });

  it("uses the durable customer locale for the business notification", async () => {
    mocks.getPublicBySlug.mockResolvedValue({ id: "site-1", content: { name: "Beispiel" } });
    mocks.getAdminBySiteId.mockResolvedValue({ email: "owner@example.test", preferredLocale: "de" });
    const response = await POST(request({ slug: "business", customerName: "Ada", phone: "123" }));
    expect(response.status).toBe(201);
    expect(mocks.sendAppointmentRequestNotification).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test", locale: "de", customerName: "Ada" }));
  });

  it("allows repeated requests only after the public resolver boundary approves the site", async () => {
    for (const lifecycle of ["active", "payment-grace"]) {
      const response = await POST(request({ slug: "business", customerName: lifecycle, phone: "123" }));
      expect(response.status).toBe(201);
    }
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledTimes(2);
  });

  it("denies a non-public target before quota, insert or email work", async () => {
    mocks.getPublicBySlug.mockResolvedValue(null);
    const response = await POST(request({ slug: "business", customerName: "Inactive", phone: "123" }));
    expect(response.status).toBe(404);
    expect(mocks.enforceTenantQuota).not.toHaveBeenCalled();
    expect(mocks.createPublicAppointmentBySlug).not.toHaveBeenCalled();
    expect(mocks.sendAppointmentRequestNotification).not.toHaveBeenCalled();
  });

  it("does not call email when the database reauthorization fails closed", async () => {
    mocks.createPublicAppointmentBySlug.mockRejectedValue(new Error("unavailable"));
    const response = await POST(request({ slug: "business", customerName: "Ada", phone: "123" }));
    expect(response.status).toBe(403);
    expect(mocks.sendAppointmentRequestNotification).not.toHaveBeenCalled();
    expect(mocks.getAdminBySiteId).not.toHaveBeenCalled();
  });

  it("keeps the stored request when notification delivery fails", async () => {
    mocks.getAdminBySiteId.mockResolvedValue({ email: "owner@example.test", preferredLocale: "en" });
    mocks.sendAppointmentRequestNotification.mockRejectedValue(new Error("provider unavailable"));
    const response = await POST(request({ slug: "business", customerName: "Ada", phone: "123" }));
    expect(response.status).toBe(201);
    expect(mocks.createPublicAppointmentBySlug).toHaveBeenCalledOnce();
    expect(mocks.sendAppointmentRequestNotification).toHaveBeenCalledOnce();
  });
});
