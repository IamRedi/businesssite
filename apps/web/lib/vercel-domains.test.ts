import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectVercelProjectDomain,
  normalizeDomainSetup,
  prepareVercelProjectDomain,
} from "./vercel-domains";

describe("Vercel custom-domain adapter", () => {
  const originalEnvironment = { ...process.env };
  const projectId = "prj_ExampleProject0000000000";
  const teamId = "team_1a2b3c4d5e6f7g8h9i0j1k2l";

  beforeEach(() => {
    process.env.VERCEL_TOKEN = "test-token";
    process.env.VERCEL_PROJECT_ID = projectId;
    process.env.VERCEL_TEAM_ID = teamId;
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("requires ownership and correct DNS before declaring a domain ready", () => {
    const setup = normalizeDomainSetup(
      "example.de",
      { name: "example.de", projectId, verified: true },
      { misconfigured: true, recommendedIPv4: { value: "192.0.2.10" } },
      { projectId, teamId },
    );
    expect(setup.ready).toBe(false);
    expect(setup.ownershipVerified).toBe(true);
    expect(setup.dnsConfigured).toBe(false);
    expect(setup.records).toEqual([
      { type: "A", name: "example.de", value: "192.0.2.10", purpose: "routing" },
    ]);
  });

  it("normalizes ownership and routing records without duplicates", () => {
    const setup = normalizeDomainSetup(
      "www.example.de",
      { name: "www.example.de", projectId, verified: false, verification: [{ type: "TXT", domain: "_vercel.example.de", value: "challenge" }] },
      { misconfigured: true, recommendedCNAME: [{ value: "target.vercel-dns.test" }, { value: "target.vercel-dns.test" }] },
      { projectId, teamId },
    );
    expect(setup.records).toEqual([
      { type: "TXT", name: "_vercel.example.de", value: "challenge", purpose: "ownership" },
      { type: "CNAME", name: "www.example.de", value: "target.vercel-dns.test", purpose: "routing" },
    ]);
  });

  it("adds an existing domain and reads its current DNS configuration", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "example.de", projectId, verified: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ misconfigured: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await prepareVercelProjectDomain("example.de");
    expect(result.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unmet ownership challenge pending instead of masking it as a provider error", async () => {
    const pending = { name: "example.de", projectId, verified: false, verification: [{ type: "TXT", domain: "_vercel.example.de", value: "challenge" }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pending), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "not verified" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pending), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ misconfigured: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await inspectVercelProjectDomain("example.de");
    expect(result.ready).toBe(false);
    expect(result.records[0]?.purpose).toBe("ownership");
  });
});
