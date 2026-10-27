import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider, discoveryCacheKey, normalizeDiscoveredBusiness, normalizeDiscoveryRequest } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("Finder provider trust boundary", () => {
  it("canonicalizes bounded requests and versioned cache identity", () => {
    const normalized = normalizeDiscoveryRequest({ query: "  Locksmith  ", city: " Berlin ", radius: 10, maxResults: 20, location: { latitude: 52.52, longitude: 13.405 } });
    expect(normalized).toMatchObject({ query: "Locksmith", city: "Berlin", radius: 10, maxResults: 20 });
    expect(discoveryCacheKey(normalized)).toMatch(/^[a-f0-9]{64}$/);
    expect(discoveryCacheKey(normalized)).not.toBe(discoveryCacheKey({ ...normalized, radius: 11 }));
    expect(discoveryCacheKey(normalized)).not.toBe(discoveryCacheKey({ ...normalized, maxResults: 19 }));
    const legacyV1Key = createHash("sha256").update(JSON.stringify({
      schemaVersion: 1,
      query: "locksmith",
      city: "berlin",
      category: "",
      radius: 10,
      minRating: "",
      keywords: "",
      maxResults: 20,
      latitude: "52.5200",
      longitude: "13.4050",
    })).digest("hex");
    expect(discoveryCacheKey(normalized)).not.toBe(legacyV1Key);
    expect(() => normalizeDiscoveryRequest({ query: "x", radius: 101 })).toThrow(/radius/i);
    expect(() => normalizeDiscoveryRequest({ query: "x", maxResults: 21 })).toThrow(/limit/i);
  });

  it("bounds and sanitizes untrusted provider fields before scoring", () => {
    const lead = normalizeDiscoveredBusiness({
      externalId: `place-${"x".repeat(400)}`,
      name: ` Business ${"n".repeat(300)} `,
      category: "c".repeat(300),
      address: "a".repeat(700),
      phone: "1".repeat(100),
      website: "javascript:alert(1)",
      rating: 99,
      reviewCount: -2,
      raw: { apiKey: "must-not-persist" },
    });
    expect(lead.externalId).toHaveLength(300);
    expect(lead.name).toHaveLength(200);
    expect(lead.category).toHaveLength(160);
    expect(lead.address).toHaveLength(500);
    expect(lead.phone).toHaveLength(80);
    expect(lead.website).toBeUndefined();
    expect(lead.rating).toBeUndefined();
    expect(lead.reviewCount).toBeUndefined();
    expect(JSON.stringify(lead)).not.toContain("must-not-persist");
  });

  it("does not infer website quality, activity or separate social proof from Places presence", () => {
    const existingWebsite = normalizeDiscoveredBusiness({
      externalId: "existing-site",
      name: "Existing Site",
      website: "https://example.test",
      phone: "+49 30 123456",
      rating: 4.8,
      reviewCount: 250,
      businessStatus: "OPERATIONAL",
      raw: {},
    });
    const missingWebsite = normalizeDiscoveredBusiness({
      externalId: "missing-site",
      name: "Missing Site",
      businessStatus: "OPERATIONAL",
      raw: {},
    });
    expect(existingWebsite.signals).toMatchObject({ websiteQuality: "unknown", isActive: true, hasSocialProof: false });
    expect(existingWebsite.reasons).toContain("website quality has not been assessed");
    expect(existingWebsite.reasons).not.toContain("website appears weak or outdated");
    expect(missingWebsite.signals.websiteQuality).toBe("missing");
    expect(missingWebsite.score).toBeGreaterThan(existingWebsite.score);
  });

  it("uses a deterministic fake response and returns at most the server limit", async () => {
    const places = Array.from({ length: 5 }, (_, index) => ({
      id: `place-${index}`,
      displayName: { text: `Business ${index}` },
      formattedAddress: `Address ${index}`,
      rating: 4.5,
      userRatingCount: 10,
      websiteUri: "https://example.test",
      location: { latitude: 52.52, longitude: 13.405 },
      providerSecret: "not-stored",
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ places }), { status: 200 })));
    const reserveProviderCall = vi.fn(async () => undefined);
    const result = await new GooglePlacesProvider(reserveProviderCall, async () => undefined, "fake-key").search({ query: "Locksmith", maxResults: 2 });
    expect(result).toHaveLength(2);
    expect(reserveProviderCall).toHaveBeenCalledTimes(1);
    expect(result.every((item) => Object.keys(item.raw).length === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("not-stored");
  });

  it("fetches additional candidates and prioritizes no-website businesses by distance", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: `website-${index}`,
      displayName: { text: `Website Business ${index}` },
      formattedAddress: `Website Address ${index}`,
      websiteUri: `https://business-${index}.example.test`,
      businessStatus: "OPERATIONAL",
      location: { latitude: 52.52, longitude: 13.405 },
    }));
    const secondPage = [
      { id: "missing-far", displayName: { text: "Missing Far" }, formattedAddress: "Far Address", businessStatus: "OPERATIONAL", location: { latitude: 52.6, longitude: 13.405 } },
      { id: "missing-near", displayName: { text: "Missing Near" }, formattedAddress: "Near Address", businessStatus: "OPERATIONAL", location: { latitude: 52.521, longitude: 13.405 } },
      { id: "website-near", displayName: { text: "Website Near" }, formattedAddress: "Website Near Address", websiteUri: "https://near.example.test", businessStatus: "OPERATIONAL", location: { latitude: 52.5205, longitude: 13.405 } },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: firstPage, nextPageToken: "page-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: secondPage }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const reserveProviderCall = vi.fn(async () => undefined);
    const result = await new GooglePlacesProvider(reserveProviderCall, async () => undefined, "fake-key").search({
      query: "Locksmith",
      maxResults: 2,
      radius: 20,
      location: { latitude: 52.52, longitude: 13.405 },
    });

    expect(result.map((item) => item.externalId)).toEqual(["missing-near", "missing-far"]);
    expect(result.every((item) => !item.website)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reserveProviderCall).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody).toMatchObject({ pageSize: 20, rankPreference: "DISTANCE" });
    expect(secondBody.pageToken).toBe("page-2");
  });

  it("skips malformed, closed and coordinate-less radius candidates without aborting valid results", async () => {
    const places = [
      { id: "malformed", formattedAddress: "Malformed" },
      { id: "operational", displayName: { text: "Operational" }, formattedAddress: "Operational Address", businessStatus: "OPERATIONAL", location: { latitude: 52.521, longitude: 13.405 } },
      { id: "temporarily-closed", displayName: { text: "Temporarily Closed" }, formattedAddress: "Closed Address", businessStatus: "CLOSED_TEMPORARILY", location: { latitude: 52.522, longitude: 13.405 } },
      { id: "permanently-closed", displayName: { text: "Permanently Closed" }, formattedAddress: "Closed Address", businessStatus: "CLOSED_PERMANENTLY", location: { latitude: 52.523, longitude: 13.405 } },
      { id: "missing-coordinates", displayName: { text: "Missing Coordinates" }, formattedAddress: "Unknown Address" },
      { id: "unknown-status", displayName: { text: "Unknown Status" }, formattedAddress: "Unknown Status Address", location: { latitude: 52.524, longitude: 13.405 } },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ places }), { status: 200 })));

    const result = await new GooglePlacesProvider(async () => undefined, async () => undefined, "fake-key").search({
      query: "Locksmith",
      radius: 10,
      location: { latitude: 52.52, longitude: 13.405 },
    });

    expect(result.map((item) => item.externalId)).toEqual(["operational", "unknown-status"]);
    expect(normalizeDiscoveredBusiness(result[0]!).signals.isActive).toBe(true);
    expect(normalizeDiscoveredBusiness(result[1]!).signals.isActive).toBe(false);
  });

  it("deduplicates provider IDs and never follows a fourth result page", async () => {
    const page = (id: string, nextPageToken?: string) => new Response(JSON.stringify({
      places: [
        { id: "duplicate", displayName: { text: "First Duplicate" }, formattedAddress: "Duplicate Address", websiteUri: "https://duplicate.example.test", businessStatus: "OPERATIONAL" },
        { id, displayName: { text: id }, formattedAddress: `${id} Address`, websiteUri: id === "third" ? undefined : `https://${id}.example.test`, businessStatus: "OPERATIONAL" },
      ],
      nextPageToken,
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page("first", "page-2"))
      .mockResolvedValueOnce(page("second", "page-3"))
      .mockResolvedValueOnce(page("third", "must-not-follow"));
    const reserveProviderCall = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GooglePlacesProvider(reserveProviderCall, async () => undefined, "fake-key").search({ query: "Locksmith", maxResults: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(reserveProviderCall).toHaveBeenCalledTimes(3);
    expect(result.filter((item) => item.externalId === "duplicate")).toHaveLength(1);
    expect(result[0]?.externalId).toBe("third");
  });

  it("reserves quota before every page and never sends an unmetered request", async () => {
    const events: string[] = [];
    const fetchMock = vi.fn(async () => {
      events.push("fetch");
      return new Response(JSON.stringify({
        places: [{ id: "website", displayName: { text: "Website" }, formattedAddress: "Address", websiteUri: "https://example.test" }],
        nextPageToken: "page-2",
      }), { status: 200 });
    });
    let reservations = 0;
    const reserveProviderCall = vi.fn(async () => {
      reservations += 1;
      events.push(`reserve-${reservations}`);
      if (reservations === 2) throw new Error("provider quota exhausted");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GooglePlacesProvider(reserveProviderCall, async () => undefined, "fake-key").search({ query: "Locksmith", maxResults: 2 }))
      .rejects.toThrow("provider quota exhausted");
    expect(events).toEqual(["reserve-1", "fetch", "reserve-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
