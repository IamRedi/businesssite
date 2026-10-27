import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { syntheticMp4 } from "../apps/web/lib/owner-custom-media-fixtures";

// Real React reconciliation and Chromium media selection; synthetic assets only.
// Use the existing local Playwright installation, or an explicit test-tool path.
let browser: any, server: ReturnType<typeof createServer>, origin: string;
before(async () => {
  const modulePath = process.env.VIDEO_COMPONENT_PLAYWRIGHT_MODULE
    ?? readFileSync(".custom-site-private/playwright.txt", "utf8").trim();
  const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
  const bundle = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { flushSync } from "react-dom";
      import { VideoLoop } from "./apps/web/components/video-showcase";
      const root = createRoot(document.getElementById("root"));
      window.renderVideo = ({src = "/a.mp4", poster = "/a.svg", decorative = false, bytes = 100}) => {
        flushSync(() => root.render(<VideoLoop
          video={{id:"clip",title:"Synthetic clip",posterId:"poster",width:160,height:160,durationSeconds:2,sources:[{src,type:"video/mp4",bytes}]}}
          poster={{id:"poster",role:"video-poster",src:poster,alt:"Poster",width:160,height:160}}
          decorative={decorative} labels={{play:"Play",pause:"Pause"}} />));
        return document.querySelector("video source")?.getAttribute("src") ?? null;
      };
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    plugins: [{ name: "test-css", setup(builder) {
      builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "export default {}", loader: "js" }));
    } }],
  });
  server = createServer((request, response) => {
    if (request.url === "/component.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle.outputFiles[0].contents);
    } else if (request.url?.endsWith(".mp4")) {
      response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": syntheticMp4.length }); response.end(syntheticMp4);
    } else if (request.url?.endsWith(".svg")) {
      response.writeHead(200, { "Content-Type": "image/svg+xml" }); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"/>');
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end('<!doctype html><body style="margin:0"><div style="height:1400px"></div><div id="root"></div><script src="/component.js"></script>');
    }
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise<void>(done => server.close(() => done()));
});

async function fixture(options: { reducedMotion?: boolean; saveData?: boolean } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: options.reducedMotion ? "reduce" : "no-preference" });
  await context.addInitScript(({ saveData }: { saveData: boolean }) => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData } });
    (window as any).playCalls = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { (window as any).playCalls++; return play.call(this); };
  }, { saveData: Boolean(options.saveData) });
  const page = await context.newPage();
  await page.goto(origin); await page.waitForFunction(() => typeof (window as any).renderVideo === "function");
  const render = (props: object = {}) => page.evaluate((value: object) => (window as any).renderVideo(value), props);
  const show = async () => { await page.locator("video").scrollIntoViewIfNeeded(); };
  const selected = async (src: string) => page.waitForFunction((path: string) => document.querySelector("video")?.currentSrc.endsWith(path), src);
  return { context, page, render, show, selected };
}

test("initial A renders its poster and remains lazy until visible", async () => {
  const f = await fixture();
  try {
    assert.equal(await f.render(), null);
    assert.equal(await f.page.locator("video").getAttribute("poster"), "/a.svg");
    assert.equal(await f.page.locator("video").getAttribute("preload"), "none");
    assert.equal(await f.page.locator("source").count(), 0);
    await f.show(); await f.selected("/a.mp4");
    assert.equal(await f.page.evaluate(() => (window as any).playCalls), 0);
  } finally { await f.context.close(); }
});

test("replace A with B removes A from the current element and selected source", async () => {
  const f = await fixture();
  try {
    await f.render(); await f.show(); await f.selected("/a.mp4");
    await f.page.evaluate(() => { (window as any).oldVideo = document.querySelector("video"); });
    await f.render({ src: "/b.mp4" }); await f.selected("/b.mp4");
    assert.equal(await f.page.locator('source[src="/a.mp4"]').count(), 0);
    assert.equal(await f.page.evaluate(() => (window as any).oldVideo === document.querySelector("video")), false);
    assert.equal(await f.page.evaluate(() => (window as any).oldVideo.paused), true);
  } finally { await f.context.close(); }
});

test("poster replacement refreshes media; equivalent props preserve the current element", async () => {
  const f = await fixture();
  try {
    await f.render(); await f.show(); await f.selected("/a.mp4");
    await f.page.evaluate(() => { (window as any).oldVideo = document.querySelector("video"); });
    await f.render();
    assert.equal(await f.page.evaluate(() => (window as any).oldVideo === document.querySelector("video")), true);
    await f.render({ poster: "/b.svg" }); await f.selected("/a.mp4");
    assert.equal(await f.page.locator("video").getAttribute("poster"), "/b.svg");
    assert.equal(await f.page.evaluate(() => (window as any).oldVideo === document.querySelector("video")), false);
  } finally { await f.context.close(); }
});

test("decorative replacement resets manual pause and preserves offscreen pause", async () => {
  const f = await fixture();
  try {
    await f.render({ decorative: true }); await f.show();
    await f.page.waitForFunction(() => document.querySelector("video")?.paused === false);
    await f.page.getByRole("button", { name: "Pause", exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector("video")?.paused === true);
    await f.render({ src: "/b.mp4", decorative: true }); await f.selected("/b.mp4");
    await f.page.waitForFunction(() => document.querySelector("video")?.paused === false);
    await f.page.evaluate(() => window.scrollTo(0, 0));
    await f.page.waitForFunction(() => document.querySelector("video")?.paused === true);
    assert.equal(await f.render({ src: "/a.mp4", decorative: true }), null);
    assert.equal(await f.page.locator("source").count(), 0);
  } finally { await f.context.close(); }
});

test("reduced motion and save-data stay opt-in after source or poster replacement", async () => {
  for (const options of [{ reducedMotion: true }, { saveData: true }]) {
    const f = await fixture(options);
    try {
      await f.render({ decorative: true }); await f.show();
      await f.page.waitForTimeout(100); // Let the initial intersection notification run.
      assert.equal(await f.page.locator("source").count(), 0);
      assert.equal(await f.page.evaluate(() => (window as any).playCalls), 0);
      await f.page.getByRole("button", { name: "Play", exact: true }).click(); await f.selected("/a.mp4");
      await f.page.waitForFunction(() => document.querySelector("video")?.paused === false);
      await f.render({ src: "/b.mp4", poster: "/b.svg", decorative: true });
      await f.page.waitForTimeout(100);
      assert.equal(await f.page.locator("source").count(), 0);
      assert.equal(await f.page.locator("video").getAttribute("poster"), "/b.svg");
      await f.page.getByRole("button", { name: "Play", exact: true }).click(); await f.selected("/b.mp4");
    } finally { await f.context.close(); }
  }
});
