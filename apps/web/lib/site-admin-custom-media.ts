import sharp from "sharp";
import { customImageLimit, CustomMediaError, validateCustomMedia } from "./owner-custom-media-validation";

/** Browsers may attach ICC profiles to canvas WebP. Persist only the same
 * metadata-free derivative accepted by the existing managed-media validator. */
export async function prepareCustomerCustomMedia(input: Buffer, mime: string, maxDuration: number) {
  let buffer = input;
  if (mime === "image/webp") {
    if (!input.length || input.length > customImageLimit) throw new CustomMediaError("Image exceeds upload limit.", 413);
    try {
      const image = sharp(input, { failOn: "warning", limitInputPixels: 4_000_000 });
      const metadata = await image.metadata();
      if (metadata.format !== "webp" || !metadata.width || !metadata.height || metadata.width > 2000 || metadata.height > 2000 || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
      buffer = await image.webp({ quality: 90 }).toBuffer();
    } catch { throw new CustomMediaError("Invalid image."); }
  }
  return { buffer, metadata: await validateCustomMedia(buffer, mime, maxDuration) };
}
