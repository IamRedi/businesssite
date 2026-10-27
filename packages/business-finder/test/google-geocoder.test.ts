import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleGeocoder } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("GoogleGeocoder", () => {
  it("reverse-geocodes a permitted device position into a formatted address", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("latlng=51.4556%2C7.0116");
      return new Response(JSON.stringify({ status: "OK", results: [{ formatted_address: "Kettwiger Straße 1, 45127 Essen, Germany", geometry: { location: { lat: 51.4556, lng: 7.0116 } } }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GoogleGeocoder(async () => undefined, "maps-key").resolveCoordinates(51.4556, 7.0116)).resolves.toEqual({ latitude: 51.4556, longitude: 7.0116, label: "Kettwiger Straße 1, 45127 Essen, Germany" });
  });

  it("rejects invalid device coordinates before calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GoogleGeocoder(async () => undefined, "maps-key").resolveCoordinates(99, 7)).rejects.toThrow("Device location is invalid.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
