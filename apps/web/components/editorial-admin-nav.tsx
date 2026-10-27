import Link from "next/link";
import type { EditorialCopy } from "../lib/editorial-copy";

export function EditorialAdminNav({ slug, copy, canManageSettings }: { slug: string; copy: EditorialCopy; canManageSettings: boolean }) {
  return <nav className="detail-nav editorial-admin-nav" aria-label={copy.list.title}>
    <Link className="button secondary compact" href={`/site-admin/${slug}`}>{copy.nav.back}</Link>
    <Link className="button secondary compact" href={`/site-admin/${slug}/articles`}>{copy.nav.articles}</Link>
    {canManageSettings ? <Link className="button secondary compact" href={`/site-admin/${slug}/editorial`}>{copy.nav.settings}</Link> : null}
  </nav>;
}
