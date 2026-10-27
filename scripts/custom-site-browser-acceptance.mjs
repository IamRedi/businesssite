// Local-only hydrated custom-renderer audit, screenshots and interaction evidence.
// node scripts/custom-site-browser-acceptance.mjs http://127.0.0.1:4178 PRIVATE_OUT
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const url = new URL(process.argv[2]), out = resolve(process.argv[3]);
if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !out.includes("p5-002-private")) throw new Error("Only the explicit private loopback preview is permitted.");
mkdirSync(out, { recursive: true });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", "--no-first-run", "--disable-gpu", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "custom-site-audit-")), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let ws;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { environment: "loopback Chromium; no hosted performance claim", viewports: {}, errors: [] };
try {
  const endpoint = await new Promise((r, reject) => { let text = ""; const timer = setTimeout(() => reject(new Error("Chrome endpoint timeout")), 15000); chrome.stderr.on("data", chunk => { text += chunk; const m = text.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); r(m[1]); } }); });
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(); let requests = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p?.reject(new Error(m.error.message)); else p?.resolve(m.result); } else if (m.method === "Runtime.exceptionThrown") report.errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); else if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async expression => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__perf={lcp:0,cls:0};new PerformanceObserver(list=>{for(const e of list.getEntries())window.__perf.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__perf.cls+=e.value}).observe({type:'layout-shift',buffered:true});` });
  if (process.argv[4] === "--decorative") {
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await send('Page.navigate',{url:url.href});await sleep(1200);
    await evaluate(`document.querySelector('video').scrollIntoView({block:'center'});`);await sleep(400);
    const reduced=await evaluate(`(()=>{const v=document.querySelector('video');return v.paused&&v.querySelectorAll('source').length===0;})()`);assert(reduced);
    await evaluate(`document.querySelector('#video figure button').click();`);await sleep(900);
    const explicitPlay=await evaluate(`!document.querySelector('video').paused`);assert(explicitPlay);
    await evaluate(`scrollTo(0,0);`);await sleep(200);assert(await evaluate(`document.querySelector('video').paused`));
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await send('Page.navigate',{url:url.href});await sleep(1000);
    await evaluate(`document.querySelector('video').scrollIntoView({block:'center'});`);await sleep(1000);
    const autoplay=await evaluate(`(()=>{const v=document.querySelector('video');return !v.paused&&v.muted&&v.loop&&v.playsInline;})()`);assert(autoplay);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(200);
    const motionChangePauses=await evaluate(`document.querySelector('video').paused`);assert(motionChangePauses);
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true});`});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await send('Page.navigate',{url:url.href});await sleep(1000);
    await evaluate(`document.querySelector('video').scrollIntoView({block:'center'});`);await sleep(400);
    const saveData=await evaluate(`(()=>{const v=document.querySelector('video');return v.paused&&v.querySelectorAll('source').length===0;})()`);assert(saveData);
    report.decorative={reduced,explicitPlay,autoplay,motionChangePauses,saveData};console.log('Decorative muted autoplay, reduced motion, explicit playback and save-data PASS');
  } else if (process.argv[4] === "--owner-editor") {
    const managedFixture = process.argv[5] === "--managed-media-fixture";
    if (managedFixture) await send('Page.addScriptToEvaluateOnNewDocument', {source:`window.__managedUploads=0;const realFetch=window.fetch;window.fetch=async(input,options)=>{if(typeof input==='string'&&input.startsWith('/api/owner/sites/')&&input.endsWith('/custom-media')){window.__managedUploads++;const file=options.body.get('file');return new Response(JSON.stringify({assetId:'synthetic',url:'https://examplestore0001.public.blob.vercel-storage.com/synthetic/'+window.__managedUploads+(file.type==='video/mp4'?'.mp4':'.webp'),mimeType:file.type,bytes:file.size,width:16,height:16,durationSeconds:file.type==='video/mp4'?2:undefined}),{status:201,headers:{'Content-Type':'application/json'}});}return realFetch(input,options);};`});
    await send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send("Page.navigate", {url:url.href}); await sleep(1500);
    const publishDisabled=await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent==='Publish custom design')).disabled`); assert(publishDisabled);
    await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent==='Preview design')).click()`); await sleep(800);
    const desktop=await evaluate(`(()=>{const f=document.querySelector('iframe');return {status:document.querySelector('[role=status]').textContent,width:f?.contentWindow.innerWidth,content:!!f?.contentDocument.querySelector('[data-custom-design]'),publishEnabled:!([...document.querySelectorAll('button')].find(b=>b.textContent==='Publish custom design')).disabled};})()`);
    assert(desktop.content && desktop.width===1280 && desktop.publishEnabled,JSON.stringify({desktop,errors:report.errors}));
    await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent==='Mobile 390')).click()`); await sleep(400);
    const mobile=await evaluate(`(()=>{const f=document.querySelector('iframe'),d=f.contentDocument;return {width:f.contentWindow.innerWidth,overflow:d.documentElement.scrollWidth>390,heroFont:f.contentWindow.getComputedStyle(d.querySelector('h1')).fontSize};})()`);
    assert.equal(mobile.width,390); assert.equal(mobile.heroFont,'56px'); assert(!mobile.overflow);
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(join(out,'owner-preview.png'),Buffer.from(screenshot.data,'base64'));
    await evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'{}');t.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(200);
    const invalidated=await evaluate(`!document.querySelector('iframe') && ([...document.querySelectorAll('button')].find(b=>b.textContent==='Publish custom design')).disabled`); assert(invalidated);
    report.ownerEditor={publishDisabled,desktop,mobile,invalidated};console.log('Owner preview/viewport/invalidation PASS; no publish request made');
    if (managedFixture) {
      // Restore valid advanced design after the preview-invalidation test.
      await send('Page.navigate',{url:url.href});await sleep(800);
      const before = await evaluate(`JSON.parse(document.querySelectorAll('textarea')[1].value)`);
      async function selection(role,label) {
        await evaluate(`(()=>{const s=document.querySelector('fieldset select');s.value=${JSON.stringify(role)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(80);
        await evaluate(`(()=>{const i=document.querySelector('fieldset input:not([type=file])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(label)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(80);
      }
      async function attach(filename) {
        const root=(await send('DOM.getDocument')).root.nodeId;
        const node=(await send('DOM.querySelector',{nodeId:root,selector:'fieldset input[type=file]'})).nodeId;
        await send('DOM.setFileInputFiles',{nodeId:node,files:[resolve('.custom-site-private',filename)]});await sleep(300);
      }
      await selection('gallery','Synthetic gallery');await attach('business-media-synthetic.webp');
      await selection('video-poster','Synthetic poster');await attach('business-media-synthetic.webp');
      await selection('video','v'.repeat(161));
      assert.equal(await evaluate(`document.querySelector('fieldset input:not([type=file])').maxLength`),160);
      await attach('synthetic-media.mp4');
      assert.equal(await evaluate('window.__managedUploads'),2);
      assert(await evaluate(`document.querySelector('fieldset [role=status]').textContent.includes('160')`));
      await selection('video','Synthetic clip');await attach('synthetic-media.mp4');
      const after=await evaluate(`JSON.parse(document.querySelectorAll('textarea')[1].value)`);
      assert.equal(after.images.length,before.images.length+2);assert.equal(after.videos.length,before.videos.length+1);
      assert.equal(after.videos.at(-1).title,'Synthetic clip');assert.equal(after.videos.at(-1).durationSeconds,2);
      assert(after.images.some(i=>i.id===after.videos.at(-1).posterId&&i.role==='video-poster'));
      assert.equal(await evaluate('window.__managedUploads'),3);
      assert(await evaluate(`!document.querySelector('iframe') && [...document.querySelectorAll('button')].find(b=>b.textContent==='Publish custom design').disabled`));
      report.ownerManagedMedia={result:'PASS',transport:'mocked loopback fixture; NOT hosted storage proof',webpAdded:2,mp4Added:1,posterBound:true,titleRejectedBeforeRequest:true,previewInvalidated:true};
      console.log('Owner managed-media UI fixture PASS; supported file-input attachment, poster binding, title prevalidation and preview invalidation.');
    }
  } else for (const width of [1280, 390]) {
    requests = [];
    await send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width === 390, maxTouchPoints: 1 });
    await send("Page.navigate", { url: url.href }); await sleep(1800);
    const initial = await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,perf:{...window.__perf},heroLoaded:document.querySelector('#hero img').naturalWidth>0,videos:[...document.querySelectorAll('video')].map(v=>({preload:v.preload,muted:v.muted,playsInline:v.playsInline,paused:v.paused,sourceCount:v.querySelectorAll('source').length})),externalFrames:document.querySelectorAll('iframe').length})`);
    initial.videoRequests = requests.filter(u => /\.(mp4|webm)(\?|$)/.test(u)).length;
    assert(!initial.overflow && initial.width === width && initial.heroLoaded);
    assert(initial.videoRequests === 0 && initial.externalFrames === 0);
    assert(initial.videos.every(v => v.preload === "none" && v.muted && v.playsInline && v.paused && v.sourceCount === 0));
    await evaluate(`document.querySelector('#gallery').scrollIntoView({block:'start'});`); await sleep(350);
    await evaluate(`document.querySelector('#gallery [role=region]').focus();`);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" }); await sleep(650);
    const keyboard = await evaluate(`document.querySelector('#gallery [role=region]').scrollLeft>0`); assert(keyboard);
    await evaluate(`document.querySelector('#gallery button[aria-label="Nächstes Bild"]').click();`); await sleep(650);
    const arrow = await evaluate(`document.querySelector('#gallery [role=region]').scrollLeft`); assert(arrow > 0);
    let swipe = null;
    if (width === 390) {
      const point = await evaluate(`(()=>{const r=document.querySelector('#gallery [role=region]');r.scrollLeft=0;r.scrollIntoView({block:'center'});const b=r.getBoundingClientRect();return {x:Math.min(340,b.right-15),y:Math.max(80,b.top+100)};})()`); await sleep(200);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      for (let n = 1; n <= 7; n++) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x - n * 32, y: point.y }] }); await sleep(40); }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(650);
      swipe = await evaluate(`document.querySelector('#gallery [role=region]').scrollLeft>0`); assert(swipe);
    }
    await evaluate(`document.querySelector('#gallery [role=region]').scrollLeft=0;document.querySelector('#gallery [role=region] button').click();`); await sleep(100);
    const lightbox = await evaluate(`document.querySelector('#gallery dialog').open`); assert(lightbox);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }); await sleep(100);
    const focusReturned = await evaluate(`!document.querySelector('#gallery dialog').open && document.activeElement===document.querySelector('#gallery [role=region] button')`); assert(focusReturned);
    await evaluate(`document.querySelectorAll('#gallery [aria-pressed]')[1].click();`); await sleep(150);
    const filtered = await evaluate(`document.querySelectorAll('#gallery [role=region] figure').length`); assert(filtered < 6 && filtered > 0);
    await evaluate(`document.querySelectorAll('#gallery [aria-pressed]')[0].click();document.querySelector('#video video').scrollIntoView({block:'center'});`); await sleep(400);
    await evaluate(`document.querySelector('#video figure button').click();`); await sleep(1000);
    const plays = await evaluate(`(()=>{const v=document.querySelector('video');return !v.paused && v.currentTime>0;})()`); assert(plays);
    await evaluate(`scrollTo(0,0);`); await sleep(300);
    const offscreenPaused = await evaluate(`document.querySelector('video').paused`); assert(offscreenPaused);
    // Load all lazy visible-page images before a full-page evidence capture.
    await evaluate(`(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,100));}const rail=document.querySelector('#gallery [role=region]');rail.scrollLeft=rail.scrollWidth;await new Promise(r=>setTimeout(r,300));await Promise.all([...document.images].filter(i=>!i.closest('dialog')).map(i=>i.decode().catch(()=>{})));rail.scrollLeft=0;scrollTo(0,0);})()`); await sleep(250);
    const final = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,cls:window.__perf.cls,images:[...document.images].filter(i=>!i.closest('dialog')).map(i=>({loaded:i.naturalWidth>0,width:i.width,height:i.height})),videos:[...document.querySelectorAll('video')].map(v=>v.paused)})`);
    assert(!final.overflow && final.cls < .1 && final.images.every(i => i.loaded && i.width > 0 && i.height > 0));
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); writeFileSync(join(out, `desktop-mobile-${width}.png`), Buffer.from(screenshot.data, "base64"));
    report.viewports[width] = { initial, keyboard, arrow, swipe, lightbox, focusReturned, filtered, plays, offscreenPaused, final };
    console.log(`${width}: interactions PASS; LCP ${Math.round(initial.perf.lcp)}ms; CLS ${final.cls}; no overflow`);
  }
  assert.equal(report.errors.length, 0); report.result = "PASS";
} finally { writeFileSync(join(out, process.argv[4]==="--owner-editor"?"owner-browser-acceptance.json":process.argv[4]==="--decorative"?"decorative-browser-acceptance.json":"browser-acceptance.json"), JSON.stringify(report, null, 2)); ws?.close(); chrome.kill(); }
