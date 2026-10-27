import { spawn } from "node:child_process";
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => { let b = ""; const t = setTimeout(() => rej(new Error("no devtools")), 20000); chrome.stderr.on("data", c => { b += c; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } }); });
const origin = wsUrl.match(/^ws:\/\/([^/]+)/)[1];
const targets = await (await fetch("http://" + origin + "/json/list")).json();
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 1; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = id++; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
for (const name of process.argv.slice(2)) {
  await send("Page.navigate", { url: `http://127.0.0.1:4173/f/_preview/locate.html?name=${encodeURIComponent(name)}` });
  await new Promise(r => setTimeout(r, 2500));
  const probe = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__locate)", returnByValue: true });
  console.log(name, "=>", probe.result.value);
}
ws.close();
chrome.kill();
