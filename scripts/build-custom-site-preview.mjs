// Private local pilot assembly. No customer source files belong in Git.
// Usage: node scripts/build-custom-site-preview.mjs INPUT_JSON OUTPUT_DIRECTORY
// INPUT_JSON: { profile, content, publicLegal?, design, media, document?, priceList? }.
// The caller copies selected web media under OUTPUT_DIRECTORY/media.
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
const input = resolve(process.argv[2]), out = resolve(process.argv[3]);
const root = resolve(import.meta.dirname, "..");
const ownerFixture = process.argv[4] === "--owner-editor";
const componentImport = ownerFixture ? `import '${root.replaceAll("\\", "/")}/apps/web/app/styles.css'; import {OwnerCustomDesignEditor} from '${root.replaceAll("\\", "/")}/apps/web/components/owner-custom-design-editor';` : `import {CustomSite} from '${root.replaceAll("\\", "/")}/apps/web/components/custom-site';`;
const markup = ownerFixture ? `<OwnerCustomDesignEditor snapshot={{document:site,domain:{customDomain:null,status:'not-configured',verification:null},publicationIntent:'private',visibility:'private'}}/>` : `<CustomSite site={site} design={site.customDesign!} media={site.customMedia!} privacyHref='#legal'/>`;
if (!input || !out || !out.includes(".custom-site-private")) throw new Error("Use a private ignored output directory.");
mkdirSync(out, { recursive: true });
const entry = resolve(out, "assemble.tsx");
writeFileSync(entry, `import React from 'react';
import {renderToString} from 'react-dom/server';
import {generateSiteDocument,applyCustomDesign,exportCustomPreset} from '${root.replaceAll("\\", "/")}/packages/website-engine/src/index';
${componentImport}
import {writeFileSync} from 'node:fs';
import input from ${JSON.stringify(input.replaceAll("\\", "/"))};
const baseline=input.document ?? generateSiteDocument(input.profile); baseline.content={...baseline.content,...input.content}; baseline.publicLegal=input.publicLegal;
if(input.priceList !== undefined) baseline.priceList=input.priceList;
const site=applyCustomDesign(baseline,input.design,input.media);
const out=${JSON.stringify(out.replaceAll("\\", "/"))};
writeFileSync(out+'/baseline-document.json',JSON.stringify(baseline,null,2));
writeFileSync(out+'/site-document.json',JSON.stringify(site,null,2));
writeFileSync(out+'/reusable-preset.json',JSON.stringify(exportCustomPreset(site.customDesign),null,2));
writeFileSync(out+'/snapshot.json',JSON.stringify({capturedAt:new Date().toISOString(),existingSite:false,document:baseline,domain:{customDomain:null,status:'not-configured',verification:null}},null,2));
const html=renderToString(${markup});
writeFileSync(out+'/index.html','<!doctype html><html lang="'+site.locale+'"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>'+site.content.name.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</title><link rel="stylesheet" href="/client.css"/><style>body{margin:0;background:#111110}</style></head><body><div id="root">'+html+'</div><script type="module" src="/client.js"></script></body></html>');
`);
await build({ entryPoints: [entry], outfile: resolve(out, "assemble.cjs"), bundle: true, platform: "node", format: "cjs", loader: { ".module.css": "local-css" }, jsx: "automatic" });
const { spawnSync } = await import("node:child_process");
const result = spawnSync(process.execPath, [resolve(out, "assemble.cjs")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) throw new Error("Assembly failed.");
const client = resolve(out, "client.tsx");
writeFileSync(client, `import React from 'react'; import {hydrateRoot} from 'react-dom/client'; ${componentImport} import data from './site-document.json'; const site=data as any; hydrateRoot(document.getElementById('root')!,${markup});`);
await build({ entryPoints: [client], outfile: resolve(out, "client.js"), bundle: true, platform: "browser", format: "esm", loader: { ".module.css": "local-css" }, jsx: "automatic", define: { "process.env": '{"NODE_ENV":"production"}' }, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false });
console.log("Private SSR/hydrated preview, snapshot and content-free preset assembled:", out);
