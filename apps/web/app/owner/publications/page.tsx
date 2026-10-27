import Link from "next/link";
import { redirect } from "next/navigation";
import { PostgresInformationRepository } from "@platform/site-data";
import { capabilityIsInternallyAvailable } from "@platform/product-catalog";
import { informationSubcategories, type SupportedLocale, type ThemeSelection } from "@platform/website-engine";
import { createOwnerPublicationDocument, publicationSlug } from "../../../lib/owner-publication";
import { passwordHash } from "../../../lib/site-admin-auth";
import { requireOwnerActionPermission, requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { platformConfig } from "../../../lib/platform-config";

export const dynamic = "force-dynamic";
const locales: SupportedLocale[] = ["de", "en", "fr", "es", "it", "sq"];
const themes: ThemeSelection[] = ["auto", "studio", "clarity", "forge", "gold"];
const messages: Record<string, string> = {
  created: "Publication created. The editor can sign in now.", invalid: "Check the publication name, URL, editor email and password (minimum 12 characters).",
  slug: "This publication URL is already in use.", email: "This editor email already belongs to another website account.", failed: "The publication could not be created. Please try again.",
};

export default async function OwnerPublicationsPage({ searchParams }: { searchParams: Promise<{ message?: string; slug?: string }> }) {
  await requireOwnerPagePermission("information.manage");
  if (!capabilityIsInternallyAvailable("information_news")) redirect("/owner");
  const query = await searchParams;
  async function createPublication(formData: FormData) {
    "use server";
    const owner = await requireOwnerActionPermission("publications.create");
    if (!capabilityIsInternallyAvailable("information_news")) redirect("/owner");
    const publicationName = String(formData.get("publicationName") ?? "").trim();
    const explicitSlug = publicationSlug(String(formData.get("slug") ?? ""));
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const tagline = String(formData.get("tagline") ?? "").trim();
    const locale = String(formData.get("locale") ?? "en") as SupportedLocale;
    const subcategory = String(formData.get("subcategory") ?? "news") as (typeof informationSubcategories)[number];
    const themeKey = String(formData.get("themeKey") ?? "auto") as ThemeSelection;
    if (!publicationName || !email.includes("@") || password.length < 12 || !locales.includes(locale) || !informationSubcategories.includes(subcategory) || !themes.includes(themeKey)) redirect("/owner/publications?message=invalid");
    try {
      const site = createOwnerPublicationDocument({ publicationName, slug: explicitSlug || undefined, tagline, locale, subcategory, themeKey });
      const result = await new PostgresInformationRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).createOwnerPublication({ site, email, passwordHash: await passwordHash(password), publicationName, tagline, subcategory, locale, themeKey });
      redirect(`/owner/publications?message=created&slug=${encodeURIComponent(result.slug)}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      redirect(`/owner/publications?message=${code.includes("slug_taken") ? "slug" : code.includes("email_taken") ? "email" : "failed"}`);
    }
  }
  const loginUrl = query.slug ? `/site-admin/${encodeURIComponent(query.slug)}/articles` : undefined;
  return <main className="owner-shell owner-operations-page">
    <header className="owner-header"><div><p className="eyebrow">Information sites</p><h1>Create a publication</h1><p className="owner-intro">Owner-only setup for News, Magazine and Information websites. It creates an active publication and one editorial administrator; it is not a business demo or subscription flow.</p></div><span className="secure-badge">OWNER</span></header>
    {query.message ? <p className={query.message === "created" ? "success" : "error"}>{messages[query.message] ?? messages.failed} {loginUrl ? <><Link href={loginUrl}>Open editorial CMS</Link> · <Link href={`/site/${encodeURIComponent(query.slug!)}`} target="_blank">Open public website</Link></> : null}</p> : null}
    <section className="workspace-card"><div className="section-heading"><div><p className="eyebrow">Publication setup</p><h2>Editor access is ready immediately</h2></div></div>
      <form action={createPublication} className="editorial-category-form">
        <div className="editor-grid two-columns"><label>Publication name<input name="publicationName" placeholder={platformConfig.products.information.name} required maxLength={160} /></label><label>Public URL slug<input name="slug" placeholder={platformConfig.products.information.slugExample} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} /><small>Optional. A safe URL is generated from the name if empty.</small></label></div>
        <label>Publication tagline<textarea name="tagline" rows={3} placeholder="Independent news and clear context for Albanian readers." maxLength={500} /></label>
        <div className="editor-grid two-columns"><label>Publication type<select name="subcategory" defaultValue="news">{informationSubcategories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Default language<select name="locale" defaultValue="sq">{locales.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label></div>
        <label>Visual theme<select name="themeKey" defaultValue="auto">{themes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="editor-grid two-columns"><label>Editorial administrator email<input name="email" type="email" placeholder="editor@example.com" required maxLength={320} /></label><label>Temporary password<input name="password" type="password" minLength={12} required /><small>Share it securely. The editor can change it from the normal site-admin panel.</small></label></div>
        <button className="button" type="submit">Create publication & editor access</button>
      </form>
    </section>
    <section className="workspace-card"><p className="eyebrow">Next steps</p><ol><li>Give the editor the standard sign-in URL: <code>/site-admin/login</code>.</li><li>The editor creates categories, articles and media in the CMS.</li><li>Later, REDI CONTROL connects through the isolated Information API; it never receives database access.</li></ol></section>
  </main>;
}
