"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageSelector } from "./language-selector";
import { ownerNavigationCopy } from "../lib/owner-navigation-copy";
import type { PlatformLocale } from "../lib/platform-config";
import { hasOwnerPermission, type OwnerPermission, type OwnerRole } from "../lib/owner-permissions";

export function OwnerWorkspaceFrame({ children, locale, supportedLocales, brandName, brandMark, role }: {
  children: ReactNode;
  locale: PlatformLocale;
  supportedLocales: PlatformLocale[];
  brandName: string;
  brandMark: string;
  role?: OwnerRole;
}) {
  const pathname = usePathname();
  if (pathname === "/owner/login" || pathname === "/owner/mfa" || pathname === "/owner/invitation") return children;
  const copy = ownerNavigationCopy[locale];
  const publicationLabel = "Publications";
  const items: Array<{ href: string; label: string; icon: string; exact: boolean; permission: OwnerPermission }> = [
    { href: "/owner/publications", label: publicationLabel, icon: "P", exact: false, permission: "information.manage" },
    { href: "/owner", label: copy.overview, icon: "⌂", exact: true, permission: "finder.read" },
    { href: "/owner#finder", label: copy.finder, icon: "⌕", exact: false, permission: "finder.read" },
    { href: "/owner/searches", label: copy.searches, icon: "↻", exact: false, permission: "finder.read" },
    { href: "/owner/businesses", label: copy.businesses, icon: "◇", exact: false, permission: "finder.read" },
    { href: "/owner/customers", label: copy.customers, icon: "◎", exact: false, permission: "subscriptions.read" },
    { href: "/owner/complimentary", label: "Complimentary", icon: "✶", exact: false, permission: "websites.manage" },
    { href: "/owner/promotions", label: copy.promotions, icon: "%", exact: false, permission: "billing.manage" },
    { href: "/owner/provider-usage", label: copy.providerUsage, icon: "$", exact: false, permission: "audit.read" },
    { href: "/owner/security", label: "Security", icon: "⚿", exact: false, permission: "security.self" },
    { href: "/owner/team", label: "Team", icon: "♙", exact: false, permission: "team.manage" },
    { href: "/owner/legal", label: "Legal & B2B", icon: "§", exact: false, permission: "audit.read" },
    { href: "/owner/privacy", label: "Privacy operations", icon: "◫", exact: false, permission: "privacy.read" },
  ];
  const visibleItems = items.filter((item) => hasOwnerPermission(role, item.permission));
  return <div className="owner-app-frame">
    <aside className="owner-sidebar">
      <Link className="owner-sidebar-brand" href="/owner">
        <span>{brandMark}</span><div><strong>{brandName}</strong><small>{copy.ownerArea}</small></div>
      </Link>
      <p className="owner-sidebar-label">{copy.workspace}</p>
      <nav aria-label={copy.navigation}>{visibleItems.map((item) => {
        const path = item.href.split("#")[0];
        const active = item.exact ? pathname === path : path !== "/owner" && pathname.startsWith(path);
        return <Link className={active ? "active" : ""} href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong></Link>;
      })}</nav>
      {supportedLocales.length > 1 ? <div className="owner-sidebar-language"><LanguageSelector current={locale} supported={supportedLocales} label={copy.navigation} /></div> : null}
    </aside>
    <div className="owner-app-content">{children}</div>
  </div>;
}
