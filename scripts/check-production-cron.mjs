import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../apps/web/vercel.json", import.meta.url), "utf8"),
);

assert.ok(Array.isArray(config.crons), "vercel.json must define crons");

const schedulerEntries = config.crons.filter(
  (entry) => entry.path === "/api/internal/privacy-scheduler",
);

assert.equal(
  schedulerEntries.length,
  1,
  "Production privacy scheduler must have exactly one Vercel Cron entry",
);
assert.equal(
  schedulerEntries[0].schedule,
  "15 3 * * *",
  "Production privacy scheduler must run daily within the Vercel Hobby limit",
);
assert.ok(
  config.crons.some(
    (entry) =>
      entry.path === "/api/internal/cleanup-expired-demos" &&
      entry.schedule === "0 3 * * *",
  ),
  "Existing expired-demo cleanup cron must remain configured",
);

console.log("Production Vercel Cron contract passed.");
