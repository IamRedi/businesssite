"use client";
import { useState } from "react";
import { parseCustomMedia, type CustomImage, type CustomSiteMedia } from "@platform/website-engine";
import styles from "./owner-custom-media-uploader.module.css";

type Uploaded = { assetId: string; url: string; mimeType: "image/webp" | "video/mp4"; bytes: number; width: number; height: number; durationSeconds?: number };
export function prepareOwnerCustomMediaUpload(media: string, role: CustomImage["role"] | "video", label: string, posterId: string, mimeType: string) {
  const current = parseCustomMedia(JSON.parse(media));
  if (!label.trim()) throw new Error("Enter image alt text or a video title first.");
  if (label.trim().length > (role === "video" ? 160 : 240)) throw new Error(role === "video" ? "Video title must be at most 160 characters." : "Image alt text must be at most 240 characters.");
  if (role === "video" && !current.images.some(image => image.id === posterId && image.role === "video-poster")) throw new Error("Upload and select a poster before uploading video.");
  if ((role === "video" ? current.videos.length >= 8 : current.images.length >= 60 && (!['hero', 'logo', 'portrait'].includes(role) || !current.images.some(image => image.role === role)))) throw new Error("Custom media collection limit reached.");
  if (mimeType !== (role === "video" ? "video/mp4" : "image/webp")) throw new Error(role === "video" ? "Select a prepared MP4 video." : "Select a prepared WebP image.");
  return current;
}
export function OwnerCustomMediaUploader({ slug, media, disabled, onBusy, onMedia }: { slug: string; media: string; disabled: boolean; onBusy: (value: boolean) => void; onMedia: (value: CustomSiteMedia) => void }) {
  const [role, setRole] = useState<CustomImage["role"] | "video">("gallery");
  const [label, setLabel] = useState(""), [posterId, setPosterId] = useState(""), [status, setStatus] = useState("");
  let parsed: CustomSiteMedia | null = null;
  try { parsed = parseCustomMedia(JSON.parse(media)); } catch { /* Advanced edits must be valid before uploading. */ }
  async function upload(file: File) {
    onBusy(true); setStatus("Validating and uploading prepared media…");
    try {
      const current = prepareOwnerCustomMediaUpload(media, role, label, posterId, file.type);
      const body = new FormData(); body.set("file", file);
      const response = await fetch(`/api/owner/sites/${encodeURIComponent(slug)}/custom-media`, { method: "POST", body });
      const result = await response.json() as Uploaded & { error?: string };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      const id = `managed-${crypto.randomUUID()}`;
      if (role === "video") current.videos.push({ id, title: label.trim(), posterId, width: result.width, height: result.height, durationSeconds: result.durationSeconds!, sources: [{ src: result.url, type: "video/mp4", bytes: result.bytes }] });
      else {
        if (["hero", "logo", "portrait"].includes(role)) current.images = current.images.filter(image => image.role !== role);
        current.images.push({ id, role, src: result.url, alt: label.trim(), width: result.width, height: result.height });
        if (role === "video-poster") setPosterId(id);
      }
      onMedia(parseCustomMedia(current)); setStatus("Managed media added. Preview again before saving the composition.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Upload failed."); }
    finally { onBusy(false); }
  }
  return <fieldset disabled={disabled} className={styles.uploader}><legend>Managed custom media</legend>
    <p>Prepared WebP: up to 4 MiB / 2000 px. Prepared MP4: up to 4,000,000 bytes / 3840 px, within this website’s saved video duration policy. Uploads preserve publication state.</p>
    <div className={styles.controls}><label>Media role<select value={role} onChange={e => setRole(e.target.value as typeof role)}>{["hero", "logo", "gallery", "portrait", "video-poster", "video"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>{role === "video" ? "Video title" : "Image alt text"}<input value={label} maxLength={role === "video" ? 160 : 240} onChange={e => setLabel(e.target.value)} /></label>
    {role === "video" ? <label>Video poster<select value={posterId} onChange={e => setPosterId(e.target.value)}><option value="">Choose a managed poster</option>{parsed?.images.filter(image => image.role === "video-poster").map(image => <option key={image.id} value={image.id}>{image.alt}</option>)}</select></label> : null}
    <label>Upload prepared {role === "video" ? "MP4" : "WebP"}<input type="file" accept={role === "video" ? "video/mp4,.mp4" : "image/webp,.webp"} disabled={disabled || !parsed || !label.trim() || (role === "video" && !posterId)} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} /></label>
    </div><p role="status" aria-live="polite">{status || (!parsed ? "Fix the advanced media configuration before uploading." : "")}</p>
  </fieldset>;
}
