import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareCustomerCustomMedia } from "./site-admin-custom-media";
import { syntheticMp4 } from "./owner-custom-media-fixtures";
import { validateCustomMedia } from "./owner-custom-media-validation";

describe("customer browser media preparation", () => {
  it("strips browser-style color profiles before the unchanged strict managed validator", async () => {
    const input = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#999999" } }).withIccProfile("srgb").webp().toBuffer();
    expect((await sharp(input).metadata()).icc).toBeDefined();
    await expect(validateCustomMedia(input, "image/webp", 30)).rejects.toThrow();
    const result = await prepareCustomerCustomMedia(input, "image/webp", 30);
    expect((await sharp(result.buffer).metadata()).icc).toBeUndefined();
    expect(result.metadata).toMatchObject({ width: 32, height: 24, mimeType: "image/webp", bytes: result.buffer.length });
  });
  it("does not transcode videos or accept mislabeled data", async () => {
    const video = await prepareCustomerCustomMedia(syntheticMp4, "video/mp4", 30);
    expect(video.buffer).toBe(syntheticMp4);
    await expect(prepareCustomerCustomMedia(syntheticMp4, "image/webp", 30)).rejects.toThrow();
    await expect(prepareCustomerCustomMedia(Buffer.from("invalid"), "image/webp", 30)).rejects.toThrow();
  });
  it("rejects oversized image dimensions before decoding", async () => {
    const input = await sharp({ create: { width: 2001, height: 1, channels: 3, background: "#999999" } }).webp().toBuffer();
    await expect(prepareCustomerCustomMedia(input, "image/webp", 30)).rejects.toThrow();
  });
});
