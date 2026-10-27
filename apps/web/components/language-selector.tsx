"use client";

import { useEffect, useState } from "react";
import type { PlatformLocale } from "../lib/platform-config";

const labels: Record<PlatformLocale, string> = {
  de: "DE",
  en: "EN",
  fr: "FR",
  es: "ES",
  it: "IT",
  sq: "SQ",
};

function supportedBrowserLocale(value: string, supported: PlatformLocale[]) {
  const normalized = value.toLowerCase().split("-")[0] as PlatformLocale;
  return supported.includes(normalized) ? normalized : undefined;
}

export function LanguageSelector({
  current,
  supported,
  label = "Language",
}: {
  current: PlatformLocale;
  supported: PlatformLocale[];
  label?: string;
}) {
  const [value, setValue] = useState(current);

  function setLocale(locale: PlatformLocale) {
    document.cookie = `platform_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setValue(locale);
    window.location.reload();
  }

  useEffect(() => {
    if (document.cookie.includes("platform_locale=")) return;
    const detected = navigator.languages
      .map((item) => supportedBrowserLocale(item, supported))
      .find(Boolean);
    if (detected && detected !== current) {
      document.cookie = `platform_locale=${detected}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.location.reload();
    }
  }, [current, supported]);

  return (
    <label className="language-selector" aria-label={label}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => setLocale(event.target.value as PlatformLocale)}>
        {supported.map((locale) => (
          <option key={locale} value={locale}>{labels[locale]}</option>
        ))}
      </select>
    </label>
  );
}
