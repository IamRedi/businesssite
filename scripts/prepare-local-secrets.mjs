import { randomBytes } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const target = ".env.local";
const template = ".env.example";
const force = process.argv.includes("--force");
const requiredSecrets = [
  "OWNER_MFA_ENCRYPTION_KEY",
  "PREVIEW_TOKEN_SECRET",
  "CRON_SECRET",
];
const optionalSecrets = [];

if (!existsSync(target)) {
  if (!existsSync(template)) throw new Error(`${template} was not found.`);
  await copyFile(template, target);
}

let contents = await readFile(target, "utf8");
const eol = contents.includes("\r\n") ? "\r\n" : "\n";
const changed = [];

function configuredValue(key) {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2") ?? "";
}

function unsafe(value) {
  const normalized = value.toLowerCase();
  return (
    value.length < 32 ||
    normalized.includes("replace-") ||
    normalized.includes("change-me") ||
    normalized.includes("changeme")
  );
}

function setValue(key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\s*$/, "")}${eol}${line}${eol}`;
}

for (const key of requiredSecrets) {
  const current = configuredValue(key);
  if (force || unsafe(current)) {
    setValue(key, randomBytes(32).toString("base64url"));
    changed.push(key);
  }
}

for (const key of optionalSecrets) {
  const current = configuredValue(key);
  if (current && (force || unsafe(current))) {
    setValue(key, randomBytes(32).toString("base64url"));
    changed.push(key);
  }
}

await writeFile(target, contents, { encoding: "utf8", mode: 0o600 });
console.log(
  changed.length
    ? `Generated safe local values for: ${changed.join(", ")}. No secret values were printed.`
    : "Local secret values already meet the minimum requirements; nothing changed.",
);
