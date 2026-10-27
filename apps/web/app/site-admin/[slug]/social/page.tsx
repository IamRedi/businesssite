import Link from "next/link";
import { redirect } from "next/navigation";
import { PostgresSiteRepository } from "@platform/site-data";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../../lib/site-admin-auth";
import { socialControlCopy } from "../../../../lib/social-control-copy";

export const dynamic = "force-dynamic";

export default async function SocialControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session) redirect("/site-admin/login");
  const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) });
  const [site, siteId] = await Promise.all([
    repository.getBySlug(slug),
    repository.getSiteIdBySlug(slug),
  ]);
  if (!site || !siteId || session.siteId !== siteId) redirect("/site-admin/login");
  const copy = socialControlCopy[session.preferredLocale];

  return <main className="owner-shell site-admin-shell social-control-page">
    <header className="detail-header">
      <div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="owner-intro">{site.content.name} · {copy.intro}</p></div>
      <nav className="detail-nav" aria-label={copy.title}><Link className="button secondary compact" href={`/site-admin/${slug}`}>{copy.back}</Link></nav>
    </header>
    <section className="social-control-grid">
      <article className="workspace-card social-control-primary">
        <p className="eyebrow">{copy.unavailable}</p>
        <h2>{copy.unavailable}</h2>
        <p>{copy.unavailableBody}</p>
        <span className="operation-status pending">{copy.unavailable}</span>
      </article>
      <aside className="workspace-card social-control-security"><span className="social-control-lock" aria-hidden="true">↗</span><h2>{copy.security}</h2><p>{copy.securityBody}</p><p className="integration-provider">REDI CONTROL</p></aside>
    </section>
  </main>;
}
