import "server-only";
import { cookies } from "next/headers";
import { exactLegalDocumentLocale } from "./locale-model";
import { configuredPlatformLocale } from "./platform-config";

export async function legalPageLocale(searchParams: Promise<{ lang?: string }>) {
  const requested = exactLegalDocumentLocale((await searchParams).lang);
  return requested ?? configuredPlatformLocale((await cookies()).get("platform_locale")?.value);
}
