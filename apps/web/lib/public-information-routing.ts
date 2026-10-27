const publicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEditorialSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 180 && publicSlugPattern.test(normalized)
    ? normalized
    : null;
}

export function encodeArticleCursor(cursor: { publishedAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeArticleCursor(value: string | undefined) {
  if (!value || value.length > 300) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      publishedAt?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.publishedAt !== "string" ||
      !Number.isFinite(new Date(parsed.publishedAt).getTime()) ||
      typeof parsed.id !== "string" ||
      !uuidPattern.test(parsed.id)
    ) return undefined;
    return { publishedAt: new Date(parsed.publishedAt).toISOString(), id: parsed.id };
  } catch {
    return undefined;
  }
}
