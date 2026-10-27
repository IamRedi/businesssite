import { redirect } from "next/navigation";
import { PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { informationAdSlotKeys, informationSubcategories, type InformationSponsorBanner, type SupportedLocale, type ThemeSelection } from "@platform/website-engine";
import { EditorialAdminNav } from "../../../../components/editorial-admin-nav";
import { EditorialMediaField } from "../../../../components/editorial-media-field";
import { editorialCopy, type EditorialCopy } from "../../../../lib/editorial-copy";
import { informationAdCopy } from "../../../../lib/information-ad-copy";
import { formText, navigationFromText } from "../../../../lib/editorial-form";
import { getEditorialAccess, hasEditorialPermission } from "../../../../lib/editorial-auth";
import { expirePublicSiteAfterMutationById } from "../../../../lib/public-site-cache";
import { requireSiteAdmin } from "../../../../lib/site-admin-auth";

const locales: SupportedLocale[] = ["de", "en", "fr", "es", "it", "sq"];
const themes: ThemeSelection[] = ["auto", "studio", "clarity", "forge", "gold"];

type SponsorAsset = { id: string; publicUrl: string | null; storageKey: string; altText: string | null };

function SponsorBannerForm({ slug, banner, assets, copy, uploadCopy, action }: {
  slug: string;
  banner?: InformationSponsorBanner;
  assets: SponsorAsset[];
  copy: typeof informationAdCopy[SupportedLocale];
  uploadCopy: EditorialCopy["upload"];
  action: (formData: FormData) => Promise<void>;
}) {
  return <form action={action} className="editorial-sponsor-form">
    {banner ? <><input type="hidden" name="bannerId" value={banner.id} /><input type="hidden" name="version" value={banner.version} /></> : null}
    <div className="editor-grid two-columns">
      <label>{copy.sponsor.name}<input name="sponsorName" defaultValue={banner?.sponsorName} maxLength={160} required /></label>
      <label>{copy.sponsor.headline}<input name="headline" defaultValue={banner?.headline} maxLength={200} required /></label>
    </div>
    <label>{copy.sponsor.description}<textarea name="description" defaultValue={banner?.description} maxLength={300} rows={2} /></label>
    <div className="editor-grid two-columns">
      <label>{copy.sponsor.action}<input name="callToAction" defaultValue={banner?.callToAction ?? "Shiko biznesin"} maxLength={60} required /></label>
      <label>{copy.sponsor.url}<input name="destinationUrl" type="url" pattern="https://.*" defaultValue={banner?.destinationUrl} maxLength={2048} placeholder="https://example.com" required /></label>
    </div>
    <div className="editor-grid two-columns">
      <label>{copy.sponsor.position}<select name="slotKey" defaultValue={banner?.slotKey ?? "home_after_featured"}>{informationAdSlotKeys.map((key) => <option key={key} value={key}>{copy.slots[key]}</option>)}</select></label>
      <label>{copy.sponsor.order}<input name="sortOrder" type="number" min="0" max="1000" defaultValue={banner?.sortOrder ?? 0} required /></label>
    </div>
    <div className="editorial-field"><span className="editorial-field-label">{copy.sponsor.image}</span><EditorialMediaField slug={slug} assets={assets} initialId={banner?.imageMediaId} articleMediaLabel="" copy={uploadCopy} inputName="imageMediaId" showGallery={false} /></div>
    <label className="editorial-ad-toggle"><input name="enabled" type="checkbox" defaultChecked={banner?.enabled ?? false} />{copy.sponsor.active}</label>
    <button className="button" type="submit">{banner ? copy.sponsor.save : copy.sponsor.add}</button>
  </form>;
}

export default async function EditorialSettingsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { slug } = await params;
  if (!(await requireSiteAdmin(slug))) redirect("/site-admin/login");
  const access = await getEditorialAccess(slug);
  if (!access?.can("settings:manage")) redirect(`/site-admin/${slug}/articles?message=error`);
  const repository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash: access.sessionHash });
  const settings = await repository.getSettings(access.siteId);
  if (!settings) redirect(`/site-admin/${slug}?editorial=unavailable`);
  const categories = await repository.listCategories(access.siteId);
  const [banners, assets] = await Promise.all([repository.listSponsorBanners(access.siteId), repository.listMediaAssets(access.siteId)]);
  const copy = editorialCopy[settings.locale];
  const adCopy = informationAdCopy[settings.locale];
  const { message } = await searchParams;

  async function saveSettings(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "settings:manage");
    if (!current) redirect(`/site-admin/${slug}/articles?message=error`);
    try {
      const navigation = navigationFromText(formText(formData, "navigation"));
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).configureSite({
        actorType: "site_admin",
        actorId: current.accountId,
        siteId: current.siteId,
        publicationName: formText(formData, "publicationName"),
        tagline: formText(formData, "tagline"),
        subcategory: formText(formData, "subcategory") as (typeof informationSubcategories)[number],
        locale: formText(formData, "locale") as SupportedLocale,
        themeKey: formText(formData, "themeKey") as ThemeSelection,
        navigation,
      });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/editorial?message=error`);
    }
    redirect(`/site-admin/${slug}/editorial?message=settingsSaved`);
  }

  async function createCategory(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "category:manage");
    if (!current) redirect(`/site-admin/${slug}/editorial?message=error`);
    try {
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).createCategory({
        actorType: "site_admin",
        actorId: current.accountId,
        siteId: current.siteId,
        name: formText(formData, "name"),
        slug: formText(formData, "slug"),
        description: formText(formData, "description"),
        sortOrder: Number(formText(formData, "sortOrder") || 0),
      });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/editorial?message=error`);
    }
    redirect(`/site-admin/${slug}/editorial?message=categoryCreated`);
  }

  async function saveSponsorBanner(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "settings:manage");
    if (!current) redirect(`/site-admin/${slug}/articles?message=error`);
    try {
      const bannerId = formText(formData, "bannerId");
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).saveSponsorBanner({
        actorType: "site_admin", actorId: current.accountId, siteId: current.siteId,
        ...(bannerId ? { id: bannerId, expectedVersion: Number(formText(formData, "version")) } : {}),
        slotKey: formText(formData, "slotKey") as (typeof informationAdSlotKeys)[number],
        sponsorName: formText(formData, "sponsorName"),
        headline: formText(formData, "headline"),
        description: formText(formData, "description"),
        callToAction: formText(formData, "callToAction"),
        destinationUrl: formText(formData, "destinationUrl"),
        imageMediaId: formText(formData, "imageMediaId") || null,
        enabled: formData.get("enabled") === "on",
        sortOrder: Number(formText(formData, "sortOrder")),
      });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/editorial?message=sponsorError#sponsors`);
    }
    redirect(`/site-admin/${slug}/editorial?message=sponsorSaved#sponsors`);
  }

  const messageKey = message as keyof typeof copy.messages | undefined;
  return <main className="owner-shell site-admin-shell editorial-cms-shell">
    <header className="detail-header"><div><p className="eyebrow">{copy.settings.eyebrow}</p><h1>{copy.settings.title}</h1><p>{copy.settings.intro}</p></div><EditorialAdminNav slug={slug} copy={copy} canManageSettings /></header>
    {messageKey && copy.messages[messageKey] ? <p className="editorial-notice">{copy.messages[messageKey]}</p> : null}
    <div className="editorial-settings-grid">
      <form id="identity" action={saveSettings} className="workspace-card editorial-form-section">
        <label>{copy.settings.publicationName}<input name="publicationName" defaultValue={settings.publicationName} required /></label>
        <label>{copy.settings.tagline}<textarea name="tagline" defaultValue={settings.tagline} rows={3} /></label>
        <div className="editor-grid two-columns"><label>{copy.settings.subcategory}<select name="subcategory" defaultValue={settings.subcategory}>{informationSubcategories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>{copy.settings.locale}<select name="locale" defaultValue={settings.locale}>{locales.map((locale) => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}</select></label></div>
        <label>{copy.settings.theme}<select name="themeKey" defaultValue={settings.themeKey}>{themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select></label>
        <label>{copy.settings.navigation}<textarea name="navigation" defaultValue={JSON.stringify(settings.navigation, null, 2)} rows={8} /><small>{copy.settings.navigationHelp}</small></label>
        <button className="button" type="submit">{copy.settings.save}</button>
      </form>
      <section className="workspace-card editorial-category-panel"><p className="eyebrow">{copy.settings.categories}</p><h2>{copy.settings.categories}</h2><p>{copy.settings.categoriesIntro}</p>
        <div className="editorial-category-list">{categories.length ? categories.map((category) => <div key={category.id}><strong>{category.name}</strong><span>/{category.slug}</span></div>) : <p>{copy.settings.noCategories}</p>}</div>
        <form action={createCategory} className="editorial-category-form"><label>{copy.settings.categoryName}<input name="name" required /></label><label>{copy.settings.categorySlug}<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>{copy.settings.categoryDescription}<textarea name="description" rows={3} /></label><label>{copy.settings.categoryOrder}<input name="sortOrder" type="number" defaultValue="0" /></label><button className="button secondary" type="submit">{copy.settings.addCategory}</button></form>
      </section>
    </div>
    <section id="sponsors" className="workspace-card editorial-sponsor-settings">
      <p className="eyebrow">{adCopy.eyebrow}</p><h2>{adCopy.sponsor.title}</h2><p>{adCopy.sponsor.intro}</p>
      {message === "sponsorError" ? <p className="editorial-notice error">{adCopy.sponsor.error}</p> : null}
      {message === "sponsorSaved" ? <p className="editorial-notice">{adCopy.sponsor.saved}</p> : null}
      <div className="editorial-sponsor-list">{banners.length ? banners.map((banner) => <details key={banner.id} className="editorial-sponsor-card"><summary><strong>{banner.sponsorName}</strong><span>{adCopy.slots[banner.slotKey]} · {banner.enabled ? adCopy.sponsor.active : "—"}</span></summary><SponsorBannerForm slug={slug} banner={banner} assets={assets} copy={adCopy} uploadCopy={copy.upload} action={saveSponsorBanner} /></details>) : <p>{adCopy.sponsor.empty}</p>}</div>
      <details className="editorial-sponsor-card editorial-sponsor-new"><summary><strong>+ {adCopy.sponsor.add}</strong></summary><SponsorBannerForm slug={slug} assets={assets} copy={adCopy} uploadCopy={copy.upload} action={saveSponsorBanner} /></details>
    </section>
  </main>;
}
