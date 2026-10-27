// Pixel-diff before/after fixture captures through headless Chrome
// (BSRC-DESIGN-FOUNDATION-001). Writes a JSON + Markdown report.
// Usage: node scripts/design-fixture-diff.mjs <beforeDir> <afterDir> <reportJson> <reportMd>
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const beforeDir = process.argv[2];
const afterDir = process.argv[3];
const reportJson = process.argv[4];
const reportMd = process.argv[5];
if (!beforeDir || !afterDir || !reportJson || !reportMd) {
  console.error("usage: design-fixture-diff.mjs <beforeDir> <afterDir> <reportJson> <reportMd>");
  process.exit(2);
}
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

const heights = JSON.parse(readFileSync(join(beforeDir, "heights.json"), "utf8"));
const afterHeights = JSON.parse(readFileSync(join(afterDir, "heights.json"), "utf8"));
const names = [...new Set([...Object.keys(heights), ...Object.keys(afterHeights)])].sort();

const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--force-device-scale-factor=1",
  "--no-first-run", "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolvePromise, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("Chrome did not expose a DevTools endpoint")), 20000);
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) { clearTimeout(timer); resolvePromise(match[1]); }
  });
});
const browserOrigin = wsUrl.match(/^ws:\/\/([^/]+)/)?.[1];
const targets = await (await fetch(`http://${browserOrigin}/json/list`)).json();
const pageTarget = targets.find((target) => target.type === "page");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolvePromise, reject) => {
  ws.onopen = resolvePromise;
  ws.onerror = () => reject(new Error("WebSocket error"));
});
let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data.toString());
  if (message.id && pending.has(message.id)) {
    const { resolvePromise, rejectPromise } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? rejectPromise(new Error(message.error.message ?? "CDP error")) : resolvePromise(message.result);
  }
};
const send = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
  const id = nextId++;
  pending.set(id, { resolvePromise, rejectPromise });
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Page.enable");

// The diff page resolves /e/before and /e/after on the fixture server origin.
const serverPort = Number(process.env.DESIGN_FIXTURE_SERVER_PORT ?? 4173);
const beforeName = beforeDir.split(/[\\/]/).pop();
const afterName = afterDir.split(/[\\/]/).pop();
const beforePrefix = process.env.DESIGN_FIXTURE_BEFORE_PREFIX ?? "/e/";
const afterPrefix = process.env.DESIGN_FIXTURE_AFTER_PREFIX ?? "/e/";
const url = `http://127.0.0.1:${serverPort}/f/_preview/diff.html?names=${names.join(",")}&beforeDir=${beforeName}&afterDir=${afterName}&beforePrefix=${encodeURIComponent(beforePrefix)}&afterPrefix=${encodeURIComponent(afterPrefix)}`;
console.log(`navigating (${url.length} chars): ${url.slice(0, 260)}`);
writeFileSync("scripts/.p3-diff-url-script.txt", url);
await send("Page.navigate", { url });
await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
let results = null;
for (let attempt = 0; attempt < 60; attempt++) {
  const state = await send("Runtime.evaluate", { expression: "window.__diffDone === true", returnByValue: true });
  if (state.result.value === true) {
    results = await send("Runtime.evaluate", { expression: "window.__diffResults", returnByValue: true });
    break;
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
}
if (!results) throw new Error("Diff page did not finish");
const diff = results.result.value;

let failures = 0;
let zeroDiff = 0;
const lines = ["# Design fixture pixel diff — before vs after", "", "| Capture | before px | after px | differing pixels | max channel delta |", "| --- | --- | --- | --- | --- |"];
for (const name of names) {
  const entry = diff[name];
  if (!entry?.ok) { failures++; lines.push(`| ${name} | — | — | ERROR ${entry?.error ?? "missing"} | — |`); continue; }
  const sizeStable = entry.beforeWidth === entry.afterWidth && entry.beforeHeight === entry.afterHeight;
  if (entry.diffPixels === 0 && sizeStable) zeroDiff++;
  else failures++;
  lines.push(`| ${name} | ${entry.beforeWidth}x${entry.beforeHeight} | ${entry.afterWidth}x${entry.afterHeight} | ${entry.diffPixels} | ${entry.maxDelta} |`);
}
writeFileSync(reportJson, JSON.stringify(diff, null, 2));
writeFileSync(reportMd, lines.join("\n") + `\n\nResult: ${zeroDiff}/${names.length} identical (0 differing pixels at tolerance 2); ${failures} not identical.\n`);
console.log(`DIFF: ${zeroDiff}/${names.length} identical, ${failures} differing/errored`);
ws.close();
chrome.kill();
process.exit(failures === 0 ? 0 : 1);
