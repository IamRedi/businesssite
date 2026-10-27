/* eslint-disable @next/next/no-img-element -- authenticated editorial asset preview */
"use client";

import { useMemo, useState } from "react";
import type { EditorialCopy } from "../lib/editorial-copy";

type Asset = { id: string; publicUrl: string | null; storageKey: string; altText: string | null };

async function rasterizeImage(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => context.drawImage(bitmap, 0, 0, width, height),
      dispose: () => bitmap.close(),
    };
  } catch {
    // Some browser and device combinations cannot decode an image through
    // createImageBitmap. The Image fallback keeps uploads usable there.
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("image_decode_failed"));
        element.src = objectUrl;
      });
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        draw: (context: CanvasRenderingContext2D, width: number, height: number) => context.drawImage(image, 0, 0, width, height),
        dispose: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
}

export function EditorialMediaField({
  slug,
  assets: initialAssets,
  initialId,
  initialArticleMediaIds = [],
  articleMediaLabel,
  copy,
  inputName = "featuredMediaId",
  showGallery = true,
}: {
  slug: string;
  assets: Asset[];
  initialId?: string;
  initialArticleMediaIds?: string[];
  articleMediaLabel: string;
  copy: EditorialCopy["upload"];
  inputName?: string;
  showGallery?: boolean;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [selected, setSelected] = useState(initialId ?? "");
  const [articleMediaIds, setArticleMediaIds] = useState(() => new Set(initialArticleMediaIds));
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const preview = useMemo(() => assets.find((asset) => asset.id === selected)?.publicUrl, [assets, selected]);

  async function upload(file: File) {
    setState("uploading");
    try {
      const image = await rasterizeImage(file);
      try {
        const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas_unavailable");
        image.draw(context, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
        if (!blob) throw new Error("conversion_failed");
        const formData = new FormData();
        formData.set("file", new File([blob], "editorial-image.webp", { type: "image/webp" }));
        const response = await fetch("/api/site-admin/media", {
          method: "POST",
          headers: { "x-site-slug": slug, "x-media-purpose": "editorial" },
          body: formData,
        });
        const body: unknown = await response.json().catch(() => null);
        const assetId = body && typeof body === "object" && "assetId" in body ? body.assetId : undefined;
        const url = body && typeof body === "object" && "url" in body ? body.url : undefined;
        const storageKey = body && typeof body === "object" && "storageKey" in body ? body.storageKey : undefined;
        if (!response.ok || typeof assetId !== "string" || typeof url !== "string" || typeof storageKey !== "string") throw new Error("upload_failed");
        const asset = { id: assetId, publicUrl: url, storageKey, altText: null };
        setAssets((current) => [asset, ...current]);
        setSelected(asset.id);
        setState("idle");
      } finally {
        image.dispose();
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="editorial-media-field">
      <select name={inputName} value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">—</option>
        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText || asset.storageKey.split("/").at(-1)}</option>)}
      </select>
      {preview ? <img src={preview} alt="" /> : null}
      <label className="editorial-upload-button">
        <span>{state === "uploading" ? copy.uploading : state === "error" ? copy.failed : copy.choose}</span>
        <input type="file" accept="image/*" disabled={state === "uploading"} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }} />
      </label>
      {showGallery ? <fieldset className="editorial-media-library">
        <legend>{articleMediaLabel}</legend>
        <div className="editorial-media-options">
          {assets.map((asset) => {
            const checked = articleMediaIds.has(asset.id);
            return <label key={asset.id} className={checked ? "selected" : undefined}>
              {asset.publicUrl ? <img src={asset.publicUrl} alt={asset.altText ?? ""} /> : null}
              <span>{asset.altText || asset.storageKey.split("/").at(-1)}</span>
              <input
                type="checkbox"
                name="articleMediaId"
                value={asset.id}
                checked={checked}
                onChange={(event) => setArticleMediaIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked && next.size < 20) next.add(asset.id);
                  else if (!event.target.checked) next.delete(asset.id);
                  return next;
                })}
              />
            </label>;
          })}
        </div>
      </fieldset> : null}
    </div>
  );
}
