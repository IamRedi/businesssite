import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [model, editor, engine, platform, ownerLayout] = await Promise.all([
  read("apps/web/lib/locale-model.ts"),
  read("apps/web/app/site-admin/[slug]/page.tsx"),
  read("packages/website-engine/src/i18n.ts"),
  read("apps/web/lib/platform-config.ts"),
  read("apps/web/app/owner/layout.tsx"),
]);
const ownerFiles = (await readdir(resolve(root, "apps/web/app/owner"), { recursive: true }))
  .filter((path) => path.endsWith(".tsx"));
const ownerSource = (await Promise.all(ownerFiles.map((path) => read(`apps/web/app/owner/${path}`)))).join("\n");

const failures = [];
const requireText = (source, pattern, message) => { if (!pattern.test(source)) failures.push(message); };
const forbidText = (source, pattern, message) => { if (pattern.test(source)) failures.push(message); };

requireText(model, /customerUiLocales\s*=\s*\["en",\s*"de"\]/, "Customer UI locale registry must remain EN/DE.");
requireText(model, /ownerPanelLocale\s*=\s*"en"/, "Owner panel must remain explicitly English-only.");
for (const locale of ["en", "de", "fr", "es", "it", "sq"])
  requireText(engine, new RegExp(`\\b${locale}:\\s*\\{`), `Generated website locale ${locale} is missing.`);
requireText(platform, /website:\s*\{[\s\S]*supportedLocales/, "Website locale configuration must remain separate from customer UI locales.");
requireText(ownerLayout, /supportedLocales=\{\[ownerPanelLocale\]\}/, "Owner layout must not expose a customer language selector.");
forbidText(ownerSource, /configuredPlatformLocale|platform_locale/, "Owner pages must use the fixed English owner locale, never the platform cookie.");
forbidText(editor, /lifecycle\.reason|lifecycle\.state\.replaceAll|<dt>\{appointment\.status\}/, "Customer editor exposes a raw lifecycle/status identifier.");
forbidText(editor, />Coming soon</, "Customer editor contains an unlocalized coming-soon label.");
forbidText(engine, /Termin buchen|jetzt buchen|Book now|Reserve now/i, "Appointment-request copy implies real booking.");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Translation boundary checks passed (customer EN/DE, owner EN, websites DE/EN/FR/ES/IT/SQ).");
