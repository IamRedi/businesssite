import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { syntheticMp4, syntheticAudioMp4 } from "./owner-custom-media-fixtures";
import { boundedCustomMediaForm, customMediaFilename, customRequestLimit, validateCustomMedia } from "./owner-custom-media-validation";

describe("Owner custom media validation", () => {
  it("decodes real WebP and reads prepared MP4 dimensions/duration", async () => {
    const webp = await sharp({ create: { width: 16, height: 24, channels: 3, background: "black" } }).webp().toBuffer();
    expect(await validateCustomMedia(webp, "image/webp", 30)).toMatchObject({ width: 16, height: 24, mimeType: "image/webp", bytes: webp.length });
    expect(await validateCustomMedia(syntheticMp4, "video/mp4", 30)).toMatchObject({ width: 16, height: 16, durationSeconds: 2, mimeType: "video/mp4", bytes: syntheticMp4.length });
    expect(await validateCustomMedia(syntheticAudioMp4, "video/mp4", 30)).toMatchObject({ width: 16, height: 16, mimeType: "video/mp4", bytes: syntheticAudioMp4.length });
  });
  it("rejects unsupported MIME, forged extensions, empty/oversized sources", async () => {
    for (const mime of ["video/webm", "image/svg+xml", "text/html", "application/octet-stream"]) await expect(validateCustomMedia(syntheticMp4, mime, 30)).rejects.toMatchObject({ status: 415 });
    await expect(validateCustomMedia(Buffer.alloc(0), "image/webp", 30)).rejects.toMatchObject({ status: 413 });
    await expect(validateCustomMedia(Buffer.alloc(4_000_001), "video/mp4", 30)).rejects.toMatchObject({ status: 413 });
    await expect(validateCustomMedia(Buffer.from("<html>not media</html>"), "video/mp4", 30)).rejects.toThrow("Malformed");
    await expect(validateCustomMedia(syntheticMp4, "image/webp", 30)).rejects.toThrow("Malformed");
  });
  it("rejects truncated/trailing/polyglot containers and forged MP4 table counts", async () => {
    for (const bytes of [syntheticMp4.subarray(0, -1), Buffer.concat([syntheticMp4, Buffer.from("<script>alert(1)</script>")]), Buffer.from("\x1aE\xdf\xa3webm")]) await expect(validateCustomMedia(bytes, "video/mp4", 30)).rejects.toThrow("Malformed");
    const forged = Buffer.from(syntheticMp4), stsz = forged.indexOf("stsz"); forged.writeUInt32BE(0xffffffff, stsz + 12);
    await expect(validateCustomMedia(forged, "video/mp4", 30)).rejects.toThrow("Malformed");
    const emptyBitstream = Buffer.from(syntheticMp4); emptyBitstream.fill(0, emptyBitstream.indexOf("mdat") + 4);
    await expect(validateCustomMedia(emptyBitstream, "video/mp4", 30)).rejects.toThrow("Malformed");
    await expect(validateCustomMedia(syntheticMp4, "video/mp4", 1)).rejects.toThrow("Malformed");
  });
  it("rejects overlapping sample byte ranges before repeated codec scanning", async () => {
    const original = syntheticMp4, stco = original.indexOf("stco") - 4, insertion = stco + original.readUInt32BE(stco);
    const overlap = Buffer.concat([original.subarray(0, insertion), Buffer.alloc(12), original.subarray(insertion)]);
    for (const type of ["moov", "trak", "mdia", "minf", "stbl", "stco"]) { const start = overlap.indexOf(type) - 4; overlap.writeUInt32BE(overlap.readUInt32BE(start) + 12, start); }
    const sampleStart = overlap.indexOf("mdat") + 4;
    overlap.writeUInt32BE(4, stco + 12);
    for (let n = 0; n < 4; n++) overlap.writeUInt32BE(sampleStart, stco + 16 + n * 4);
    overlap.writeUInt32BE(1, overlap.indexOf("stsc") + 16);
    const stsz = overlap.indexOf("stsz"), firstSize = overlap.readUInt32BE(stsz + 16);
    for (let n = 0; n < 4; n++) overlap.writeUInt32BE(firstSize, stsz + 16 + n * 4);
    await expect(validateCustomMedia(overlap, "video/mp4", 30)).rejects.toThrow("Malformed");
  });
  it("rejects actual oversized image dimensions, corrupted pixel data and RIFF trailing bytes", async () => {
    const webp = await sharp({ create: { width: 2001, height: 2, channels: 3, background: "black" } }).webp().toBuffer();
    await expect(validateCustomMedia(webp, "image/webp", 30)).rejects.toThrow("Malformed");
    await expect(validateCustomMedia(Buffer.concat([webp, Buffer.from("HTML")]), "image/webp", 30)).rejects.toThrow("Malformed");
    const corrupted = Buffer.from(webp); corrupted.fill(0, 20);
    await expect(validateCustomMedia(corrupted, "image/webp", 30)).rejects.toThrow("Malformed");
  });
  it("bounds streamed actual request bytes irrespective of forged Content-Length", async () => {
    const request = new Request("https://owner.example/upload", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "1" }, body: Buffer.alloc(customRequestLimit + 1) });
    await expect(boundedCustomMediaForm(request)).rejects.toMatchObject({ status: 413 });
    expect(customMediaFilename("../../anything.svg", "video/mp4")).toBe("------anything.mp4");
  });
});
