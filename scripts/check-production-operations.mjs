import { readFile } from "node:fs/promises";

const heartbeat = await readFile("apps/web/app/api/internal/monitoring/heartbeat/route.ts", "utf8");
const scheduler = await readFile("apps/web/lib/privacy-scheduler.ts", "utf8");
const monitoring = await readFile("apps/web/lib/operational-monitoring.ts", "utf8");

const required = [
  [heartbeat, "productionHeartbeatConfiguration"],
  [heartbeat, "Bearer ${secret}"],
  [scheduler, "PRIVACY_SCHEDULER_NOOP"],
  [scheduler, "Production privacy scheduler requires no-op mode."],
  [monitoring, "MONITORING_PRODUCTION_SYNTHETIC_PROBE_ENABLED"],
];
const missing = required.filter(([content, value]) => !content.includes(value));
if (missing.length) {
  for (const [, value] of missing) console.error(`Missing production operations contract: ${value}`);
  process.exit(1);
}
console.log("Production operations contract check passed.");
