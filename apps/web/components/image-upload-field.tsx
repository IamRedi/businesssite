/* eslint-disable @next/next/no-img-element -- this is an authenticated local editor preview. */
"use client";
import { useState } from "react";

export function ImageUploadField({
  slug,
  name,
  label,
  initialValue = "",
}: {
  slug: string;
  name: string;
  label: string;
  initialValue?: string;
}) {
  const [url, setUrl] = useState(initialValue);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  async function upload(file: File) {
    setState("uploading");
    try {
      const image = await createImageBitmap(file);
      const limit = 2000;
      const scale = Math.min(1, limit / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.84),
      );
      image.close();
      if (!blob) throw new Error("Conversion failed");
      const data = new FormData();
      data.set(
        "file",
        new File([blob], `${name}.webp`, { type: "image/webp" }),
      );
      const response = await fetch("/api/site-admin/media", {
        method: "POST",
        headers: { "x-site-slug": slug },
        body: data,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setUrl(body.url);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  return (
    <label className="image-upload">
      <span>{label}</span>
      <input type="hidden" name={name} value={url} />
      {url ? <img src={url} alt="" /> : null}
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <small>
        {state === "uploading"
          ? "Converting to WebP and uploading…"
          : state === "error"
            ? "Upload failed. Try a smaller image."
            : "Choose from device — converted automatically to WebP."}
      </small>
      <small>Uploads are processed for your website. <a href="/legal/privacy" target="_blank">Privacy notice</a></small>
    </label>
  );
}
