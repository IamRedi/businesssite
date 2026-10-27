import { createHmac, timingSafeEqual } from "node:crypto";

const tokenPattern = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

function secret() {
  const value = process.env.PREVIEW_TOKEN_SECRET?.trim();
  if (!value) throw new Error("PREVIEW_TOKEN_SECRET is required for private previews.");
  return value;
}

function signature(tokenId: string) {
  return createHmac("sha256", secret()).update(`preview:${tokenId}`).digest("base64url");
}

export function previewToken(tokenId: string) {
  return `${tokenId}.${signature(tokenId)}`;
}

export function previewTokenId(value: string) {
  const match = tokenPattern.exec(value);
  if (!match) return null;
  const expected = signature(match[1]);
  const actual = match[2];
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    ? match[1]
    : null;
}
