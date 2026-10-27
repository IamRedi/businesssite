import Link from "next/link";
import type { ReactNode } from "react";
import { createHash } from "node:crypto";
import { SiteAdminCustomProvider, SiteAdminPrices, SiteAdminMedia, SiteAdminLivePreview } from "../../../components/site-admin-custom-editor";
import "./premium-admin.css";
import { BookingAdminPanel } from "../../../components/booking-admin-panel";
import { SiteAdminPreview } from "../../../components/site-admin-preview";
import { SiteAdminOverview } from "../../../components/site-admin-overview";
import { redirect } from "next/navigation";
import { bookingAdminSnapshot, PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { customerPublicLegalIdentityMissingFields, designPresets, type OpeningHour, type SiteDocument } from "@platform/website-engine";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../lib/site-admin-auth";
import { ImageUploadField } from "../../../components/image-upload-field";
import { AiRewriteField } from "../../../components/ai-rewrite-field";
import { CopyDomainValue } from "../../../components/copy-domain-value";
import { SiteEditorTabs } from "../../../components/site-editor-tabs";
import { SitePreview } from "../../../components/site-preview";
import { BusinessAdminThemeToggle } from "../../../components/business-admin-theme-toggle";
import { getEditorialAccess } from "../../../lib/editorial-auth";
import {
  inspectHostingDomain,
  prepareHostingDomain,
  storedHostingDomainSetup,
} from "../../../lib/hosting-domains";
import { configuredDomainRegistrar } from "../../../lib/domain-purchase";
import { configuredDomainSetupCopy } from "../../../lib/domain-setup-copy";
import { platformConfig } from "../../../lib/platform-config";
import { previewToken } from "../../../lib/preview-token";
import { contactEditorCopy, coreEditorCopy, designEditorCopy, formatSiteAdminDate, mediaEditorCopy, siteAdminPageCopy } from "../../../lib/site-editor-copy";
import { expirePublicSiteAfterMutation } from "../../../lib/public-site-cache";
import { trustedCustomerDomainHost } from "../../../lib/host-security";
import { applySiteEditorUpdate, legalIdentityPublicationBlocked } from "../../../lib/site-editor-update";
import { stripeClient } from "../../../lib/stripe";
import { createStarterPortalSession } from "../../../lib/stripe-portal";
import { authorizedSiteCapability } from "../../../lib/product-access";
import { customerLifecycleCopy, lifecycleMessage } from "../../../lib/customer-lifecycle-copy";
import { formatCustomerDateTime } from "../../../lib/locale-format";

const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
function CustomEditorBoundary({ site, children }: { site: SiteDocument; children: ReactNode }) {
  if (!site.customDesign || !site.customMedia) return children;
  return <SiteAdminCustomProvider key={createHash("sha256").update(JSON.stringify(site)).digest("hex")} initialSite={site}>{children}</SiteAdminCustomProvider>;
}
export default async function SiteAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ domain?: string; password?: string; legal?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const authenticatedAccount = await requireSiteAdmin(slug);
  if (!authenticatedAccount) redirect("/site-admin/login");
  const siteId = authenticatedAccount.siteId;
  const sessionHash = trustedSiteAdminSessionHash(authenticatedAccount);
  const sites = new PostgresSiteRepository({ boundary: "site_admin", sessionHash });
  const previewRepository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash });
  const dashboard = await sites.getBusinessAdminDashboard(sessionHash, slug);
  const editorialRepository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash });
  // The Information repository deliberately rejects business-site contexts.
  // Resolve the exact business projection first and enter the editorial
  // boundary only when this authenticated site is not a business site.
  const editorialSettings = dashboard
    ? null
    : await editorialRepository.getSettings(siteId);
  if (editorialSettings) {
    const editorialAccess = await getEditorialAccess(slug);
    if (!editorialAccess?.can("article:read")) redirect("/site-admin/login");
    const repository = editorialRepository;
    const recent = await repository.listArticles(siteId, { limit: 8 });
    const draftCount = recent.items.filter((article) => article.status === "draft").length;
    const pendingCount = recent.items.filter((article) => article.status === "pending").length;
    const publishedCount = recent.items.filter((article) => article.status === "published").length;
    const language = editorialSettings.locale === "sq" ? "Shqip" : editorialSettings.locale.toUpperCase();
    const editorialPageCopy = siteAdminPageCopy[authenticatedAccount.preferredLocale];
    const editorialDashboard = authenticatedAccount.preferredLocale === "de" ? {
      tagline: "Website, Artikel und Veröffentlichung an einem Ort verwalten.", openSite: "Website öffnen", publicSite: "Ihre öffentliche Website", publicBody: "Dies ist die Übersicht. Artikel beginnen als Entwurf und werden erst nach Ihrer Prüfung veröffentlicht.",
      articles: "Artikel", articlesBody: "Nachrichten erstellen, als Entwurf speichern, prüfen und veröffentlichen.", review: "Zur Prüfung", published: "Veröffentlicht", newArticle: "Neuer Artikel", allArticles: "Alle Artikel",
      identity: "Erscheinungsbild und Identität", identityBody: "Name, Untertitel, Inhaltssprache, Theme und Kategorien verwalten. Bilder werden im jeweiligen Artikel hinzugefügt.", language: "Sprache", theme: "Theme", editSettings: "Einstellungen ändern",
      advertising: "Werbung", advertisingBody: "Sponsorenbanner mit Bild und direktem Link anlegen und bei Bedarf aktivieren.", manageAdvertising: "Banner verwalten", recent: "Neu", recentArticles: "Neueste Artikel", openList: "Liste öffnen", noSummary: "Keine Zusammenfassung", empty: "Noch keine Artikel. Erstellen Sie den ersten Entwurf, sobald eine verifizierte Quelle vorliegt.",
    } : {
      tagline: "Manage the website, articles and publication in one place.", openSite: "Open website", publicSite: "Your public website", publicBody: "This is the overview. Articles start as drafts and are published only after you review them.",
      articles: "Articles", articlesBody: "Create, save as draft, review and publish news.", review: "For review", published: "Published", newArticle: "New article", allArticles: "All articles",
      identity: "Appearance and identity", identityBody: "Manage the name, subtitle, content language, theme and categories. Images are added to the relevant article.", language: "Language", theme: "Theme", editSettings: "Edit settings",
      advertising: "Advertising", advertisingBody: "Add sponsor banners with images and direct links, then activate them when ready.", manageAdvertising: "Manage banners", recent: "Recent", recentArticles: "Recent articles", openList: "Open list", noSummary: "No summary", empty: "No articles yet. Create the first draft when you have a verified source.",
    };
    return <main className="owner-shell site-admin-shell editorial-cms-shell publication-dashboard">
      <header className="detail-header">
        <div><p className="eyebrow">Editorial CMS</p><h1>{editorialSettings.publicationName}</h1><p>{editorialSettings.tagline || editorialDashboard.tagline}</p></div>
        <nav className="detail-nav" aria-label="Menaxhimi i publikimit">
          <Link className="button secondary compact" href={`/site/${slug}`} target="_blank">{editorialDashboard.openSite}</Link>
          <Link className="button secondary compact" href={`/site-admin/${slug}/privacy`}>{authenticatedAccount.preferredLocale === "de" ? "Datenexport" : "Data export"}</Link>
          <Link className="button compact" href={`/site-admin/${slug}/articles/new`}>{editorialDashboard.newArticle}</Link>
          <form action="/api/site-admin/logout" method="post"><button className="button secondary compact" type="submit">{editorialPageCopy.security.logout}</button></form>
        </nav>
      </header>
      <section className="publication-dashboard-intro workspace-card">
        <div><span>01</span><h2>{editorialDashboard.publicSite}</h2><p>{editorialDashboard.publicBody}</p></div>
        <Link className="button secondary compact" href={`/site/${slug}`} target="_blank">{editorialDashboard.openSite} →</Link>
      </section>
      <section className="publication-dashboard-grid">
        <article className="workspace-card publication-dashboard-card"><span>02</span><h2>{editorialDashboard.articles}</h2><p>{editorialDashboard.articlesBody}</p><dl><div><dt>Draft</dt><dd>{draftCount}</dd></div><div><dt>{editorialDashboard.review}</dt><dd>{pendingCount}</dd></div><div><dt>{editorialDashboard.published}</dt><dd>{publishedCount}</dd></div></dl><div><Link className="button compact" href={`/site-admin/${slug}/articles/new`}>{editorialDashboard.newArticle}</Link><Link className="button secondary compact" href={`/site-admin/${slug}/articles`}>{editorialDashboard.allArticles}</Link></div></article>
        <article className="workspace-card publication-dashboard-card"><span>03</span><h2>{editorialDashboard.identity}</h2><p>{editorialDashboard.identityBody}</p><dl><div><dt>{editorialDashboard.language}</dt><dd>{language}</dd></div><div><dt>{editorialDashboard.theme}</dt><dd>{editorialSettings.themeKey}</dd></div></dl><Link className="button secondary compact" href={`/site-admin/${slug}/editorial#identity`}>{editorialDashboard.editSettings}</Link></article>
        <article className="workspace-card publication-dashboard-card"><span>04</span><h2>{editorialDashboard.advertising}</h2><p>{editorialDashboard.advertisingBody}</p><Link className="button secondary compact" href={`/site-admin/${slug}/editorial#sponsors`}>{editorialDashboard.manageAdvertising}</Link></article>
      </section>
      <section className="workspace-card publication-recent-articles"><div className="editor-section-heading"><div><p className="eyebrow">{editorialDashboard.recent}</p><h2>{editorialDashboard.recentArticles}</h2></div><Link className="button secondary compact" href={`/site-admin/${slug}/articles`}>{editorialDashboard.openList}</Link></div>{recent.items.length ? <div className="publication-recent-list">{recent.items.slice(0, 5).map((article) => <Link key={article.id} href={`/site-admin/${slug}/articles/${article.id}`}><span className={`article-status ${article.status}`}>{article.status}</span><strong>{article.title}</strong><small>{article.excerpt || editorialDashboard.noSummary}</small></Link>)}</div> : <p className="editor-hint">{editorialDashboard.empty}</p>}</section>
    </main>;
  }
  const rawSite = dashboard?.site;
  const site = rawSite
    ? {
        ...rawSite,
        media: {
          ...rawSite.media,
          serviceImageUrls:
            rawSite.media.serviceImageUrls ??
            [],
        },
      }
    : null;
  if (!site) redirect("/site-admin/login");
  const locale = authenticatedAccount.preferredLocale;
  const contactCopy = contactEditorCopy[locale];
  const mediaCopy = mediaEditorCopy[locale];
  const designCopy = designEditorCopy[locale];
  const coreCopy = coreEditorCopy[locale];
  const pageCopy = siteAdminPageCopy[locale];
  const lifecycleCopy = customerLifecycleCopy[locale];
  const domainCopy = configuredDomainSetupCopy(locale, platformConfig.brand.name);
  const registrar = configuredDomainRegistrar();
  const resolvedSiteId = siteId;
  const access = dashboard!.access;
  const appointments = dashboard!.appointments;
  const canUseCustomDomain = await sites.hasCapabilityAccess(siteId, "custom_domain_existing");
  const domainSetup = storedHostingDomainSetup(access?.customDomainVerification);
  const privatePreviewUrl = access?.activatedAt
    ? `/site/${slug}`
    : access?.subscription.state === "full"
      ? `/preview/${previewToken(await previewRepository.getOrCreatePreviewTokenId(siteId))}`
      : `/site-admin/${slug}`;
  const missingLegalFields = customerPublicLegalIdentityMissingFields(site);
  const legalLabelFor = (field: (typeof missingLegalFields)[number]) => {
    const legalLabelIndexes = {
      legalBusinessName: 0, street: 3, postalCode: 4, city: 5,
      countryCode: 6, contactEmail: 7, privacyNoticeUrl: 11,
    } as const;
    return lifecycleCopy.editor.legalLabels[legalLabelIndexes[field]];
  };
  const openingHours: OpeningHour[] = site.contact.openingHours ?? [
    { day: "monday", open: "09:00", close: "18:00" },
    { day: "tuesday", open: "09:00", close: "18:00" },
    { day: "wednesday", open: "09:00", close: "18:00" },
    { day: "thursday", open: "09:00", close: "18:00" },
    { day: "friday", open: "09:00", close: "18:00" },
    { day: "saturday", open: "09:00", close: "14:00" },
    { day: "sunday", closed: true },
  ];

  async function save(formData: FormData) {
    "use server";
    const authenticated = await requireSiteAdmin(slug);
    if (!authenticated) redirect("/site-admin/login");
    const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(authenticated) });
    const currentSiteId = await authorizedSiteCapability(repository, authenticated, slug, "editor");
    if (!currentSiteId)
      redirect(`/site-admin/${slug}?mutation=unavailable`);
    const current = (await repository.getStoredBySlug(slug)) as SiteDocument;
    const { section, document } = applySiteEditorUpdate(current, formData);
    if (section === "contact" && legalIdentityPublicationBlocked(current, document, access?.activatedAt))
      redirect(`/site-admin/${slug}?legal=blocked#contact`);
    await repository.updateDocumentForAuthenticatedSession(
      trustedSiteAdminSessionHash(authenticated), slug, document, section,
    );
    expirePublicSiteAfterMutation({ kind: "slug", value: slug });
    if (access?.customDomain)
      expirePublicSiteAfterMutation({ kind: "domain", value: access.customDomain });
    redirect(`/site-admin/${slug}?saved=1#${section}`);
  }
  async function saveDomain(formData: FormData) {
    "use server";
    const authenticated = await requireSiteAdmin(slug);
    if (!authenticated) redirect("/site-admin/login");
    const rawDomain = value(formData, "customDomain");
    const domain = rawDomain.includes(":") ? null : trustedCustomerDomainHost(rawDomain);
    if (!domain) redirect(`/site-admin/${slug}?domain=invalid`);
    const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(authenticated) });
    const domainAuthorization = await repository.prepareCustomDomainChange(slug);
    if (!domainAuthorization || domainAuthorization.siteId !== authenticated.siteId)
      redirect(`/site-admin/${slug}?domain=unavailable`);
    const currentSiteId = domainAuthorization.siteId;
    try {
      const setup = await prepareHostingDomain(domain, currentSiteId);
      await repository.updateCustomDomain(currentSiteId, domain, { ...setup, ready: false });
      if (setup.ready)
        await repository.setCustomDomainVerification(currentSiteId, "verified", setup, domain);
      if (domainAuthorization.currentDomain)
        expirePublicSiteAfterMutation({ kind: "domain", value: domainAuthorization.currentDomain });
      expirePublicSiteAfterMutation({ kind: "domain", value: domain });
    } catch {
      redirect(`/site-admin/${slug}?domain=provider_error`);
    }
    redirect(`/site-admin/${slug}?domain=requested`);
  }
  async function verifyDomain() {
    "use server";
    const authenticated = await requireSiteAdmin(slug);
    if (!authenticated) redirect("/site-admin/login");
    const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(authenticated) });
    const domainAuthorization = await repository.prepareCustomDomainChange(slug);
    if (!domainAuthorization || domainAuthorization.siteId !== authenticated.siteId)
      redirect(`/site-admin/${slug}?domain=unavailable`);
    const currentSiteId = domainAuthorization.siteId;
    const currentDomain = domainAuthorization.currentDomain;
    if (!currentDomain) redirect(`/site-admin/${slug}?domain=invalid`);
    let ready = false;
    try {
      const verification = await inspectHostingDomain(currentDomain, currentSiteId);
      await repository.setCustomDomainVerification(
        currentSiteId,
        verification.ready ? "verified" : "pending_dns",
        verification,
        currentDomain,
      );
      expirePublicSiteAfterMutation({ kind: "domain", value: currentDomain });
      ready = verification.ready;
    } catch {
      await repository.setCustomDomainVerification(currentSiteId, "failed", {}, currentDomain);
      expirePublicSiteAfterMutation({ kind: "domain", value: currentDomain });
      redirect(`/site-admin/${slug}?domain=provider_error`);
    }
    redirect(`/site-admin/${slug}?domain=${ready ? "verified" : "pending"}`);
  }
  async function manageBilling() {
    "use server";
    const authenticated = await requireSiteAdmin(slug);
    if (!authenticated) redirect("/site-admin/login");
    const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(authenticated) });
    const currentSiteId = await repository.getSiteIdBySlug(slug);
    if (!currentSiteId || currentSiteId !== authenticated.siteId) redirect(`/site-admin/${slug}?billing=unavailable`);
    const identity = await repository.getSubscriptionBillingIdentity(
      currentSiteId,
      trustedSiteAdminSessionHash(authenticated),
    );
    if (!identity?.providerCustomerId || identity.portalAllowed === false)
      redirect(`/site-admin/${slug}?billing=unavailable`);
    let portalUrl = "";
    try {
      const baseUrl = process.env.PUBLIC_APP_URL?.trim();
      if (!baseUrl) throw new Error("Stripe portal is unavailable.");
      const session = await createStarterPortalSession({
        billingProvider: identity.billingProvider,
        planKey: identity.planKey,
        stripeCustomerId: identity.stripeCustomerId,
        returnUrl: `${new URL(baseUrl).origin}/site-admin/${encodeURIComponent(slug)}`,
      }, (params) => stripeClient().billingPortal.sessions.create(params));
      portalUrl = session.url;
    } catch {
      redirect(`/site-admin/${slug}?billing=unavailable`);
    }
    redirect(portalUrl);
  }

  const lifecycle = access!.subscription;
  if (lifecycle.state === "read_only" || lifecycle.state === "expired_trial" || lifecycle.state === "locked" || lifecycle.state === "never_activated") {
    const canReadContent = lifecycle.canReadCustomerContent;
    const deadline = lifecycle.readOnlyEndsAt || lifecycle.trialRecoveryEndsAt;
    const stateCopy = lifecycleMessage(locale, lifecycle.state, deadline ? formatCustomerDateTime(locale, deadline) : undefined);
    return <main className="owner-shell site-admin-shell business-admin-shell" data-business-admin-theme="light">
      <header className="detail-header">
        <div><p className="eyebrow">{lifecycleCopy.lifecycle.accountAccess}</p><h1>{site.content.name}</h1><p>{stateCopy.body}</p></div>
        <form action="/api/site-admin/logout" method="post"><button className="button secondary compact" type="submit">{pageCopy.security.logout}</button></form>
      </header>
      <section className="workspace-card">
        <h2>{stateCopy.title}</h2>
        <p>{stateCopy.body}</p>
        <div className="trial-actions">
          {access?.activatedAt && lifecycle.canOpenBillingRecovery ? <form action={manageBilling}><button className="button secondary" type="submit">{lifecycleCopy.lifecycle.billingRecovery}</button></form> : null}
          {lifecycle.canReactivate ? <Link className="button" href={`/subscribe?demo=${encodeURIComponent(slug)}`}>{lifecycleCopy.lifecycle.reactivate}</Link> : null}
        </div>
      </section>
      {canReadContent ? <section className="workspace-card"><h2>{lifecycleCopy.lifecycle.savedContent}</h2><p>{lifecycleCopy.lifecycle.savedContentBody}</p><div className="business-admin-preview-document"><SitePreview site={site} /></div></section> : null}
      <section className="workspace-card">
        <h2>{pageCopy.security.title}</h2>
        <form action={`/api/site-admin/${encodeURIComponent(slug)}/password`} method="post" className="admin-login">
          <input name="currentPassword" type="password" autoComplete="current-password" placeholder={pageCopy.security.currentPlaceholder} required />
          <input name="newPassword" type="password" autoComplete="new-password" minLength={12} placeholder={pageCopy.security.placeholder} required />
          <button className="button secondary" type="submit">{pageCopy.security.submit}</button>
        </form>
      </section>
    </main>;
  }

  const booking = await bookingAdminSnapshot(siteId, sessionHash);
  // Authenticated, uncached server request: capture once and serialize for the overview.
  // eslint-disable-next-line react-hooks/purity -- request-time filtering in a Server Component
  const observedAt = Date.now();
  const bookingIds = new Set(booking?.appointments.map(item => item.id) ?? []);
  const legacyAppointments = appointments.filter(item => !bookingIds.has(item.id));

  return (
    <main className="owner-shell site-admin-shell business-admin-shell premium-admin" data-business-admin-theme="light">
      {lifecycle.state === "payment_grace" ? (() => { const message = lifecycleMessage(locale, "payment_grace", lifecycle.graceEndsAt ? formatCustomerDateTime(locale, lifecycle.graceEndsAt) : undefined); return <section className="workspace-card" role="status"><strong>{message.title}</strong><p>{message.body}</p></section>; })() : null}
      {query.legal === "blocked" ? <section className="workspace-card" role="alert"><strong>{lifecycleCopy.editor.legalSaveBlocked}</strong></section> : null}
      {missingLegalFields.length ? (
        <section className="workspace-card" role="status">
          <strong>{lifecycleCopy.editor.legalIncompleteTitle}</strong>
          <p>{lifecycleCopy.editor.legalIncompleteBody}</p>
          <p>{lifecycleCopy.editor.legalIncompleteMissing}: {missingLegalFields.map((field) => legalLabelFor(field)).join(", ")}</p>
        </section>
      ) : null}
      <div className="business-admin-canvas">
      <CustomEditorBoundary site={site}>
      <SiteEditorTabs
        locale={locale}
        businessName={site.content.name}
        websiteUrl={privatePreviewUrl}
        overview={<SiteAdminOverview key="overview" name={site.content.name} active={Boolean(access?.activatedAt) && missingLegalFields.length === 0} websiteUrl={privatePreviewUrl} booking={booking} locale={locale} now={observedAt} />}
        navigationLabel={pageCopy.navigation}
        sidebarFooter={(
          <div key="account" className="business-admin-sidebar-footer">
            <BusinessAdminThemeToggle />
            <strong>{site.content.name}</strong>
            <span>{access?.activatedAt ? pageCopy.trial.activeBody : pageCopy.trial.ends(formatSiteAdminDate(locale, new Date(access!.demoExpiresAt)))}</span>
            {!access?.activatedAt ? <Link className="business-admin-subscribe" href={`/subscribe?demo=${slug}`}>{pageCopy.trial.subscribe}</Link> : <form action={manageBilling}><button type="submit">{pageCopy.trial.manage}</button></form>}
            <form action="/api/site-admin/logout" method="post"><button type="submit">{pageCopy.security.logout}</button></form>
          </div>
        )}
        panels={{
          identity: (
            <form key="identity" action={save} className="site-editor-section-form">
              <input type="hidden" name="activeSection" value="identity" />
              <div className="editor-section-heading"><div><p className="eyebrow">{coreCopy.identity[0]}</p><h2>{coreCopy.identity[1]}</h2></div><p>{coreCopy.identity[2]}</p></div>
              <label>{coreCopy.identity[1]}<input name="name" defaultValue={site.content.name} required /></label>
              <button className="button" type="submit">{coreCopy.identity[3]}</button>
            </form>
          ),
          content: (
            <form key="content" action={save} className="site-editor-section-form content-section">
              <input type="hidden" name="activeSection" value="content" />
              <div className="editor-section-heading"><div><p className="eyebrow">{coreCopy.content[0]}</p><h2>{coreCopy.content[1]}</h2></div><p>{coreCopy.content[2]}</p></div>
              <div className="editor-grid two-columns">
                <label>{coreCopy.content[3]}<input name="heroTitle" defaultValue={site.content.heroTitle} /></label>
                <AiRewriteField slug={slug} name="heroSubtitle" label={coreCopy.content[4]} initialValue={site.content.heroSubtitle} field="heroSubtitle" locale={site.locale} aiEnabled={lifecycle.canUseAi} />
                <label>{coreCopy.content[5]}<input name="aboutTitle" defaultValue={site.content.aboutTitle} /></label>
                <AiRewriteField slug={slug} name="aboutBody" label={coreCopy.content[6]} initialValue={site.content.aboutBody} field="aboutBody" locale={site.locale} aiEnabled={lifecycle.canUseAi} />
                <label>{coreCopy.content[7]}<input name="servicesTitle" defaultValue={site.content.servicesTitle} /></label>
                <label>{coreCopy.content[8]}<input name="contactTitle" defaultValue={site.content.contactTitle} /></label>
              </div>
              <button className="button" type="submit">{coreCopy.content[9]}</button>
            </form>
          ),
          services: (
            <div key="services-panel">{site.customDesign && site.priceList ? <SiteAdminPrices /> : null}
            <details className="premium-disclosure" open={!site.priceList}><summary>{site.priceList ? "Leistungstexte" : coreCopy.services[1]}</summary>
            <form key="services" action={save} className="site-editor-section-form">
              <input type="hidden" name="activeSection" value="services" />
              <div className="editor-section-heading"><div><p className="eyebrow">{coreCopy.services[0]}</p><h2>{coreCopy.services[1]}</h2></div><p>{coreCopy.services[2]}</p></div>
              <div className="editor-grid">
                {site.services.map((service: SiteDocument["services"][number], index: number) => (
                  <div key={index}><h3>{coreCopy.services[1]} {index + 1}</h3><label>{coreCopy.services[3]}<input name={`service${index}Title`} defaultValue={service.title} /></label><AiRewriteField slug={slug} name={`service${index}Description`} label={coreCopy.services[4]} initialValue={service.description} field="serviceDescription" locale={site.locale} aiEnabled={lifecycle.canUseAi} /></div>
                ))}
              </div>
              <button className="button" type="submit">{coreCopy.services[5]}</button>
            </form></details></div>
          ),
          media: site.customDesign && site.customMedia ? (
            <SiteAdminMedia key="custom-media" editable={lifecycle.canUploadMedia} />
          ) : lifecycle.canUploadMedia ? (
            <form key="media" action={save} className="site-editor-section-form">
              <input type="hidden" name="activeSection" value="media" />
              <div className="editor-section-heading"><div><p className="eyebrow">{mediaCopy.eyebrow}</p><h2>{mediaCopy.title}</h2></div><p>{mediaCopy.intro}</p></div>
              <div className="editor-grid two-columns"><div className="editor-logo-control"><ImageUploadField slug={slug} name="logoUrl" label={mediaCopy.logo} initialValue={site.media.logoUrl} /><p className="editor-hint">{mediaCopy.logoHint}</p><fieldset className="logo-shape-options"><legend>{mediaCopy.logoShape}</legend><label><input type="radio" name="logoShape" value="rounded" defaultChecked={(site.media.logoShape ?? "rounded") === "rounded"} /><span className="logo-shape-swatch rounded" />{mediaCopy.rounded}</label><label><input type="radio" name="logoShape" value="circle" defaultChecked={site.media.logoShape === "circle"} /><span className="logo-shape-swatch circle" />{mediaCopy.circle}</label></fieldset></div><ImageUploadField slug={slug} name="heroImageUrl" label={mediaCopy.hero} initialValue={site.media.heroImageUrl} /></div>
              <h3 className="editor-subheading">{mediaCopy.services}</h3>
              <div className="editor-grid">{site.services.map((_: SiteDocument["services"][number], index: number) => <ImageUploadField key={index} slug={slug} name={`serviceImage${index}`} label={mediaCopy.serviceImage(index + 1)} initialValue={site.media.serviceImageUrls[index]} />)}</div>
              <h3 className="editor-subheading">{mediaCopy.gallery}</h3>
              <div className="editor-grid">{[0, 1, 2].map((index) => <ImageUploadField key={index} slug={slug} name={`gallery${index}`} label={mediaCopy.galleryImage(index + 1)} initialValue={site.media.galleryImageUrls[index]} />)}</div>
              <button className="button" type="submit">{mediaCopy.save}</button>
            </form>
          ) : <section key="media-paused" className="site-editor-section-form"><h2>{mediaCopy.title}</h2><p>{lifecycleCopy.editor.mediaPaused}</p></section>,
          design: !site.customDesign ? (
            <form key="design" action={save} className="site-editor-section-form design-section">
              <input type="hidden" name="activeSection" value="design" />
              <div className="editor-section-heading"><div><p className="eyebrow">{designCopy.eyebrow}</p><h2>{designCopy.title}</h2></div><p>{designCopy.intro}</p></div>
              <div className="theme-options">{designPresets.map((option) => { const preset = designCopy.presets[option.key]; return <label key={option.key} className={site.themeKey === option.key ? "active" : ""}><input type="radio" name="themeKey" value={option.key} defaultChecked={site.themeKey === option.key} /><strong>{preset.name}</strong><small>{preset.detail}</small></label>; })}</div>
              <button className="button" type="submit">{designCopy.save}</button>
            </form>
          ) : null,
          contact: (
            <form key="contact" action={save} className="site-editor-section-form">
              <input type="hidden" name="activeSection" value="contact" />
              <div className="editor-section-heading"><div><p className="eyebrow">{contactCopy.eyebrow}</p><h2>{contactCopy.title}</h2></div><p>{contactCopy.intro}</p></div>
              <div className="editor-grid two-columns premium-contact-fields">
                <label>{contactCopy.phone}<input name="phone" defaultValue={site.contact.phone} /></label>
                <label>{contactCopy.email}<input name="email" type="email" defaultValue={site.contact.email} /></label>
                <label>{contactCopy.address}<input name="address" defaultValue={site.contact.address} /></label>
                <label>{contactCopy.city}<input name="city" defaultValue={site.contact.city} /></label>
              </div>
              <div className="business-hours-editor">
                <div className="hours-heading"><div><p className="eyebrow">{contactCopy.schedule}</p><h3>{contactCopy.hours}</h3></div><p>{contactCopy.hoursIntro}</p></div>
                {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => {
                  const hours = openingHours.find((item) => item.day === day);
                  return <div key={day}><div className="hours-row"><strong>{contactCopy.days[day]}</strong><label><span>{contactCopy.opens}</span><input aria-label={`${contactCopy.days[day]} ${contactCopy.opens}`} name={`${day}Open`} type="time" defaultValue={hours?.closed ? "" : hours?.open} /></label><label><span>{contactCopy.closes}</span><input aria-label={`${contactCopy.days[day]} ${contactCopy.closes}`} name={`${day}Close`} type="time" defaultValue={hours?.closed ? "" : hours?.close} /></label><label className="day-closed"><input type="checkbox" name={`${day}Closed`} defaultChecked={hours?.closed} /><span>{contactCopy.closed}</span></label></div>{hours?.intervals?.map((interval, index) => <div className="hours-row" key={index}><strong>{contactCopy.days[day]}</strong><label>{contactCopy.opens}<input aria-label={`${contactCopy.days[day]} weiterer Beginn ${index + 1}`} name={`${day}Interval${index}Open`} type="time" defaultValue={interval.open} /></label><label>{contactCopy.closes}<input aria-label={`${contactCopy.days[day]} weiteres Ende ${index + 1}`} name={`${day}Interval${index}Close`} type="time" defaultValue={interval.close} /></label></div>)}</div>;
                })}
              </div>
              <div className="premium-legal-fields"><div className="editor-section-heading"><div><p className="eyebrow">{lifecycleCopy.editor.legalEyebrow}</p><h3>{lifecycleCopy.editor.legalTitle}</h3></div><p>{lifecycleCopy.editor.legalBody}</p></div>
              <div className="editor-grid two-columns">
                <label>{lifecycleCopy.editor.legalLabels[0]}<input name="legalBusinessName" required defaultValue={site.publicLegal?.legalBusinessName} /></label>
                <label>{lifecycleCopy.editor.legalLabels[1]}<input name="legalForm" defaultValue={site.publicLegal?.legalForm} /></label>
                <label>{lifecycleCopy.editor.legalLabels[2]}<input name="legalRepresentative" defaultValue={site.publicLegal?.authorizedRepresentative} /></label>
                <label>{lifecycleCopy.editor.legalLabels[3]}<input name="legalStreet" required defaultValue={site.publicLegal?.street} /></label>
                <label>{lifecycleCopy.editor.legalLabels[4]}<input name="legalPostalCode" required defaultValue={site.publicLegal?.postalCode} /></label>
                <label>{lifecycleCopy.editor.legalLabels[5]}<input name="legalCity" required defaultValue={site.publicLegal?.city} /></label>
                <label>{lifecycleCopy.editor.legalLabels[6]}<input name="legalCountryCode" maxLength={2} required pattern="[A-Za-z]{2}" autoCapitalize="characters" defaultValue={site.publicLegal?.countryCode} /></label>
                <label>{lifecycleCopy.editor.legalLabels[7]}<input name="legalContactEmail" type="email" required defaultValue={site.publicLegal?.contactEmail} /></label>
                <label>{lifecycleCopy.editor.legalLabels[8]}<input name="legalRegisterName" defaultValue={site.publicLegal?.registerName} /></label>
                <label>{lifecycleCopy.editor.legalLabels[9]}<input name="legalRegisterNumber" defaultValue={site.publicLegal?.registerNumber} /></label>
                <label>{lifecycleCopy.editor.legalLabels[10]}<input name="legalVatId" defaultValue={site.publicLegal?.vatId} /></label>
                <label className="legal-consent">
                  <input type="radio" name="legalPrivacyMode" value="internal" defaultChecked={site.publicLegal?.privacyNoticePath === "/privacy" && !site.publicLegal?.privacyNoticeUrl} />
                  <span>{lifecycleCopy.editor.privacyInternal}</span>
                </label>
                <label className="legal-consent">
                  <input type="radio" name="legalPrivacyMode" value="external" defaultChecked={Boolean(site.publicLegal?.privacyNoticeUrl)} />
                  <span>{lifecycleCopy.editor.privacyExternal}</span>
                </label>
                <label>{lifecycleCopy.editor.legalLabels[11]}<input name="legalPrivacyNoticeUrl" type="url" placeholder="https://customer.example/privacy" defaultValue={site.publicLegal?.privacyNoticeUrl} /></label>
              </div>
              </div>
              <button className="button" type="submit">{contactCopy.save}</button>
            </form>
          ),
        }}
        operationPanels={{
          appointments: (<section key="appointments" className="premium-booking-section">
        {booking ? <BookingAdminPanel slug={slug} initial={booking} businessName={site.content.name} /> : <p>Termine sind zurzeit nicht verfügbar.</p>}
        {legacyAppointments.length ? <details className="premium-disclosure"><summary>Frühere Kontaktanfragen ({legacyAppointments.length})</summary>{legacyAppointments.map(item => <article className="premium-appointment" key={item.id}><h3>{item.customerName}</h3><p>{item.serviceTitle} · {item.preferredDate} {item.preferredTime}</p><a href={`tel:${item.phone}`}>{item.phone}</a>{item.note ? <p>{item.note}</p> : null}</article>)}</details> : null}
      </section>),
          domain: (<section key="domain" className="site-editor-section-form site-admin-operation-panel">
        <div className="site-admin-disclosure-content">
        <div className="domain-setup-heading">
          <div>
            <p className="eyebrow">{domainCopy.eyebrow}</p>
            <h2>{domainCopy.title}</h2>
          </div>
          <p>{domainCopy.intro}</p>
        </div>
        {access?.activatedAt && canUseCustomDomain ? (
          <div className="domain-options-grid">
            <section className="domain-option-card">
              <span className="domain-option-number">01</span>
              <h3>{domainCopy.existingTitle}</h3>
              <p>{domainCopy.existingIntro}</p>
              {query.domain && domainCopy.messages[query.domain as keyof typeof domainCopy.messages] ? (
                <p className={query.domain === "verified" ? "success" : query.domain === "provider_error" || query.domain === "invalid" ? "error" : "editor-hint"} role="status">
                  {domainCopy.messages[query.domain as keyof typeof domainCopy.messages]}
                </p>
              ) : null}
              <form action={saveDomain} className="domain-entry-form">
                <label>
                  <span>{domainCopy.domainLabel}</span>
                  <input name="customDomain" defaultValue={access.customDomain} placeholder="yourbusiness.de" autoCapitalize="none" autoCorrect="off" required />
                </label>
                <button className="button secondary" type="submit">{domainCopy.save}</button>
              </form>
              <div className={`domain-status-card status-${access.customDomainStatus}`}>
                <div><span>{domainCopy.status}</span><strong>{domainCopy.states[access.customDomainStatus]}</strong></div>
                {domainSetup ? (
                  <div className="domain-status-checks">
                    <span>{domainCopy.ownership}<strong>{domainSetup.ownershipVerified ? domainCopy.complete : domainCopy.pending}</strong></span>
                    <span>{domainCopy.routing}<strong>{domainSetup.dnsConfigured ? domainCopy.complete : domainCopy.pending}</strong></span>
                  </div>
                ) : null}
              </div>
              {domainSetup?.records.length ? (
                <div className="domain-records">
                  <h3>{domainCopy.recordsTitle}</h3>
                  <p>{domainCopy.recordsIntro}</p>
                  <div className="domain-record-list">
                    {domainSetup.records.map((record) => (
                      <div className="domain-record" key={`${record.type}-${record.name}-${record.value}`}>
                        <div><span>{domainCopy.type}</span><strong>{record.type}</strong></div>
                        <div><span>{domainCopy.name}</span><code>{record.name}</code><CopyDomainValue value={record.name} label={domainCopy.copy} copiedLabel={domainCopy.copied} /></div>
                        <div><span>{domainCopy.value}</span><code>{record.value}</code><CopyDomainValue value={record.value} label={domainCopy.copy} copiedLabel={domainCopy.copied} /></div>
                        <div><span>{domainCopy.purpose}</span><strong>{domainCopy.purposes[record.purpose]}</strong></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {access.customDomain ? (
                <div className="domain-verify-row">
                  <form action={verifyDomain}><button className="button secondary compact" type="submit">{domainCopy.verify}</button></form>
                  {domainSetup?.checkedAt ? <small>{domainCopy.checked}: {formatSiteAdminDate(locale, new Date(domainSetup.checkedAt))}</small> : null}
                </div>
              ) : null}
            </section>
            <section className="domain-option-card muted-option">
              <span className="domain-option-number">02</span>
              <h3>{domainCopy.buyTitle}</h3>
              <p>{domainCopy.buyIntro}</p>
              {registrar ? <a className="button secondary" href={registrar.url} target="_blank" rel="noreferrer">{domainCopy.buyExternal(registrar.name)}</a> : null}
              <div className="domain-coming-soon"><div><strong>{domainCopy.directPurchase}</strong><span>{domainCopy.comingSoon}</span></div><button className="button secondary compact" type="button" disabled>{domainCopy.comingSoon}</button></div>
            </section>
          </div>
        ) : access?.activatedAt ? (
          <>
            <p>{pageCopy.domain.unavailablePlan}</p>
            <Link className="button secondary compact" href={`/subscribe?demo=${slug}`}>
              {pageCopy.domain.choosePlan}
            </Link>
          </>
        ) : (
          <>
            <p>{pageCopy.domain.trialOnly}</p>
            <Link
              className="button secondary compact"
              href={`/subscribe?demo=${slug}`}
            >
              {pageCopy.domain.viewPlans}
            </Link>
          </>
        )}
        </div>
      </section>),
          security: (<section key="security" className="site-editor-section-form site-admin-operation-panel">
        <div className="editor-section-heading"><div><p className="eyebrow">09 · {pageCopy.security.eyebrow}</p><h2>{pageCopy.security.title}</h2></div></div>
        <div className="site-admin-disclosure-content">
        <form action={`/api/site-admin/${encodeURIComponent(slug)}/password`} method="post" className="admin-login">
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            placeholder={pageCopy.security.currentPlaceholder}
            required
          />
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            placeholder={pageCopy.security.placeholder}
            required
          />
          <button className="button secondary" type="submit">
            {pageCopy.security.submit}
          </button>
        </form>
        {query.password ? <p className="error" role="alert">{pageCopy.security.invalid}</p> : null}
        <p><Link className="button secondary compact" href={`/site-admin/${slug}/privacy`}>{locale === "de" ? "Meine Daten exportieren" : "Export my data"}</Link></p>
        </div>
      </section>),
          preview: (<section key="preview" className="site-editor-section-form business-admin-final-preview">
        <div className="editor-section-heading"><div><p className="eyebrow">10 · {lifecycleCopy.editor.preview}</p><h2>{site.content.name}</h2></div><p>{pageCopy.header[1]}</p></div>
        {site.customDesign && site.customMedia ? <SiteAdminLivePreview /> : <SiteAdminPreview><SitePreview site={site} /></SiteAdminPreview>}
      </section>),
        }}
      />
      </CustomEditorBoundary>
      </div>
    </main>
  );
}
