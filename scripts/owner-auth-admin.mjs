import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { migrationConnectionString } from "./database-role-config.mjs";

const scrypt = promisify(scryptCallback);
const command = process.argv[2];
const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? (process.argv[emailIndex + 1] ?? "").trim().toLowerCase() : "";

if (!new Set(["bootstrap", "recover"]).has(command) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Usage: owner-auth-admin.mjs <bootstrap|recover> --email owner@example.com");
if (process.argv.some((argument) => argument.startsWith("--password")))
  throw new Error("Passwords are accepted only through the hidden interactive prompt.");
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error("An interactive TTY is required; password piping is disabled.");

async function hiddenPrompt(label) {
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let value = "";
  try {
    return await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        for (const character of chunk) {
          if (character === "\u0003") { process.stdin.off("data", onData); reject(new Error("Cancelled.")); return; }
          if (character === "\r" || character === "\n") { process.stdin.off("data", onData); process.stdout.write("\n"); resolve(value); return; }
          if (character === "\u007f") { value = value.slice(0, -1); continue; }
          if (/^[\x20-\x7E]$/.test(character) && value.length < 200) value += character;
        }
      };
      process.stdin.on("data", onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

const password = await hiddenPrompt(command === "bootstrap" ? "Owner password: " : "New owner password: ");
const confirmation = await hiddenPrompt("Confirm password: ");
if (password !== confirmation || password.length < 16 || password.length > 200)
  throw new Error("Passwords must match and contain 16–200 characters.");
const salt = randomBytes(16).toString("hex");
const passwordHash = `${salt}:${Buffer.from(await scrypt(password, salt, 64)).toString("hex")}`;
const identityHash = createHash("sha256").update(email).digest("hex");
const pool = new pg.Pool({ connectionString: migrationConnectionString() });
const client = await pool.connect();
let transactionOpen = false;

try {
  await client.query("begin");
  transactionOpen = true;
  if (command === "bootstrap") {
    const created = await client.query("select owner_auth_bootstrap_first($1,$2,$3) as owner_id", [email,passwordHash,identityHash]);
    await client.query("commit");
    transactionOpen = false;
    if (!created.rows[0]?.owner_id) throw new Error("Bootstrap refused: an owner account already exists.");
    console.log("First owner created. Sign in to complete mandatory MFA enrollment.");
  } else {
    const recovered = await client.query("select owner_auth_administrative_recovery($1,$2,$3) as ok", [email,passwordHash,identityHash]);
    await client.query("commit");
    transactionOpen = false;
    if (!recovered.rows[0]?.ok) throw new Error("Administrative recovery refused; verify account state and last-owner protection.");
    console.log("Owner credentials recovered. All sessions were revoked; MFA re-enrollment is required.");
  }
} catch (error) {
  if (transactionOpen)
    await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
