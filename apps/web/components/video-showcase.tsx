"use client";
import { useEffect, useRef, useState } from "react";
import type { CustomImage, CustomVideo } from "@platform/website-engine";
import styles from "./custom-site.module.css";

export function VideoLoop({ video, poster, decorative, labels }: { video: CustomVideo; poster: CustomImage; decorative: boolean; labels: { play: string; pause: string } }) {
  // A replacement gets a fresh element and playback state; identical media
  // retains its state. The existing visibility and motion policy runs anew.
  const mediaKey = JSON.stringify([poster.src, video.sources.map(({ src, type, bytes }) => [src, type, bytes])]);
  return <VideoPlayback key={mediaKey} video={video} poster={poster} decorative={decorative} labels={labels} />;
}
function VideoPlayback({ video, poster, decorative, labels }: { video: CustomVideo; poster: CustomImage; decorative: boolean; labels: { play: string; pause: string } }) {
  const ref = useRef<HTMLVideoElement>(null), manualPause = useRef(false), userRequested = useRef(false);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let visible = false;
    function sync() {
      if (!visible || document.hidden || (decorative && !userRequested.current && (motion.matches || connection?.saveData))) { node!.pause(); return; }
      if (decorative && !manualPause.current) void node!.play().catch(() => {});
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25; if (visible && (!decorative || (!motion.matches && !connection?.saveData))) setReady(true); sync(); }, { threshold: .25 });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync); motion.addEventListener("change", sync); node.addEventListener("canplay", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); node.removeEventListener("canplay", sync); node.pause(); };
  }, [decorative]);
  useEffect(() => { if (ready) ref.current?.load(); }, [ready]);
  return <figure className={styles.videoCard}>
    <video ref={ref} poster={poster.src} width={video.width} height={video.height} preload="none" muted playsInline loop={decorative} controls aria-label={video.title}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      {ready ? video.sources.map(source => <source key={source.src} src={source.src} type={source.type} />) : null}
    </video>
    <figcaption><span>{video.title}</span><button type="button" onClick={() => { const n = ref.current; if (!n) return; userRequested.current = true; if (playing) { manualPause.current = true; n.pause(); } else { manualPause.current = false; setReady(true); if (ready) void n.play().catch(() => {}); else n.addEventListener("canplay", () => { void n.play().catch(() => {}); }, { once: true }); } }}>{playing ? labels.pause : labels.play}</button></figcaption>
  </figure>;
}
export function VideoShowcase({ videos, images, decorative, aspect, labels }: { videos: CustomVideo[]; images: CustomImage[]; decorative: boolean; aspect: "portrait" | "landscape"; labels: { play: string; pause: string } }) {
  return <div className={styles.videos} data-aspect={aspect}>{videos.map(video => { const poster = images.find(i => i.id === video.posterId); return poster ? <VideoLoop key={video.id} video={video} poster={poster} decorative={decorative} labels={labels} /> : null; })}</div>;
}
