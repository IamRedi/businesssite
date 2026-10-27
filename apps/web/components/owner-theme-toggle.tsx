"use client";

import type { SupportedLocale } from "@platform/website-engine";
import { useEffect, useState } from "react";

export type OwnerTheme = "dark" | "light";

const labels: Record<SupportedLocale, Record<OwnerTheme, string>> = {
  en: { dark: "Use dark mode", light: "Use light mode" },
  de: { dark: "Dunklen Modus verwenden", light: "Hellen Modus verwenden" },
  fr: { dark: "Utiliser le mode sombre", light: "Utiliser le mode clair" },
  es: { dark: "Usar modo oscuro", light: "Usar modo claro" },
  it: { dark: "Usa modalità scura", light: "Usa modalità chiara" },
  sq: { dark: "Përdor modalitetin e errët", light: "Përdor modalitetin e çelët" },
};
const modeNames: Record<SupportedLocale, Record<OwnerTheme, string>> = {
  en: { dark: "Dark", light: "Light" }, de: { dark: "Dunkel", light: "Hell" },
  fr: { dark: "Sombre", light: "Clair" }, es: { dark: "Oscuro", light: "Claro" },
  it: { dark: "Scuro", light: "Chiaro" }, sq: { dark: "Errët", light: "Çelët" },
};

export function OwnerThemeToggle({ initialTheme, locale }: { initialTheme: OwnerTheme; locale: SupportedLocale }) {
  const [theme, setTheme] = useState<OwnerTheme>(initialTheme);
  useEffect(() => {
    document.body.dataset.ownerTheme = theme;
    document.documentElement.style.colorScheme = theme;
    return () => {
      delete document.body.dataset.ownerTheme;
      document.documentElement.style.colorScheme = "";
    };
  }, [theme]);

  const nextTheme: OwnerTheme = theme === "dark" ? "light" : "dark";
  return <button className="owner-theme-toggle" type="button" aria-label={labels[locale][nextTheme]} title={labels[locale][nextTheme]} onClick={() => {
    setTheme(nextTheme);
    document.cookie = `owner_theme=${nextTheme}; Path=/owner; Max-Age=31536000; SameSite=Lax`;
  }}>
    <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    <strong>{modeNames[locale][nextTheme]}</strong>
  </button>;
}
