import { readFileSync } from "node:fs";

const repository = readFileSync("packages/site-data/src/index.ts", "utf8");
const requiredMethods = [
  "getBusinessAdminDashboard",
  "updateDocumentForAuthenticatedSession",
  "saveMediaBlobForAuthenticatedSession",
];
const failures = [];
for (const method of requiredMethods) {
  const start = repository.indexOf(`async ${method}(`);
  const next = repository.indexOf("\n  async ", start + 1);
  if (start < 0 || next < 0) {
    failures.push(`${method}:missing`);
    continue;
  }
  const body = repository.slice(start, next);
  if (!body.includes("withAuthenticatedSiteAdmin(")) failures.push(`${method}:missing-auth-context`);
  if (body.includes("this.pool")) failures.push(`${method}:compatibility-pool-bypass`);
}

const editor = readFileSync("apps/web/app/site-admin/[slug]/page.tsx", "utf8");
if (!editor.includes("updateDocumentForAuthenticatedSession")) failures.push("editor:unscoped-update");
const media = readFileSync("apps/web/app/api/site-admin/media/route.ts", "utf8");
if (!media.includes("saveMediaBlobForAuthenticatedSession")) failures.push("media:unscoped-business-fallback");

if (failures.length) {
  console.error(`Scoped customer repository boundary failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Scoped customer repository boundary passed: trusted-session methods use only their provided contextual client.");
