import type { CustomerUiLocale } from "./locale-model";

export const documentLocaleHeader = "x-businesssite-document-locale";
export const documentBoundaryHeader = "x-businesssite-document-boundary";

export type DocumentLocaleBoundary =
  | { kind: "owner" }
  | { kind: "platform"; locale: CustomerUiLocale }
  | { kind: "site"; value: string }
  | { kind: "site-admin"; value: string }
  | { kind: "preview"; value: string }
  | { kind: "domain"; value: string };

const safeValue = /^[a-z0-9.-]{1,253}$/i;

export function serializeDocumentBoundary(boundary: DocumentLocaleBoundary) {
  if (boundary.kind === "owner") return "owner";
  if (boundary.kind === "platform") return `platform:${boundary.locale}`;
  return `${boundary.kind}:${boundary.value}`;
}

export function parseDocumentBoundary(value: string | null): DocumentLocaleBoundary | null {
  if (value === "owner") return { kind: "owner" };
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const kind = value.slice(0, separator);
  const boundaryValue = value.slice(separator + 1);
  if (kind === "platform" && (boundaryValue === "en" || boundaryValue === "de")) return { kind, locale: boundaryValue };
  if ((kind === "site" || kind === "site-admin" || kind === "preview" || kind === "domain") && safeValue.test(boundaryValue))
    return { kind, value: boundaryValue };
  return null;
}
