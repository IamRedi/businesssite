// Headless-Chrome CDP capture for design-fixture screenshots
// (BSRC-DESIGN-FOUNDATION-001). Uses Page.captureScreenshot with
// captureBeyondViewport for true full-page pixels; media queries evaluate at
// the emulated viewport width.
// Usage: node scripts/design-fixture-capture.mjs <outDir> <side> [baseURL]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const VIEWPORTS = [
  { n: "1440", w: 1440, h: 900 },
  { n: "1280", w: 1280, h: 800 },
  { n: "768", w: 768, h: 1024 },
  { n: "390", w: 390, h: 844 },
];
// Full 4-viewport matrix for the layout fixtures; scenario/locale fixtures
// capture at desktop 1440 and mobile 390 (matrix documented in the evidence
// record).
const WIDE = new Set([
  "clarity-base-en", "studio-base-en", "forge-base-en", "gold-base-en", "forge-photos-en",
  "industrial-base-en", "editorial-base-en", "local-base-en",
]);
const NARROW = new Set([
  "clarity-base-de", "clarity-base-sq", "clarity-long-en", "clarity-long-de",
  "clarity-long-sq", "clarity-services6-en", "clarity-nophotos-en",
  "clarity-nolegal-en", "gold-base-de",
  "industrial-few-photos-en", "industrial-no-photos-en", "industrial-services6-en", "industrial-services2-en",
  "industrial-long-en", "industrial-base-sq", "industrial-base-de", "industrial-base-it",
  "industrial-logo-square-en", "industrial-logo-landscape-en", "industrial-few-services-sq",
  "editorial-few-photos-en", "editorial-no-photos-en", "editorial-services6-en", "editorial-services2-en",
  "editorial-long-en", "editorial-base-sq", "editorial-base-de", "editorial-base-it",
  "editorial-logo-square-en", "editorial-logo-landscape-en", "editorial-few-services-sq",
  "local-few-photos-en", "local-no-photos-en", "local-services6-en", "local-services2-en",
  "local-long-en", "local-base-sq", "local-base-de", "local-base-it",
  "local-logo-square-en", "local-logo-landscape-en", "local-few-services-sq",
]);

const outDir = process.argv[2];
const side = process.argv[3];
const baseUrl = process.argv[4] ?? "http://127.0.0.1:4173";
if (!outDir || !side) {
  console.error("usage: design-fixture-capture.mjs <outDir> <side> [baseURL]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error("No Chrome/Edge executable found");

// Fixtures are the HTML files present in the served /f/ directory; the caller
// passes a manifest file listing fixture ids so the matrix stays explicit.
const manifest = readFileSync(process.argv[5] ?? join(outDir, "..", "fixtures.manifest.txt"), "utf8")
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--force-device-scale-factor=1",
  "--hide-scrollbars",
  "--no-first-run",
  "--remote-debugging-port=0",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((resolvePromise, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("Chrome did not expose a DevTools endpoint")), 20000);
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) { clearTimeout(timer); resolvePromise(match[1]); }
  });
  chrome.on("exit", () => reject(new Error(`Chrome exited early: ${buffer}`)));
});

const browserOrigin = wsUrl.match(/^ws:\/\/([^/]+)/)?.[1];
const targetsResponse = await fetch(`http://${browserOrigin}/json/list`);
const targets = await targetsResponse.json();
const page = targets.find((target) => target.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolvePromise, reject) => {
  ws.onopen = resolvePromise;
  ws.onerror = (event) => reject(new Error(`WebSocket error: ${event.message ?? "unknown"}`));
});

let nextId = 1;
const pending = new Map();
const loadWaiters = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data.toString());
  if (message.id && pending.has(message.id)) {
    const { resolvePromise, rejectPromise } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectPromise(new Error(`${message.error.message ?? "CDP error"}`));
    else resolvePromise(message.result);
    return;
  }
  if (message.method === "Page.loadEventFired") {
    while (loadWaiters.length) loadWaiters.shift()();
  }
};
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolvePromise, rejectPromise });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function waitForLoad(timeoutMs = 8000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("load timeout")), timeoutMs);
    loadWaiters.push(() => { clearTimeout(timer); resolvePromise(); });
  });
}

await send("Page.enable");

const heights = {};
for (const fixture of manifest) {
  for (const viewport of VIEWPORTS) {
    if (!WIDE.has(fixture) && viewport.n !== "1440" && viewport.n !== "390") continue;
    await send("Emulation.setDeviceMetricsOverride", {
      width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: viewport.n === "390",
    });
    const loadPromise = waitForLoad();
    await send("Page.navigate", { url: `${baseUrl}/f/${fixture}.html` });
    await loadPromise;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 600));
    const metrics = await send("Runtime.evaluate", {
      expression: "JSON.stringify({h: document.documentElement.scrollHeight, mains: document.querySelectorAll('main.generated-site').length})",
      returnByValue: true,
    });
    const parsed = JSON.parse(metrics.result.value);
    if (parsed.mains !== 1) throw new Error(`${fixture}: expected exactly one generated-site main, got ${parsed.mains}`);
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const file = join(outDir, `${fixture}@${viewport.n}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    heights[`${fixture}@${viewport.n}`] = parsed.h;
    console.log(`captured ${side}/${fixture}@${viewport.n} (${parsed.h}px)`);
  }
}
writeFileSync(join(outDir, "heights.json"), JSON.stringify(heights, null, 2));
ws.close();
chrome.kill();
console.log(`DONE ${side}: ${Object.keys(heights).length} captures`);
