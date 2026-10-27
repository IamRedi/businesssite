import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { PostgresSiteRepository } from "@platform/site-data";
import {
  credentialHash,
  credentialMatches,
  DUMMY_PASSWORD_HASH,
} from "./credential-hash";

export { DUMMY_PASSWORD_HASH };
export const SITE_ADMIN_SESSION_COOKIE = "site_admin_session";
export const SITE_ADMIN_SESSION_SECONDS = 14 * 24 * 60 * 60;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const trustedSessionHashes = new WeakMap<object, string>();

function rememberSessionHash<T extends object | null>(session: T, hash: string): T {
  if (session) trustedSessionHashes.set(session, hash);
  return session;
}

export function trustedSiteAdminSessionHash(session: object) {
  const hash = trustedSessionHashes.get(session);
  if (!hash) throw new Error("Trusted site-admin session provenance is unavailable.");
  return hash;
}

export const normalizeSiteAdminEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export async function passwordHash(password: string) {
  return credentialHash(password);
}
export async function passwordMatches(password: string, stored: string) {
  return credentialMatches(password, stored);
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const validSiteAdminToken = (value: string | undefined): value is string =>
  Boolean(value && TOKEN_PATTERN.test(value));

export function siteAdminSessionTokenFromCookieHeader(header: string | null) {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SITE_ADMIN_SESSION_COOKIE}=`))
    ?.slice(SITE_ADMIN_SESSION_COOKIE.length + 1);
  return validSiteAdminToken(value) ? value : undefined;
}

export const siteAdminSessionCookieOptions = (maxAge = SITE_ADMIN_SESSION_SECONDS) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

type SessionRepository = Pick<
  PostgresSiteRepository,
  "createAdminSession" | "revokeAdminSession"
>;

export async function rotateSiteAdminSession(
  repository: SessionRepository,
  accountId: string,
  previousToken: string | undefined,
  maxAgeSeconds = SITE_ADMIN_SESSION_SECONDS,
  verifiedPasswordHash?: string,
) {
  if (validSiteAdminToken(previousToken))
    await repository.revokeAdminSession(tokenHash(previousToken));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  if (verifiedPasswordHash)
    await repository.createAdminSession(accountId, tokenHash(token), expiresAt, verifiedPasswordHash);
  else
    await repository.createAdminSession(accountId, tokenHash(token), expiresAt);
  return token;
}

export async function requireSiteAdminSession() {
  const token = (await cookies()).get(SITE_ADMIN_SESSION_COOKIE)?.value;
  if (!validSiteAdminToken(token)) return null;
  const repository = new PostgresSiteRepository({ boundary: "runtime" });
  return rememberSessionHash(await repository.authenticateSiteAdmin(tokenHash(token)), tokenHash(token));
}
export async function requireSiteAdmin(slug: string) {
  const token = (await cookies()).get(SITE_ADMIN_SESSION_COOKIE)?.value;
  if (!validSiteAdminToken(token)) return null;
  return rememberSessionHash(
    await new PostgresSiteRepository({ boundary: "runtime" }).authenticateSiteAdmin(tokenHash(token), slug),
    tokenHash(token),
  );
}

export async function requireSiteAdminForSite(siteId: string) {
  const token = (await cookies()).get(SITE_ADMIN_SESSION_COOKIE)?.value;
  if (!validSiteAdminToken(token)) return null;
  const repository = new PostgresSiteRepository({ boundary: "runtime" });
  const session = await repository.authenticateSiteAdmin(tokenHash(token));
  return rememberSessionHash(session?.siteId === siteId ? session : null, tokenHash(token));
}
