/* eslint-disable @next/next/no-img-element -- editorial media URLs are tenant data resolved at runtime. */
import Link from "next/link";
import type {
  PublicInformationArticle,
  PublicInformationArticleSummary,
  PublicInformationCategory,
  PublicInformationSite,
} from "@platform/site-data";
import type { InformationAdSlotKey } from "@platform/website-engine";
import { EditorialContentPreview } from "./editorial-content-preview";
import { publicInformationCopy } from "../lib/public-information-copy";
import { informationAdCopy } from "../lib/information-ad-copy";
import { encodeArticleCursor } from "../lib/public-information-routing";
import {
  informationAssetUrl,
  informationRoutePath,
  informationRouteUrl,
  publicInformationUrl,
  safeJsonLd,
  type InformationRouteTarget,
} from "../lib/public-information-seo";

const platformTarget: InformationRouteTarget = { kind: "platform" };

function themeClass(site: PublicInformationSite) {
  return `information-theme-${site.themeKey === "auto" ? "clarity" : site.themeKey}`;
}

function formattedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function PublicationHeader({ site, target }: { site: PublicInformationSite; target: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  const navigation: Array<{ label: string; categorySlug?: string; href?: string }> = site.navigation.length
    ? site.navigation
    : site.categories.slice(0, 5).map((category) => ({ label: category.name, categorySlug: category.slug }));
  const home = informationRoutePath(site, "", target);
  return <header className="information-header">
    <Link className="information-brand" href={home}><strong>{site.publicationName}</strong>{site.tagline ? <span>{site.tagline}</span> : null}</Link>
    <nav aria-label={copy.categories}>
      <Link href={home}>{copy.latest}</Link>
      {navigation.map((item) => <Link key={`${item.label}-${item.categorySlug ?? item.href}`} href={item.categorySlug ? informationRoutePath(site, `category/${item.categorySlug}`, target) : item.href || home}>{item.label}</Link>)}
    </nav>
  </header>;
}

function PublicationFooter({ site, target }: { site: PublicInformationSite; target: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  const adminHref = target.kind === "custom-domain" ? publicInformationUrl("/site-admin/login") : "/site-admin/login";
  return <footer className="information-footer"><div><strong>{site.publicationName}</strong>{site.tagline ? <p>{site.tagline}</p> : null}</div><div className="information-footer-links">{site.categories.slice(0, 6).map((category) => <Link key={category.id} href={informationRoutePath(site, `category/${category.slug}`, target)}>{category.name}</Link>)}<Link href={adminHref}>{copy.admin}</Link></div></footer>;
}

function ArticleImage({ article, eager = false }: { article: PublicInformationArticleSummary; eager?: boolean }) {
  return article.featuredImageUrl
    ? <img src={article.featuredImageUrl} alt={article.featuredImageAlt || article.title} loading={eager ? "eager" : "lazy"} />
    : <div className="information-image-placeholder" aria-hidden="true"><span>{article.category?.name || "Editorial"}</span></div>;
}

function ArticleMeta({ site, article, target }: { site: PublicInformationSite; article: PublicInformationArticleSummary; target: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  return <p className="information-article-meta">{article.category ? <Link href={informationRoutePath(site, `category/${article.category.slug}`, target)}>{article.category.name}</Link> : null}<time dateTime={article.publishedAt}>{formattedDate(article.publishedAt, site.locale)}</time>{article.displayAuthor ? <span>{copy.by} {article.displayAuthor}</span> : null}</p>;
}

function ArticleCard({ site, article, target }: { site: PublicInformationSite; article: PublicInformationArticleSummary; target: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  const articleHref = informationRoutePath(site, `articles/${article.slug}`, target);
  return <article className="information-article-card"><Link className="information-card-image" href={articleHref}><ArticleImage article={article} /></Link><div><ArticleMeta site={site} article={article} target={target} /><h3><Link href={articleHref}>{article.title}</Link></h3>{article.excerpt ? <p>{article.excerpt}</p> : null}<Link className="information-read-link" href={articleHref}>{copy.readArticle} →</Link></div></article>;
}

function InformationAdSlotView({ site, slotKey }: { site: PublicInformationSite; slotKey: InformationAdSlotKey }) {
  const slot = (site.adSlots ?? []).find((candidate) => candidate.slotKey === slotKey && candidate.enabled);
  const banners = (site.sponsorBanners ?? []).filter((banner) => banner.enabled && banner.slotKey === slotKey);
  if (!banners.length) return null;
  const label = informationAdCopy[site.locale].advertisement;
  return <section
    className={`information-ad-slot information-ad-slot-${slot?.format ?? "auto"}`}
    aria-label={label}
    data-ad-slot={slotKey}
    data-ad-format={slot?.format ?? "auto"}
  ><div className="information-sponsor-grid">{banners.map((banner) => <a
    key={banner.id}
    className="information-sponsor-banner"
    href={banner.destinationUrl}
    rel="sponsored noopener noreferrer"
  >{banner.imageUrl ? <img src={banner.imageUrl} alt="" loading="lazy" /> : null}<div className="information-sponsor-copy"><span className="information-sponsor-label">{label} · {banner.sponsorName}</span><strong>{banner.headline}</strong>{banner.description ? <p>{banner.description}</p> : null}<span className="information-sponsor-cta">{banner.callToAction} <span aria-hidden="true">↗</span></span></div></a>)}</div></section>;
}

export function InformationHome({ site, articles, target = platformTarget }: { site: PublicInformationSite; articles: PublicInformationArticleSummary[]; target?: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  const featured = articles[0];
  const latest = articles.slice(1, 7);
  const categorySections = site.categories.map((category) => ({ category, articles: articles.filter((article) => article.category?.id === category.id && article.id !== featured?.id).slice(0, 3) })).filter((section) => section.articles.length);
  const canonical = informationRouteUrl(site, "", target);
  const featuredHref = featured ? informationRoutePath(site, `articles/${featured.slug}`, target) : "";
  return <main className={`information-site information-world-desk ${themeClass(site)}`} lang={site.locale}>
    <PublicationHeader site={site} target={target} />
    {featured ? <section className="information-featured"><div className="information-featured-copy"><span className="information-kicker">{copy.featured}</span><ArticleMeta site={site} article={featured} target={target} /><h1><Link href={featuredHref}>{featured.title}</Link></h1>{featured.excerpt ? <p>{featured.excerpt}</p> : null}<Link className="information-primary-link" href={featuredHref}>{copy.readArticle} →</Link></div><Link className="information-featured-image" href={featuredHref}><ArticleImage article={featured} eager /></Link></section> : <section className="information-empty"><h1>{site.publicationName}</h1><p>{copy.noArticles}</p></section>}
    <InformationAdSlotView site={site} slotKey="home_after_featured" />
    {latest.length ? <section className="information-section"><div className="information-section-heading"><span>01</span><h2>{copy.latest}</h2></div><div className="information-article-grid">{latest.map((article) => <ArticleCard key={article.id} site={site} article={article} target={target} />)}</div></section> : null}
    {categorySections.map(({ category, articles: categoryArticles }, index) => <section className="information-section information-category-strip" key={category.id}><div className="information-section-heading"><span>{String(index + 2).padStart(2, "0")}</span><h2>{category.name}</h2><Link href={informationRoutePath(site, `category/${category.slug}`, target)}>{copy.allArticles} →</Link></div><div className="information-article-grid">{categoryArticles.map((article) => <ArticleCard key={article.id} site={site} article={article} target={target} />)}</div></section>)}
    <PublicationFooter site={site} target={target} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: site.publicationName, description: site.tagline, url: canonical, inLanguage: site.locale }) }} />
  </main>;
}

export function InformationCategoryPage({ site, category, articles, nextCursor, target = platformTarget }: { site: PublicInformationSite; category: PublicInformationCategory; articles: PublicInformationArticleSummary[]; nextCursor?: { publishedAt: string; id: string }; target?: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  return <main className={`information-site information-world-desk ${themeClass(site)}`} lang={site.locale}>
    <PublicationHeader site={site} target={target} />
    <section className="information-category-hero"><span>{copy.categories}</span><h1>{category.name}</h1>{category.description ? <p>{category.description}</p> : null}</section>
    <InformationAdSlotView site={site} slotKey="category_before_feed" />
    <section className="information-section"><div className="information-article-grid">{articles.map((article) => <ArticleCard key={article.id} site={site} article={article} target={target} />)}{!articles.length ? <p className="information-empty-feed">{copy.noArticles}</p> : null}</div>{nextCursor ? <Link className="information-pagination" href={`${informationRoutePath(site, `category/${category.slug}`, target)}?cursor=${encodeURIComponent(encodeArticleCursor(nextCursor))}`}>{copy.next} →</Link> : null}</section>
    <PublicationFooter site={site} target={target} />
  </main>;
}

export function InformationArticlePage({ site, article, related, target = platformTarget }: { site: PublicInformationSite; article: PublicInformationArticle; related: PublicInformationArticleSummary[]; target?: InformationRouteTarget }) {
  const copy = publicInformationCopy[site.locale];
  const canonical = target.kind === "custom-domain"
    ? informationRouteUrl(site, `articles/${article.slug}`, target)
    : article.canonicalUrl || informationRouteUrl(site, `articles/${article.slug}`, target);
  const shareText = encodeURIComponent(article.title);
  const shareUrl = encodeURIComponent(canonical);
  const structuredImage = article.featuredImageUrl ? informationAssetUrl(site, article.featuredImageUrl, target) : undefined;
  return <main className={`information-site information-world-desk ${themeClass(site)}`} lang={site.locale}>
    <PublicationHeader site={site} target={target} />
    <article className="information-article-page">
      <header className="information-article-hero"><ArticleMeta site={site} article={article} target={target} /><h1>{article.title}</h1>{article.excerpt ? <p>{article.excerpt}</p> : null}</header>
      {article.featuredImageUrl ? <figure className="information-article-image"><img src={article.featuredImageUrl} alt={article.featuredImageAlt || article.title} /><figcaption>{article.featuredImageAlt}</figcaption></figure> : null}
      {article.articleMedia.length ? <section className="information-article-gallery" aria-label="Article images">{article.articleMedia.map((media) => <figure key={media.id}><img src={media.url} alt={media.altText || article.title} loading="lazy" />{media.altText ? <figcaption>{media.altText}</figcaption> : null}</figure>)}</section> : null}
      <InformationAdSlotView site={site} slotKey="article_after_media" />
      <div className="information-article-layout"><aside><span>{copy.summary}</span><p>{article.excerpt}</p><div className="information-share"><strong>{copy.share}</strong><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`} target="_blank" rel="noreferrer">LinkedIn</a><a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noreferrer">X</a><a href={`mailto:?subject=${shareText}&body=${shareUrl}`}>Email</a></div><InformationAdSlotView site={site} slotKey="article_sidebar" /></aside><div className="information-article-body"><EditorialContentPreview content={article.body} />{article.sources.length ? <section className="information-sources"><h2>{copy.sources}</h2><ol>{article.sources.map((source) => <li key={`${source.sortOrder}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label || new URL(source.url).hostname}</a></li>)}</ol></section> : null}</div></div>
    </article>
    {related.length ? <section className="information-section"><div className="information-section-heading"><span>+</span><h2>{copy.related}</h2></div><div className="information-article-grid">{related.map((item) => <ArticleCard key={item.id} site={site} article={item} target={target} />)}</div></section> : null}
    <PublicationFooter site={site} target={target} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title, description: article.excerpt, image: structuredImage ? [structuredImage] : undefined, datePublished: article.publishedAt, dateModified: article.publishedAt, author: article.displayAuthor ? { "@type": "Person", name: article.displayAuthor } : { "@type": "Organization", name: site.publicationName }, publisher: { "@type": "Organization", name: site.publicationName }, mainEntityOfPage: canonical, inLanguage: site.locale }) }} />
  </main>;
}
