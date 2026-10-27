import { describe, expect, it } from "vitest";
import { safeWebpFilename, webpDimensions } from "./upload-security";

describe("upload security", () => {
  it("rejects non-WebP bytes and sanitizes object names", () => {
    expect(webpDimensions(Buffer.from("not an image"))).toBeNull();
    expect(safeWebpFilename("../../My unsafe image.png")).toBe("-My-unsafe-image.webp");
  });

  it("reads VP8X dimensions for server-side limits", () => {
    const data = Buffer.alloc(30);
    data.write("RIFF", 0, "ascii");
    data.write("WEBP", 8, "ascii");
    data.write("VP8X", 12, "ascii");
    data.writeUIntLE(1999, 24, 3);
    data.writeUIntLE(999, 27, 3);
    expect(webpDimensions(data)).toEqual({ width: 2000, height: 1000 });
  });
});
