"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CustomDesignPreviewFrame } from "./custom-design-preview-frame";

/** Isolate website anchors, CSS and form controls from the admin workspace. */
export function SiteAdminPreview({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<390 | 1280>(1280);
  const [available, setAvailable] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, (available ?? 320) / width);
  return <div className="premium-preview-viewport">
    <div className="premium-segments" aria-label="Vorschaugröße"><button type="button" aria-pressed={width === 1280} onClick={() => setWidth(1280)}>Desktop</button><button type="button" aria-pressed={width === 390} onClick={() => setWidth(390)}>Mobil</button></div>
    <div ref={container} className="premium-preview-canvas" style={{ height: 900 * scale }}><div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width }}>{available !== null ? <CustomDesignPreviewFrame width={width}><div inert>{children}</div></CustomDesignPreviewFrame> : null}</div></div>
  </div>;
}
