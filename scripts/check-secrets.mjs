import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const rules = [
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g], ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ["Stripe secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g], ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{16,}\b/g],
  ["Google API key", /\bAIza[\w-]{20,}\b/g], ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const findings = [];
for (const file of files) {
  if (file === ".env.example" || file.endsWith(".md")) continue;
  let content; try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const [name, pattern] of rules) { if (pattern.test(content)) findings.push(`${file}: ${name}`); pattern.lastIndex = 0; }
}
if (findings.length) { console.error("Potential committed secrets detected:\n" + findings.join("\n")); process.exit(1); }
console.log(`Secret scan passed (${files.length} tracked files scanned; examples and Markdown excluded).`);
