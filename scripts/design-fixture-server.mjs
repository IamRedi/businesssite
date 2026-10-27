// Static server for design-fixture screenshots (BSRC-DESIGN-FOUNDATION-001).
// Serves fixture HTML under /f/, an optional evidence screenshots dir under
// /e/, and the web app's public assets under / so stock template images
// resolve exactly as they do in the real app.
// Usage: node scripts/design-fixture-server.mjs <fixturesDir> [evidenceDir|-] [port]
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = resolve(process.argv[2] ?? "apps/web/.design-fixtures");
const evidenceArg = process.argv[3];
const evidenceDir = evidenceArg && evidenceArg !== "-" ? resolve(evidenceArg) : null;
const externalEvidenceDir = process.env.DESIGN_FIXTURE_EXTERNAL_DIR ? resolve(process.env.DESIGN_FIXTURE_EXTERNAL_DIR) : null;
const p3EvidenceDir = process.env.DESIGN_FIXTURE_P3_DIR ? resolve(process.env.DESIGN_FIXTURE_P3_DIR) : null;
const p3bEvidenceDir = process.env.DESIGN_FIXTURE_P3B_DIR ? resolve(process.env.DESIGN_FIXTURE_P3B_DIR) : null;
const port = Number(process.argv[4] ?? 4173);
const publicDir = resolve(fileURLToPath(new URL("../apps/web/public", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const path = normalize(decodeURIComponent(url.pathname)).replaceAll("\\", "/");
  let filePath = null;
  let root = null;
  if (path.startsWith("/f/")) {
    root = fixturesDir;
    filePath = join(fixturesDir, path.slice(3));
  } else if (evidenceDir && path.startsWith("/e/")) {
    root = evidenceDir;
    filePath = join(evidenceDir, path.slice(3));
  } else if (externalEvidenceDir && path.startsWith("/x/")) {
    root = externalEvidenceDir;
    filePath = join(externalEvidenceDir, path.slice(3));
  } else if (p3EvidenceDir && path.startsWith("/p/")) {
    root = p3EvidenceDir;
    filePath = join(p3EvidenceDir, path.slice(3));
  } else if (p3bEvidenceDir && path.startsWith("/p3b/")) {
    root = p3bEvidenceDir;
    filePath = join(p3bEvidenceDir, path.slice(5));
  } else {
    root = publicDir;
    filePath = join(publicDir, path.replace(/^\//, ""));
    if (!existsSync(filePath) && path === "/") filePath = join(fixturesDir, "index.html");
  }
  const resolved = resolve(filePath);
  const allowed = resolved.startsWith(root);
  if (!allowed || !existsSync(resolved) || !statSync(resolved).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(resolved)] ?? "application/octet-stream" });
  createReadStream(resolved).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`design-fixture-server on http://127.0.0.1:${port}/f/<fixture>.html`);
});
