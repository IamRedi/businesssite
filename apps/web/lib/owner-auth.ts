import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import * as OTPAuth from "otpauth";
import { PostgresOwnerAuthRepository, type OwnerSession } from "@platform/site-data";
import { credentialHash, credentialMatches, DUMMY_PASSWORD_HASH } from "./credential-hash";
import { platformBrandProfile } from "./brand-profile";

export const OWNER_SESSION_COOKIE = "owner_session";
export const OWNER_CHALLENGE_COOKIE = "owner_mfa_challenge";
export const OWNER_SESSION_SECONDS = 12 * 60 * 60;
export const OWNER_CHALLENGE_SECONDS = 5 * 60;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const RECOVERY_PATTERN = /^[A-F0-9]{20}$/;

export { DUMMY_PASSWORD_HASH };
export const ownerPasswordHash = credentialHash;
export const ownerPasswordMatches = credentialMatches;
export const normalizeOwnerEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
export const ownerTokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const ownerIdentityHash = (email: string) =>
  createHash("sha256").update(normalizeOwnerEmail(email)).digest("hex");
export const validOwnerToken = (value: string | undefined): value is string =>
  Boolean(value && TOKEN_PATTERN.test(value));
export const newOwnerToken = () => randomBytes(32).toString("hex");

export const ownerCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

function encryptionKey() {
  const configured = process.env.OWNER_MFA_ENCRYPTION_KEY?.trim();
  if (!configured || !/^[A-Za-z0-9_-]{43}$/.test(configured))
    throw new Error("OWNER_MFA_ENCRYPTION_KEY must be a base64url 32-byte key.");
  const key = Buffer.from(configured, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== configured)
    throw new Error("OWNER_MFA_ENCRYPTION_KEY must be a canonical base64url 32-byte key.");
  return key;
}

export function ownerMfaEncryptionConfigured() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function encryptOwnerMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptOwnerMfaSecret(envelope: string) {
  const [version, ivValue, ciphertextValue, tagValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue || !tagValue)
    throw new Error("Invalid owner MFA secret envelope.");
  try {
    const decode = (value: string) => {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url.");
      const decoded = Buffer.from(value, "base64url");
      if (decoded.toString("base64url") !== value) throw new Error("Non-canonical base64url.");
      return decoded;
    };
    const iv = decode(ivValue);
    const ciphertext = decode(ciphertextValue);
    const tag = decode(tagValue);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new Error("Invalid envelope length.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt owner MFA secret.");
  }
}

function totp(secret: string, email = "owner") {
  return new OTPAuth.TOTP({
    issuer: platformBrandProfile.displayName,
    label: email, algorithm: "SHA1", digits: 6,
    period: 30, secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function createOwnerMfaEnrollment(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  return { secret, uri: ownerMfaEnrollmentUri(secret, email) };
}

export const ownerMfaEnrollmentUri = (secret: string, email: string) =>
  totp(secret, email).toString();

export function verifyOwnerTotp(secret: string, token: string, now = Date.now()) {
  if (!/^\d{6}$/.test(token)) return null;
  const generator = totp(secret);
  const delta = generator.validate({ token, timestamp: now, window: 1 });
  return delta === null ? null : OTPAuth.TOTP.counter({ timestamp: now, period: 30 }) + delta;
}

export function generateOwnerRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    return raw.match(/.{1,5}/g)!.join("-");
  });
}

export function normalizeOwnerRecoveryCode(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return RECOVERY_PATTERN.test(normalized) ? normalized : "";
}
export const ownerRecoveryCodeHash = (value: string) => ownerTokenHash(normalizeOwnerRecoveryCode(value));

type OwnerSessionRepository = Pick<PostgresOwnerAuthRepository, "getSession">;
export async function validateOwnerSessionToken(
  token: string | undefined,
  repository: OwnerSessionRepository = new PostgresOwnerAuthRepository(),
): Promise<OwnerSession | null> {
  if (!validOwnerToken(token)) return null;
  return repository.getSession(ownerTokenHash(token));
}

export async function requireOwnerSession() {
  const token = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  return validateOwnerSessionToken(token);
}

export async function requireOwnerChallenge() {
  const token = (await cookies()).get(OWNER_CHALLENGE_COOKIE)?.value;
  if (!validOwnerToken(token)) return null;
  const challenge = await new PostgresOwnerAuthRepository().getChallenge(ownerTokenHash(token));
  return challenge ? { token, challenge } : null;
}
