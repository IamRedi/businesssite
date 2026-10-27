import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { OwnerThemeToggle, type OwnerTheme } from "../../components/owner-theme-toggle";
import { OwnerWorkspaceFrame } from "../../components/owner-workspace-frame";
import { platformConfig, platformMark } from "../../lib/platform-config";
import { ownerPanelLocale } from "../../lib/locale-model";
import { requireOwnerSession } from "../../lib/owner-auth";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialTheme: OwnerTheme = cookieStore.get("owner_theme")?.value === "light" ? "light" : "dark";
  const locale = ownerPanelLocale;
  const owner = await requireOwnerSession();
  return <div className="owner-theme-boundary">
    <OwnerWorkspaceFrame role={owner?.role} locale={locale} supportedLocales={[ownerPanelLocale]} brandName={platformConfig.brand.name} brandMark={platformMark}>{children}</OwnerWorkspaceFrame>
    <OwnerThemeToggle initialTheme={initialTheme} locale={locale} />
  </div>;
}
