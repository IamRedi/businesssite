import { describe, it, expect } from "vitest";
import { parseCustomMedia } from "@platform/website-engine";
import { prepareOwnerCustomMediaUpload } from "./owner-custom-media-uploader";
const poster = { id: "poster", role: "video-poster", src: "/poster.webp", alt: "Synthetic poster", width: 16, height: 16 };
const media = JSON.stringify({ images: [poster], videos: [] });
describe("Owner upload selection contract before provider writes", () => {
  it("enforces video title160/image alt240 before upload, including switching roles", () => {
    expect(() => prepareOwnerCustomMediaUpload(media, "video", "v".repeat(161), "poster", "video/mp4")).toThrow("160");
    expect(() => prepareOwnerCustomMediaUpload(media, "gallery", "i".repeat(241), "", "image/webp")).toThrow("240");
    expect(prepareOwnerCustomMediaUpload(media, "video", "v".repeat(160), "poster", "video/mp4").videos).toEqual([]);
    expect(prepareOwnerCustomMediaUpload(media, "gallery", "i".repeat(240), "", "image/webp").images).toHaveLength(1);
  });
  it("requires an actual poster, correct role MIME and valid current composition", () => {
    expect(() => prepareOwnerCustomMediaUpload(media, "video", "Video", "other", "video/mp4")).toThrow("poster");
    expect(() => prepareOwnerCustomMediaUpload(media, "gallery", "Image", "", "video/mp4")).toThrow("WebP");
    expect(() => prepareOwnerCustomMediaUpload("{}", "gallery", "Image", "", "image/webp")).toThrow();
    expect(() => prepareOwnerCustomMediaUpload(media, "gallery", "  ", "", "image/webp")).toThrow("Enter");
  });
  it("rejects a full gallery but permits replacing a singleton image role", () => {
    const full = { images: Array.from({ length: 60 }, (_, n) => ({ ...poster, id: `image-${n}`, role: n === 0 ? "hero" : "gallery" })), videos: [] };
    expect(() => prepareOwnerCustomMediaUpload(JSON.stringify(full), "gallery", "Image", "", "image/webp")).toThrow("limit");
    expect(prepareOwnerCustomMediaUpload(JSON.stringify(full), "hero", "Hero", "", "image/webp")).toEqual(parseCustomMedia(full));
  });
});
