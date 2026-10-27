import { canonicalOwnerPreviewUrl } from "./owner-preview-url";

export function canonicalOwnerAiPreviewUrl(
  previewUrl: string,
  publicAppUrl: string,
) {
  return canonicalOwnerPreviewUrl(previewUrl, publicAppUrl);
}
