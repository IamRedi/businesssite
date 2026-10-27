"use client";
/* eslint-disable @next/next/no-img-element -- runtime customer assets, reserved intrinsic dimensions. */
import { useEffect, useRef, useState } from "react";
import type { CustomImage, CustomSiteDesign } from "@platform/website-engine";
import styles from "./custom-site.module.css";

export function GalleryCarousel({ images, config, labels }: { images: CustomImage[]; config: CustomSiteDesign["gallery"]; labels: { previous: string; next: string; close: string; view: string; all: string } }) {
  const rail = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement | null>(null);
  const [category, setCategory] = useState(""), [selected, setSelected] = useState<CustomImage | null>(null), [position, setPosition] = useState({ start: true, end: false });
  const photos = images.filter(i => !category || i.category === category);
  const categories = config.categories.filter(c => images.some(i => i.category === c));
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const measure = () => setPosition({ start: node.scrollLeft < 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const frame = requestAnimationFrame(measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [category, images]);
  function move(direction: number) { const node = rail.current; if (!node) return; node.scrollBy({ left: direction * (node.firstElementChild?.getBoundingClientRect().width ?? node.clientWidth), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }
  return <div className={styles.carousel}>
    {categories.length ? <div className={styles.filters}>{["", ...categories].map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => { setCategory(c); rail.current?.scrollTo({ left: 0 }); setPosition({ start: true, end: false }); }}>{c || labels.all}</button>)}</div> : null}
    <div ref={rail} className={styles.rail} role="region" aria-label={labels.view} tabIndex={0} data-aspect={config.aspect}
      onScroll={e => { const n = e.currentTarget; setPosition({ start: n.scrollLeft < 2, end: n.scrollLeft + n.clientWidth >= n.scrollWidth - 2 }); }}
      onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); move(e.key === "ArrowRight" ? 1 : -1); } }}>
      {photos.map(photo => <figure key={photo.id}>
        {config.lightbox ? <button type="button" aria-label={`${labels.view}: ${photo.alt}`} onClick={e => { opener.current = e.currentTarget; setSelected(photo); dialog.current?.showModal(); }}><img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" sizes="(max-width: 700px) 80vw, 30vw" /></button> : <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />}
        <figcaption>{photo.alt}</figcaption>
      </figure>)}
    </div>
    <div className={styles.galleryControls}><span>{photos.length} / {images.length}</span><button type="button" aria-label={labels.previous} disabled={position.start || photos.length < 2} onClick={() => move(-1)}>←</button><button type="button" aria-label={labels.next} disabled={position.end || photos.length < 2} onClick={() => move(1)}>→</button></div>
    {config.lightbox ? <dialog ref={dialog} className={styles.lightbox} aria-label={selected?.alt || labels.view} onClose={() => { setSelected(null); opener.current?.focus(); }} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <button type="button" onClick={() => dialog.current?.close()}>{labels.close} ×</button>
      {selected ? <img src={selected.src} alt={selected.alt} width={selected.width} height={selected.height} /> : null}
    </dialog> : null}
  </div>;
}
