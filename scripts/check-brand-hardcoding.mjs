import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const allowed = new Set([
  "apps/web/lib/brand-profile.ts", "apps/web/lib/brand-profile.test.ts", "apps/web/components/platform-logo.test.tsx",
  "apps/web/app/site-admin/manifest.webmanifest/route.test.ts", "apps/web/lib/legal-documents.ts",
  "apps/web/lib/conversion-landing-copy.ts", "apps/web/lib/domain-setup-copy.ts", "scripts/stripe-clock-acceptance.mjs", "scripts/brand-profile-check.mjs", "scripts/check-brand-hardcoding.mjs",
]);
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll("\\", "/");
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const brandPattern = /BusinessSite RC|BusinessSite|Website RemoteControl|businesssite\.control|InfoEsencë/;
const leaks = ["apps/web", "packages", "scripts"]
  .flatMap(sourceFiles)
  .filter((file) => /\.(?:ts|tsx|mjs)$/.test(file))
  .filter((file) => brandPattern.test(readFileSync(file, "utf8")))
  .filter((file) => !allowed.has(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
if (leaks.length) {
  console.error(`Unapproved runtime brand hardcoding: ${leaks.join(", ")}`);
  process.exit(1);
}
// Keep the allowlist intentional: every exception needs an explicit category.
for (const file of allowed) if (!readFileSync(file, "utf8").trim()) throw new Error(`Empty hardcoding allowlist entry: ${file}`);
console.log("Scoped brand hardcoding check passed.");
