"use client";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A separate viewport makes mobile media queries match the selected width. */
export function CustomDesignPreviewFrame({ width, children }: { width: 390 | 1280; children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  return <iframe ref={frame} title={`Custom site preview at ${width} pixels`} width={width} height={900}
    style={{ display: "block", border: 0, maxWidth: "none" }} sandbox="allow-same-origin"
    srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body style='margin:0'></body></html>"
    onLoad={() => {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      for (const style of document.querySelectorAll("style,link[rel='stylesheet']")) doc.head.appendChild(style.cloneNode(true));
      setBody(doc.body);
    }}>{body ? createPortal(children, body) : null}</iframe>;
}
