import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const files = ["packages", "apps", "scripts"]
  .flatMap(sourceFiles)
  .filter((file) => /\.(?:ts|tsx|mjs|sql)$/.test(file));
const violations = [];
for (const file of files) {
  if (file.endsWith("rls-pilot-test.mjs") || file.endsWith("rls-pilot.integration.test.ts")) continue;
  const source = readFileSync(file, "utf8");
  if (/\bset\s+(?:local\s+)?app\.[a-z_]+/i.test(source) || /set_config\s*\([^,]+,[^,]+,\s*false\s*\)/i.test(source))
    violations.push(file);
}
if (violations.length) {
  console.error(`Session-level app context is forbidden: ${violations.join(", ")}`);
  process.exit(1);
}
console.log("RLS context boundary passed: no plain session-level SET app.* usage.");
