import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function credentialHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function credentialMatches(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected))
    return false;
  try {
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(Buffer.from(expected, "hex"), derived);
  } catch {
    return false;
  }
}
