"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { platformBrandProfile } from "../lib/brand-profile";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const labels = {
  de: "App installieren", en: "Install app",
} as const;

export function SiteAdminInstallPrompt() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    if (!pathname.startsWith("/site-admin")) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    void navigator.serviceWorker?.register(`/site-admin-service-worker.js?v=${encodeURIComponent(`${platformBrandProfile.key}-${platformBrandProfile.assetVersion}`)}`, { scope: "/site-admin/", updateViaCache: "none" });
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const completed = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", completed);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", completed); };
  }, [pathname]);
  if (!pathname.startsWith("/site-admin") || !prompt) return null;
  const locale = document.documentElement.lang as keyof typeof labels;
  return <button className="site-admin-install" type="button" onClick={async () => {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "dismissed") setPrompt(null);
  }}>{labels[locale] ?? labels.en}</button>;
}
