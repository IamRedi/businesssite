import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getPublicBySlug: vi.fn(), getByVerifiedCustomDomain: vi.fn(), createDurableAppointment: vi.fn(),
  getAppointmentReceipt: vi.fn(), enforceRateLimit: vi.fn(), enforceSubjectRateLimit: vi.fn(), legacyCreate: vi.fn(), notification: vi.fn() }));
vi.mock("@platform/site-data", async importOriginal => {
  const actual = await importOriginal<typeof import("@platform/site-data")>();
  return { ...actual, PostgresSiteRepository: class {
    getPublicBySlug = mocks.getPublicBySlug; getByVerifiedCustomDomain = mocks.getByVerifiedCustomDomain;
    createDurableAppointment = mocks.createDurableAppointment; getAppointmentReceipt = mocks.getAppointmentReceipt;
    createPublicAppointmentBySlug = mocks.legacyCreate;
  } };
});
vi.mock("../../../../lib/rate-limit", () => ({ clientAddress: () => "203.0.113.71", enforceRateLimit: mocks.enforceRateLimit, enforceSubjectRateLimit: mocks.enforceSubjectRateLimit }));
vi.mock("../../../../lib/email", () => ({ sendAppointmentRequestNotification: mocks.notification }));
import { POST } from "./route";
import { POST as receipt } from "./receipt/route";
const key = Buffer.alloc(32, 71).toString("base64url");
const body = { contractVersion: 1, slug: "synthetic-a", customerName: "Synthetic Visitor", phone: "123" };
const saved = { ok:true, receipt:{ appointmentId:"71000000-0000-4000-8000-000000000001",createdAt:"2026-09-13T12:00:00Z",expiresAt:"2026-09-14T12:00:00Z" },
  appointment:{status:"requested",version:1,serviceTitle:null,preferredDate:null,preferredTime:null}, replayed:false,notification:{state:"disabled"} };
const request = (value: unknown = body, headers: Record<string,string> = { "idempotency-key": key }, host = "platform.example") => new Request("https://"+host+"/api/public/appointments",{
  method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(value) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("PUBLIC_APP_URL","https://platform.example");
  mocks.getPublicBySlug.mockResolvedValue({id:"site-a",services:[]});
  mocks.enforceRateLimit.mockResolvedValue({allowed:true}); mocks.enforceSubjectRateLimit.mockResolvedValue({allowed:true});
  mocks.createDurableAppointment.mockResolvedValue(saved); mocks.getAppointmentReceipt.mockResolvedValue({...saved,replayed:true});
  vi.stubGlobal("fetch",vi.fn(() => { throw new Error("provider requests forbidden in local tests"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("v1 appointment HTTP boundary", () => {
  it("returns 201 then 200 replay, no legacy quota/phone dedupe or provider call", async () => {
    const first = await POST(request()); expect(first.status).toBe(201); expect(await first.json()).toEqual(saved);
    mocks.createDurableAppointment.mockResolvedValue({...saved,replayed:true});
    const replay = await POST(request()); expect(replay.status).toBe(200); expect(replay.headers.get("cache-control")).toContain("no-store");
    expect(mocks.enforceSubjectRateLimit.mock.calls.every(c => c[0]==="appointment_site_network")).toBe(true);
    expect(mocks.legacyCreate).not.toHaveBeenCalled(); expect(mocks.notification).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null,[],{...body,contractVersion:2},{...body,siteId:"site-b"},{...body,preferredDate:"2026-10-01"},{...body,website:"bot"}])("rejects invalid v1 input %#", async value => {
    expect((await POST(request(value))).status).toBe(400); expect(mocks.createDurableAppointment).not.toHaveBeenCalled();
  });
  it("requires a canonical receipt key", async () => {
    expect((await POST(request(body,{}))).status).toBe(400);
    expect((await POST(request(body,{"idempotency-key":"short"}))).status).toBe(400);
    expect(mocks.createDurableAppointment).not.toHaveBeenCalled();
  });
  it.each([["idempotency_conflict",409],["capability_expired",410],["service_selection_required",422],["temporarily_unavailable",503],["capability_disabled",403],["not_found",404]])("maps %s without fabricated acknowledgement", async (errorCode,status) => {
    mocks.createDurableAppointment.mockResolvedValue({errorCode});
    const response = await POST(request()); expect(response.status).toBe(status); expect(await response.json()).toEqual({errorCode});
  });
  it("returns actual quota and abuse Retry-After",async () => {
    mocks.createDurableAppointment.mockResolvedValue({errorCode:"quota_reached",retryAfterSeconds:71});
    const quota = await POST(request()); expect(quota.status).toBe(429); expect(quota.headers.get("retry-after")).toBe("71");
    mocks.enforceRateLimit.mockResolvedValue({allowed:false,retryAfterSeconds:25});
    expect((await POST(request())).headers.get("retry-after")).toBe("25");
  });
  it("treats infrastructure and rate-limit failures as unavailable without echoing secrets",async () => {
    mocks.createDurableAppointment.mockRejectedValue(new Error(key));
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain(key);
    mocks.enforceRateLimit.mockRejectedValue(new Error("synthetic"));
    expect((await POST(request())).status).toBe(503);
  });
  it("denies private sites, cross-origin and wrong custom-domain tenants",async () => {
    mocks.getPublicBySlug.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
    expect((await POST(request(body,{"idempotency-key":key,origin:"https://evil.example"}))).status).toBe(404);
    mocks.getByVerifiedCustomDomain.mockResolvedValue({id:"site-b"});
    expect((await POST(request(body, {"idempotency-key":key},"customer.example"))).status).toBe(404);
    expect(mocks.createDurableAppointment).not.toHaveBeenCalled();
    mocks.getByVerifiedCustomDomain.mockResolvedValue({id:"site-a"});
    expect((await POST(request(body, {"idempotency-key":key},"customer.example"))).status).toBe(201);
  });
  it("receipt POST returns only the durable safe projection and never creates",async () => {
    const response = await receipt(request({contractVersion:1,slug:"synthetic-a"}));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({...saved,replayed:true});
    expect(mocks.createDurableAppointment).not.toHaveBeenCalled();
    expect((await receipt(request({...body,appointmentId:saved.receipt.appointmentId}))).status).toBe(400);
    mocks.getAppointmentReceipt.mockResolvedValue({errorCode:"not_found"});
    expect((await receipt(request({contractVersion:1,slug:"synthetic-a"}))).status).toBe(404);
  });
});
