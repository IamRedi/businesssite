export function canonicalOwnerPreviewUrl(
  previewUrl: string,
  publicAppUrl: string,
) {
  const canonical = new URL(publicAppUrl);
  if (
    !/^https?:$/.test(canonical.protocol) ||
    canonical.username ||
    canonical.password
  ) {
    throw new Error("The canonical public URL is invalid.");
  }

  const preview = new URL(previewUrl, canonical);
  if (
    preview.origin !== canonical.origin ||
    !preview.pathname.startsWith("/preview/") ||
    preview.pathname === "/preview/"
  ) {
    throw new Error("The private preview URL is invalid.");
  }

  return preview.toString();
}

/**
 * Absolute canonical public URL for a published site. Owner panels render on
 * the control host, where a relative /site/ link is redirected to the platform
 * root and loses its path; public site links must always target the canonical
 * public origin.
 */
export function canonicalPublicSiteUrl(
  siteSlug: string,
  publicAppUrl: string,
) {
  const canonical = new URL(publicAppUrl);
  if (
    !/^https?:$/.test(canonical.protocol) ||
    canonical.username ||
    canonical.password
  ) {
    throw new Error("The canonical public URL is invalid.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteSlug) || siteSlug.length > 180) {
    throw new Error("The public site slug is invalid.");
  }
  return `${canonical.origin}/site/${siteSlug}`;
}

/**
 * Absolute canonical public URL for an owner-panel path that must open on the
 * public origin (customer setup links, published sites). Control-host relative
 * links are redirected to the platform root and lose their path.
 */
export function canonicalPublicPathUrl(
  pathWithQuery: string,
  publicAppUrl: string,
) {
  const canonical = new URL(publicAppUrl);
  if (
    !/^https?:$/.test(canonical.protocol) ||
    canonical.username ||
    canonical.password
  ) {
    throw new Error("The canonical public URL is invalid.");
  }
  const resolved = new URL(pathWithQuery, canonical);
  if (
    resolved.origin !== canonical.origin ||
    !resolved.pathname.startsWith("/") ||
    resolved.pathname.startsWith("//")
  ) {
    throw new Error("The public path is invalid.");
  }
  return resolved.toString();
}
