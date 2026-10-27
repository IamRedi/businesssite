"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const storageKey = "business_admin_theme";

export function BusinessAdminThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const initial: Theme = saved === "dark" ? "dark" : "light";
    document.querySelector<HTMLElement>(".business-admin-shell")?.setAttribute("data-business-admin-theme", initial);
    const frame = window.requestAnimationFrame(() => setTheme(initial));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem(storageKey, next);
    document.querySelector<HTMLElement>(".business-admin-shell")?.setAttribute("data-business-admin-theme", next);
  }

  return (
    <button
      className="business-admin-theme-toggle"
      type="button"
      aria-label={theme === "light" ? "Enable dark mode" : "Enable light mode"}
      aria-pressed={theme === "dark"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
      onClick={toggle}
    >
      <span className="business-admin-theme-icon" aria-hidden="true" />
      <span className="sr-only">{theme === "light" ? "Enable dark mode" : "Enable light mode"}</span>
    </button>
  );
}
