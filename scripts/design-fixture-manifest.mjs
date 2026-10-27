// Builds the design-fixture evidence manifest (BSRC-DESIGN-FOUNDATION-001):
// per-capture dimensions + SHA256 + pixel-diff result, as JSON and CSV.
// Usage: node scripts/design-fixture-manifest.mjs <screenshotsDir> <diffJson> <outJson> <outCsv>
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const screenshotsDir = process.argv[2];
const diffJson = process.argv[3];
const outJson = process.argv[4];
const outCsv = process.argv[5];
if (!screenshotsDir || !diffJson || !outJson || !outCsv) {
  console.error("usage: design-fixture-manifest.mjs <screenshotsDir> <diffJson> <outJson> <outCsv>");
  process.exit(2);
}

const diff = existsSync(diffJson) ? JSON.parse(readFileSync(diffJson, "utf8")) : {};
const rows = [];
for (const side of ["before", "after"]) {
  const dir = join(screenshotsDir, side);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".png")).sort()) {
    const buffer = readFileSync(join(dir, file));
    const name = file.replace(/\.png$/, "");
    rows.push({
      capture: name,
      side,
      fixture: name.split("@")[0],
      viewport: name.split("@")[1] ?? "",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      differingPixels: diff[name]?.diffPixels ?? null,
      maxChannelDelta: diff[name]?.maxDelta ?? null,
    });
  }
}
writeFileSync(outJson, JSON.stringify({ generatedAt: new Date().toISOString(), captures: rows }, null, 2));
const header = "capture,side,fixture,viewport,width,height,bytes,sha256,differingPixels,maxChannelDelta";
const csv = [header, ...rows.map((row) =>
  [row.capture, row.side, row.fixture, row.viewport, row.width, row.height, row.bytes, row.sha256, row.differingPixels ?? "", row.maxChannelDelta ?? ""].join(",")
)].join("\n") + "\n";
writeFileSync(outCsv, csv);
console.log(`manifest: ${rows.length} captures`);
