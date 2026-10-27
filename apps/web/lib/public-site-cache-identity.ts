import { createHash } from "node:crypto";

export type PublicSiteIdentity =
  | { kind: "slug"; value: string }
  | { kind: "domain"; value: string };

export function normalizePublicSiteIdentity(identity: PublicSiteIdentity) {
  const value = identity.value
    .trim()
    .toLowerCase()
    .replace(identity.kind === "domain" ? /^www\./ : /^$/, "");
  if (identity.kind === "slug") {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(value))
      return null;
  } else if (
    !/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(
      value,
    )
  ) {
    return null;
  }
  return { kind: identity.kind, value } as PublicSiteIdentity;
}

export function publicSiteCacheTag(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return null;
  const digest = createHash("sha256")
    .update(`${normalized.kind}:${normalized.value}`)
    .digest("hex");
  return `public-site:${normalized.kind}:${digest}`;
}
