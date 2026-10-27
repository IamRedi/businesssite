/* eslint-disable @next/next/no-img-element -- managed customer assets rendered directly in authenticated previews. */
"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { parseCustomMedia, type CustomImage, type CustomSiteMedia, type PriceList, type SiteDocument } from "@platform/website-engine";
import { SiteAdminPreview } from "./site-admin-preview";
import { SitePreview } from "./site-preview";

type Field = "priceList" | "customMedia";
type Editor = { site: SiteDocument; saved: SiteDocument; busy: boolean; message: string; failed: boolean; update: (field: Field, value: PriceList | CustomSiteMedia) => void; save: (field: Field) => Promise<void>; upload: (file: File) => Promise<Uploaded>; setMessage: (message: string, failed?: boolean) => void };
type Uploaded = { url: string; width: number; height: number; bytes: number; durationSeconds?: number; mimeType: "image/webp" | "video/mp4" };
const Context = createContext<Editor | null>(null);
function useEditor() { const value = useContext(Context); if (!value) throw new Error("Custom editor provider required"); return value; }

export function SiteAdminCustomProvider({ initialSite, children }: { initialSite: SiteDocument; children: ReactNode }) {
  const [site, setSite] = useState(initialSite), [saved, setSaved] = useState(initialSite);
  const [busy, setBusy] = useState(false), [message, messageState] = useState(""), [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const dirty = JSON.stringify([site.priceList, site.customMedia]) !== JSON.stringify([saved.priceList, saved.customMedia]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function setMessage(value: string, error = false) { messageState(value); setFailed(error); }
  function update(field: Field, value: PriceList | CustomSiteMedia) { setSite(current => ({ ...current, [field]: value })); setMessage("Ungespeicherte Änderungen"); }
  async function save(field: Field) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("Wird gespeichert …");
    try {
      const response = await fetch(`/api/site-admin/${encodeURIComponent(site.slug)}/custom-content`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value: site[field], expected: saved[field], expectedDesign: saved.customDesign }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSaved(current => ({ ...current, [field]: result.value }));
      setSite(current => ({ ...current, [field]: result.value }));
      setMessage("Gespeichert");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.", true); }
    finally { lock.current = false; setBusy(false); }
  }
  async function upload(file: File): Promise<Uploaded> {
    if (lock.current) throw new Error("Bitte warten, bis der Upload abgeschlossen ist.");
    lock.current = true; setBusy(true); setMessage("Wird hochgeladen …");
    try {
      let prepared = file;
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        try {
          const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .84));
          if (!blob) throw new Error("Foto konnte nicht verarbeitet werden.");
          prepared = new File([blob], "foto.webp", { type: "image/webp" });
        } finally { bitmap.close(); }
      }
      if (prepared.size > (prepared.type === "video/mp4" ? 4_000_000 : 4 * 1024 * 1024)) throw new Error("Datei ist zu groß. Bitte maximal 4 MB auswählen.");
      const body = new FormData(); body.set("file", prepared);
      const response = await fetch(`/api/site-admin/${encodeURIComponent(site.slug)}/custom-media`, { method: "POST", body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      return result;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen.", true); throw error; }
    finally { lock.current = false; setBusy(false); }
  }
  return <Context.Provider value={{ site, saved, busy, message, failed, update, save, upload, setMessage }}>{children}</Context.Provider>;
}

function SaveBar({ field }: { field: Field }) {
  const editor = useEditor(), dirty = JSON.stringify(editor.site[field]) !== JSON.stringify(editor.saved[field]);
  return <div className="premium-save-bar"><button className="button" type="submit" disabled={editor.busy || !dirty}>{field === "priceList" ? "Preise speichern" : "Medien speichern"}</button><p role={editor.failed ? "alert" : "status"} className={editor.failed ? "error" : ""}>{editor.message || "Alle Änderungen gespeichert"}</p></div>;
}

function PriceInput({ cents, label, disabled, change }: { cents: number; label: string; disabled: boolean; change: (value: number) => void }) {
  const [text, setText] = useState((cents / 100).toFixed(2).replace(".", ","));
  return <label>{label}<span className="premium-price-amount"><input aria-label={label} required inputMode="decimal" value={text} disabled={disabled} onChange={event => {
    const value = event.target.value; setText(value);
    const match = /^(\d{1,7})(?:[,.](\d{0,2}))?$/.exec(value.trim());
    const amount = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
    const valid = Number.isSafeInteger(amount) && amount <= 100_000_000;
    event.target.setCustomValidity(valid ? "" : "Bitte einen gültigen Preis eingeben.");
    if (valid) change(amount);
  }} onBlur={event => { if (event.target.validity.valid) setText((cents / 100).toFixed(2).replace(".", ",")); }} /><span>€</span></span></label>;
}

export function SiteAdminPrices() {
  const editor = useEditor(), prices = editor.site.priceList;
  const [activeGroup, setActiveGroup] = useState(0);
  if (!prices) return null;
  function edit(group: number, item: number, change: (row: PriceList["groups"][number]["items"][number]) => void) {
    const next = structuredClone(prices!); change(next.groups[group].items[item]); editor.update("priceList", next);
  }
  return <form className="site-editor-section-form premium-prices" onSubmit={event => { event.preventDefault(); void editor.save("priceList"); }}>
    <div className="editor-section-heading"><div><p className="eyebrow">Website</p><h2>Leistungen &amp; Preise</h2></div><p>Änderungen sehen Sie direkt in der Vorschau.</p></div>
    <div className="premium-segments" aria-label="Preisgruppen">{prices.groups.map((group, gi) => <button key={gi} type="button" aria-pressed={activeGroup === gi} onClick={() => setActiveGroup(gi)}>{group.title}</button>)}</div>
    {prices.groups.map((group, gi) => <fieldset className="premium-price-group" key={gi} hidden={activeGroup !== gi}><legend>{group.title}</legend>{group.items.map((item, ii) => <div className="premium-price-row" key={ii} data-price-row={`${gi}-${ii}`}>
      <label className="premium-service-label">Leistung<input aria-label={`${group.title} Leistung ${ii + 1}`} required maxLength={240} value={item.label} disabled={editor.busy} onChange={event => edit(gi, ii, row => { row.label = event.target.value; })} /></label>
      <div className="premium-price-columns">{item.prices.map((price, pi) => <div key={pi}><PriceInput cents={price.amountCents} label={item.prices.length === 1 ? "Preis" : group.columns[pi]} disabled={editor.busy} change={amount => edit(gi, ii, row => { row.prices[pi].amountCents = amount; })} /><label className="premium-from"><input type="checkbox" checked={Boolean(price.from)} disabled={editor.busy} onChange={event => edit(gi, ii, row => { row.prices[pi].from = event.target.checked; })} />ab</label></div>)}</div>
    </div>)}</fieldset>)}
    <SaveBar field="priceList" />
  </form>;
}

const roleNames: Record<CustomImage["role"], string> = { hero: "Titelbild", logo: "Logo", gallery: "Galerie", portrait: "Porträt", "video-poster": "Videovorschau", service: "Leistungsbilder" };
function UploadButton({ label, accept = "image/*", disabled, onFile }: { label: string; accept?: string; disabled: boolean; onFile: (file: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  return <><button className="button secondary" type="button" disabled={disabled} onClick={() => input.current?.click()}>{label}</button><input ref={input} className="premium-file-input" type="file" aria-label={label} accept={accept} disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onFile(file).catch(() => undefined); }} /></>;
}

export function SiteAdminMedia({ editable }: { editable: boolean }) {
  const editor = useEditor(), media = editor.site.customMedia!;
  const [activeGroup, setActiveGroup] = useState<CustomImage["role"] | "video">("gallery");
  const disabled = editor.busy || !editable;
  function change(next: CustomSiteMedia) {
    try { editor.update("customMedia", parseCustomMedia(next)); }
    catch { editor.setMessage("Bitte zuerst eine Videovorschau auswählen.", true); }
  }
  async function image(file: File, role: CustomImage["role"], existing?: CustomImage) {
    const uploaded = await editor.upload(file);
    if (uploaded.mimeType !== "image/webp") throw new Error("Foto erforderlich");
    const next: CustomImage = { ...existing, id: existing?.id ?? `foto-${crypto.randomUUID()}`, role, src: uploaded.url, width: uploaded.width, height: uploaded.height, alt: existing?.alt || roleNames[role] };
    change({ ...media, images: existing ? media.images.map(item => item.id === existing.id ? next : item) : [...media.images, next] });
  }
  async function video(file: File, id?: string) {
    const existing = media.videos.find(item => item.id === id), poster = existing?.posterId ?? media.images.find(item => item.role === "video-poster")?.id;
    if (!poster) { editor.setMessage("Bitte zuerst eine Videovorschau hochladen.", true); return; }
    const uploaded = await editor.upload(file);
    if (uploaded.mimeType !== "video/mp4" || !uploaded.durationSeconds) throw new Error("MP4 erforderlich");
    const next = { id: id ?? `video-${crypto.randomUUID()}`, title: existing?.title ?? "Unser Einblick", posterId: poster, width: uploaded.width, height: uploaded.height, durationSeconds: uploaded.durationSeconds, sources: [{ src: uploaded.url, type: "video/mp4" as const, bytes: uploaded.bytes }] };
    change({ ...media, videos: existing ? media.videos.map(item => item.id === id ? next : item) : [...media.videos, next] });
  }
  function move(id: string, direction: -1 | 1) {
    const images = [...media.images], index = images.findIndex(item => item.id === id), peers = images.map((item, i) => item.role === images[index].role ? i : -1).filter(i => i >= 0), target = peers[peers.indexOf(index) + direction];
    if (target === undefined) return;
    [images[index], images[target]] = [images[target], images[index]]; change({ ...media, images });
  }
  return <form className="site-editor-section-form premium-custom-media" onSubmit={event => { event.preventDefault(); void editor.save("customMedia"); }}>
    <div className="editor-section-heading"><div><p className="eyebrow">Website</p><h2>Fotos &amp; Videos</h2></div><p>Fotos vom Gerät auswählen. MP4 bis 4 MB und {editor.site.customDesign!.video.maxDurationSeconds} Sekunden.</p></div>
    {!editable ? <p>Medienbearbeitung ist zurzeit nicht verfügbar.</p> : null}
    <label className="premium-media-picker">Medienbereich<select aria-label="Medienbereich" value={activeGroup} onChange={event => setActiveGroup(event.target.value as typeof activeGroup)}>{Object.entries(roleNames).map(([role, label]) => <option key={role} value={role}>{label}</option>)}<option value="video">Videos</option></select></label>
    {(["hero", "logo", "gallery", "portrait", "service", "video-poster"] as const).map(role => {
      const images = media.images.filter(item => item.role === role), singleton = ["hero", "logo", "portrait"].includes(role);
      return <section className="premium-media-group" key={role} hidden={activeGroup !== role}><div className="premium-section-heading"><h3>{roleNames[role]}</h3>{(!singleton || !images.length) && media.images.length < 60 ? <UploadButton label={`${roleNames[role]} hochladen`} disabled={disabled} onFile={file => image(file, role)} /> : null}</div>
        <div className="premium-media-grid">{images.map((item, index) => <article className="premium-media-card" key={item.id} data-media-id={item.id}>
          <img src={item.src} alt={item.alt} width={item.width} height={item.height} />
          <label>Bildbeschreibung<input value={item.alt} maxLength={240} disabled={disabled} onChange={event => change({ ...media, images: media.images.map(current => current.id === item.id ? { ...current, alt: event.target.value } : current) })} /></label>
          <div className="premium-media-actions"><UploadButton label="Ersetzen" disabled={disabled} onFile={file => image(file, role, item)} /><button type="button" className="button secondary destructive" disabled={disabled || media.videos.some(video => video.posterId === item.id)} onClick={() => change({ ...media, images: media.images.filter(current => current.id !== item.id) })}>Entfernen</button>
          {images.length > 1 ? <><button type="button" className="button secondary" aria-label={`${roleNames[role]} ${index + 1} nach vorne`} disabled={disabled || index === 0} onClick={() => move(item.id, -1)}>←</button><button type="button" className="button secondary" aria-label={`${roleNames[role]} ${index + 1} nach hinten`} disabled={disabled || index === images.length - 1} onClick={() => move(item.id, 1)}>→</button></> : null}</div>
          {media.videos.some(video => video.posterId === item.id) ? <small>Wird als Videovorschau verwendet.</small> : null}
        </article>)}</div>
      </section>;
    })}
    <section className="premium-media-group" hidden={activeGroup !== "video"}><div className="premium-section-heading"><h3>Videos</h3>{media.videos.length < 8 ? <UploadButton label="Video hochladen" accept="video/mp4" disabled={disabled || !media.images.some(item => item.role === "video-poster")} onFile={file => video(file)} /> : null}</div>
      {!media.images.some(item => item.role === "video-poster") ? <p>Für ein Video zuerst eine Videovorschau hochladen.</p> : null}
      <div className="premium-media-grid">{media.videos.map((item, index) => <article className="premium-media-card" key={item.id} data-video-id={item.id}>
        <video controls preload="metadata" playsInline poster={media.images.find(image => image.id === item.posterId)?.src} src={item.sources[0].src} />
        <label>Videotitel<input value={item.title} maxLength={160} disabled={disabled} onChange={event => change({ ...media, videos: media.videos.map(current => current.id === item.id ? { ...current, title: event.target.value } : current) })} /></label>
        <label>Videovorschau<select aria-label="Videovorschau" value={item.posterId} disabled={disabled} onChange={event => change({ ...media, videos: media.videos.map(current => current.id === item.id ? { ...current, posterId: event.target.value } : current) })}>{media.images.filter(image => image.role === "video-poster").map((image, i) => <option key={image.id} value={image.id}>{image.alt || `Vorschau ${i + 1}`}</option>)}</select></label>
        <div className="premium-media-actions"><UploadButton label="Video ersetzen" accept="video/mp4" disabled={disabled} onFile={file => video(file, item.id)} /><button type="button" className="button secondary destructive" disabled={disabled} onClick={() => change({ ...media, videos: media.videos.filter(current => current.id !== item.id) })}>Entfernen</button>
          {media.videos.length > 1 ? <><button className="button secondary" type="button" aria-label={`Video ${index + 1} nach vorne`} disabled={disabled || index === 0} onClick={() => { const videos = [...media.videos]; [videos[index - 1], videos[index]] = [videos[index], videos[index - 1]]; change({ ...media, videos }); }}>←</button><button className="button secondary" type="button" aria-label={`Video ${index + 1} nach hinten`} disabled={disabled || index === media.videos.length - 1} onClick={() => { const videos = [...media.videos]; [videos[index + 1], videos[index]] = [videos[index], videos[index + 1]]; change({ ...media, videos }); }}>→</button></> : null}</div>
      </article>)}</div>
    </section>
    <SaveBar field="customMedia" />
  </form>;
}

export function SiteAdminLivePreview() {
  const { site } = useEditor();
  return <SiteAdminPreview><SitePreview site={site} /></SiteAdminPreview>;
}
