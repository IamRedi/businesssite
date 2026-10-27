import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleGeocoder, GooglePlacesProvider } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("provider usage observability", () => {
  it("records every Places page after quota reservation and before fetch", async () => {
    const sequence: string[] = [];
    let page = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      sequence.push("fetch");
      page += 1;
      return new Response(JSON.stringify({ places: [], ...(page < 3 ? { nextPageToken: `page-${page}` } : {}) }), { status: 200 });
    }));
    const records: unknown[] = [];
    await new GooglePlacesProvider(
      async () => { sequence.push("reserve"); },
      async (usage) => { sequence.push("record"); records.push(usage); },
      "fake-key",
    ).search({ query: "Locksmith", maxResults: 20 });
    expect(sequence).toEqual(["reserve", "record", "fetch", "reserve", "record", "fetch", "reserve", "record", "fetch"]);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ service: "places_text_search", requestCount: 1, estimatedCostUsdMicros: 35000 });
  });

  it("fails before fetch when durable usage recording is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GooglePlacesProvider(
      async () => undefined,
      async () => { throw new Error("usage unavailable"); },
      "fake-key",
    ).search({ query: "Locksmith", maxResults: 20 })).rejects.toThrow("usage unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records geocoding before provider fetch without storing the address", async () => {
    const sequence: string[] = [];
    const records: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      sequence.push("fetch");
      return new Response(JSON.stringify({ status: "OK", results: [{ formatted_address: "Essen", geometry: { location: { lat: 51.45, lng: 7.01 } } }] }), { status: 200 });
    }));
    await new GoogleGeocoder(async (usage) => { sequence.push("record"); records.push(usage); }, "fake-key").resolveAddress("private test address");
    expect(sequence).toEqual(["record", "fetch"]);
    expect(JSON.stringify(records)).not.toContain("private test address");
    expect(records[0]).toMatchObject({ service: "geocoding", requestCount: 1, estimatedCostUsdMicros: 5000 });
  });
});
