"use client";
import { useState } from "react";
import { applyCustomDesign, exportCustomPreset, importCustomPreset, premiumCustomDesign, type SiteDocument } from "@platform/website-engine";
import type { OwnerCustomSiteSnapshot } from "@platform/site-data";
import { SitePreview } from "./site-preview";
import { CustomDesignPreviewFrame } from "./custom-design-preview-frame";
import { OwnerCustomMediaUploader } from "./owner-custom-media-uploader";

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OwnerCustomDesignEditor({ snapshot }: { snapshot: OwnerCustomSiteSnapshot }) {
  const [current, setCurrent] = useState(snapshot.document), [preview, setPreview] = useState<SiteDocument | null>(null);
  const [design, setDesign] = useState(JSON.stringify(current.customDesign ?? premiumCustomDesign, null, 2));
  const [media, setMedia] = useState(JSON.stringify(current.customMedia ?? { images: [], videos: [] }, null, 2));
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [width, setWidth] = useState<390 | 1280>(1280);
  function makePreview() { try { setPreview(applyCustomDesign(current, JSON.parse(design), JSON.parse(media))); setMessage("Preview ready. Review before publishing."); } catch (e) { setPreview(null); setMessage(e instanceof Error ? e.message : "Invalid composition."); } }
  async function mutate(action: "publish" | "restore") {
    setBusy(true);
    try {
      if (action === "publish" && !preview) throw new Error("Preview the current configuration first.");
      download("site-before-custom-design.json", { ...snapshot, document: current, capturedAt: new Date().toISOString() });
      const response = await fetch(`/api/owner/sites/${encodeURIComponent(current.slug)}/custom-design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expected: current, design: preview?.customDesign, media: preview?.customMedia }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCurrent(result.document); setPreview(null); setDesign(JSON.stringify(result.document.customDesign ?? premiumCustomDesign, null, 2)); setMedia(JSON.stringify(result.document.customMedia ?? { images: [], videos: [] }, null, 2)); setMessage(action === "publish" ? "Custom design saved. Existing publication state is preserved." : "Previous composition restored. Current content and domain preserved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Change failed."); } finally { setBusy(false); }
  }
  return <>
    <section className="workspace-card"><p>Export a backup, configure the design and media, then preview. A preset saves only composition and visual rules. Editing these fields invalidates the previous preview.</p>
      <button type="button" onClick={() => download("site-snapshot.json", { ...snapshot, document: current, capturedAt: new Date().toISOString() })}>Export snapshot</button>
      <OwnerCustomMediaUploader slug={current.slug} media={media} disabled={busy} onBusy={setBusy} onMedia={value => { setMedia(JSON.stringify(value, null, 2)); setPreview(null); }} />
      <div className="detail-grid"><label>Design configuration<textarea disabled={busy} rows={20} value={design} onChange={e => { setDesign(e.target.value); setPreview(null); }} style={{ width: "100%" }} /></label><label>Media roles and web assets<textarea disabled={busy} rows={20} value={media} onChange={e => { setMedia(e.target.value); setPreview(null); }} style={{ width: "100%" }} /></label></div>
      <label>Import reusable preset<input disabled={busy} type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 20_000) throw new Error("Preset too large."); setDesign(JSON.stringify(importCustomPreset(JSON.parse(await file.text())), null, 2)); setPreview(null); setMessage("Preset imported; your site's content and media remain bound to this business."); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid preset."); } }} /></label>
      <div className="filters"><button type="button" onClick={makePreview}>Preview design</button><button type="button" onClick={() => { try { download("custom-design-preset.json", exportCustomPreset(JSON.parse(design))); setMessage("Saved reusable preset without customer content or media."); } catch(e) { setMessage(e instanceof Error ? e.message : "Invalid preset."); } }}>Save as reusable template</button><button type="button" disabled={!preview || busy} onClick={() => mutate("publish")}>Publish custom design</button><button type="button" disabled={busy || !("_customRestore" in current)} onClick={() => mutate("restore")}>Restore previous composition</button></div>
      <p role="status">{message}</p>
    </section>
    {preview ? <section className="workspace-card"><button type="button" onClick={() => setWidth(390)}>Mobile 390</button><button type="button" onClick={() => setWidth(1280)}>Desktop 1280</button><button type="button" onClick={() => download("custom-site-draft.json", preview)}>Export draft</button><div style={{ overflowX: "auto" }}><CustomDesignPreviewFrame width={width}><SitePreview site={preview} /></CustomDesignPreviewFrame></div></section> : null}
  </>;
}
