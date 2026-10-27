/* eslint-disable @next/next/no-img-element -- local template previews are intentional product samples. */
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { WebsiteTrialWizard } from "../components/website-trial-wizard";
import { PlatformLogo } from "../components/platform-logo";
import { LanguageSelector } from "../components/language-selector";
import { CurrencySelector } from "../components/currency-selector";
import { billingCurrencyForLocale, configuredPlatformLocale, plansForCurrency, platformConfig } from "../lib/platform-config";
import { launchPromotionIsActive } from "../lib/launch-promotion";
import { landingCopy } from "../lib/landing-copy";
import { configuredConversionLandingCopy, type ConversionLandingCopy } from "../lib/conversion-landing-copy";
import { b2bLaunchCopy } from "../lib/b2b-policy";
import { priceTaxPresentation, resolvedPlatformLegalConfig } from "../lib/legal-config";

const galleryImages = [
  "/images/templates/wl-beauty-hair-salon-v1.webp",
  "/images/templates/wl-restaurant-hero-v1.webp",
  "/images/templates/wl-auto-repair-hero-v1.webp",
  "/images/templates/wl-professional-architect-v1.webp",
  "/images/templates/wl-pet-veterinary-v1.webp",
  "/images/templates/wl-construction-house-v1.png",
];

function BrowserFrame({ children, label }: { children: ReactNode; label: string }) {
  return <div className="launch2-browser"><div className="launch2-browser-bar"><i /><i /><i /><span>{label}</span></div>{children}</div>;
}

function HeroVisual({ copy }: { copy: ConversionLandingCopy }) {
  return <div className="launch2-hero-visual" aria-label={copy.hero.previewAlt}>
    <div className="launch2-orbit launch2-orbit-one" />
    <div className="launch2-orbit launch2-orbit-two" />
    <BrowserFrame label="yourbusiness.com">
      <div className="launch2-hero-site">
        <img src={galleryImages[0]} alt="" />
        <div><small>STUDIO HAIR &amp; BEAUTY</small><strong>Feel like your best self.</strong><span>Services · Gallery · Appointments</span></div>
      </div>
    </BrowserFrame>
    <div className="launch2-float launch2-float-price"><span>{copy.hero.setup}</span><small>instead of €300+</small></div>
    <div className="launch2-float launch2-float-time"><strong>00:47</strong><span>website ready</span></div>
    <div className="launch2-float launch2-float-trial"><i>✓</i><span>{copy.hero.trial}</span></div>
  </div>;
}

function ProcessVisual({ index, label }: { index: number; label: string }) {
  if (index === 0) return <div className="launch2-process-media create-media" aria-label={label}>
    <div className="launch2-mini-form"><span>Business name</span><strong>Arthur&apos;s Studio</strong><span>Category</span><strong>Hair &amp; Beauty</strong><b>Generate website →</b></div>
    <div className="launch2-generated-card"><img src={galleryImages[0]} alt="" /><span>✓ Website ready</span></div>
    <div className="launch2-media-progress"><i /></div>
  </div>;
  if (index === 1) return <div className="launch2-process-media control-media" aria-label={label}>
    <div className="launch2-dashboard-nav"><b>Editor</b><span className="active">Content</span><span>Services</span><span>Photos</span><span>Design</span></div>
    <div className="launch2-dashboard-form"><small>Hero title</small><strong>Your moment. Your style.</strong><small>Service price</small><strong>from €49</strong><b>Save changes</b></div>
    <div className="launch2-media-progress"><i /></div>
  </div>;
  return <div className="launch2-process-media evolve-media" aria-label={label}>
    <div className="launch2-update-card"><small>NEW STYLE</small><strong>Editorial Studio</strong><span>Available now</span></div>
    <div className="launch2-style-stack"><i /><i /><i /><i /></div>
    <div className="launch2-update-note">✓ Added to your platform</div>
    <div className="launch2-media-progress"><i /></div>
  </div>;
}

export default async function Landing() {
  const requestCookies = await cookies();
  const locale = configuredPlatformLocale(requestCookies.get("platform_locale")?.value);
  const currency = billingCurrencyForLocale(locale, requestCookies.get("platform_currency")?.value);
  const legacyCopy = landingCopy[locale] ?? landingCopy.en;
  const copy = configuredConversionLandingCopy(locale, platformConfig.trialDays, platformConfig.brand.name);
  const useBuyerMarketing = locale === platformConfig.brand.locale;
  const hero = {
    eyebrow: useBuyerMarketing && platformConfig.marketing.overrides.eyebrow ? platformConfig.marketing.eyebrow : copy.hero.eyebrow,
    title: useBuyerMarketing && platformConfig.marketing.overrides.heroTitle ? platformConfig.marketing.heroTitle : copy.hero.title,
    body: useBuyerMarketing && platformConfig.marketing.overrides.heroBody ? platformConfig.marketing.heroBody : copy.hero.body,
  };
  const plans = plansForCurrency(currency);
  const [b2b, legal] = [b2bLaunchCopy(locale), await resolvedPlatformLegalConfig()];

  return <main className="landing launch2">
    <header className="launch2-nav">
      <Link className="landing-brand landing-brand-primary" href="/"><PlatformLogo tagline /></Link>
      <nav><a href="#how">{copy.nav.how}</a><a href="#examples">{copy.nav.examples}</a><a href="#pricing">{copy.nav.pricing}</a><Link href="/site-admin/login">{copy.nav.login}</Link></nav>
      <div className="launch2-nav-tools">
        <LanguageSelector current={locale} supported={platformConfig.brand.supportedLocales} label={legacyCopy.language} />
        <CurrencySelector current={currency} label={copy.nav.pricing} />
        <Link className="landing-button compact" href="#create">{copy.nav.create}</Link>
      </div>
    </header>

    <section className="launch2-hero">
      <div className="launch2-hero-copy">
        <p className="landing-eyebrow">{hero.eyebrow}</p>
        <h1>{hero.title}</h1>
        <p className="launch2-lede">{hero.body}</p>
        <p className="subscription-cancellation-note"><strong>{b2b.restriction}</strong></p>
        <div className="landing-hero-actions"><Link className="landing-button" href="#create">{copy.hero.primary}</Link><a className="landing-text-link" href="#examples">{copy.hero.secondary} <span>↘</span></a></div>
        <div className="landing-trust">{copy.hero.trust.map((item) => <span key={item}>{item}</span>)}</div>
      </div>
      <HeroVisual copy={copy} />
    </section>

    <section className="launch2-comparison" aria-labelledby="comparison-title">
      <div className="launch2-section-heading"><p className="landing-eyebrow">{copy.comparison.eyebrow}</p><h2 id="comparison-title">{copy.comparison.title}</h2></div>
      <div className="launch2-compare-table">
        <div className="launch2-compare-head"><span>{copy.comparison.traditional}</span><strong>{copy.comparison.platform}</strong></div>
        {copy.comparison.rows.map(([before, after]) => <div className="launch2-compare-row" key={before}><span>{before}</span><i>→</i><strong>{after}</strong></div>)}
      </div>
    </section>

    <section id="how" className="launch2-process">
      <div className="launch2-section-heading center"><p className="landing-eyebrow">{copy.process.eyebrow}</p><h2>{copy.process.title}</h2><p>{copy.process.body}</p></div>
      <div className="launch2-process-grid">{copy.process.items.map((item, index) => <article key={item.title}><div className="launch2-step-label"><b>0{index + 1}</b><span>{item.title}</span></div><ProcessVisual index={index} label={item.mediaLabel} /><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
    </section>

    <section id="examples" className="launch2-gallery">
      <div className="launch2-section-heading"><p className="landing-eyebrow">{copy.gallery.eyebrow}</p><h2>{copy.gallery.title}</h2><p>{copy.gallery.body}</p></div>
      <div className="launch2-gallery-grid" tabIndex={0} aria-label={copy.gallery.title}>{galleryImages.map((src, index) => {
        const site = copy.gallery.sites[index];
        return <figure key={src}><BrowserFrame label={`${copy.gallery.labels[index].toLowerCase().replaceAll(" ", "-")}.example`}><div className={`launch2-gallery-site gallery-style-${index + 1}`} aria-label={`${copy.gallery.alt}: ${copy.gallery.labels[index]}`}><img src={src} alt="" /><div className="launch2-gallery-nav"><strong>{site.brand}</strong><span>About&nbsp;&nbsp; Services&nbsp;&nbsp; Contact</span><i>•••</i></div><div className="launch2-gallery-hero"><small>{copy.gallery.labels[index]}</small><strong>{site.title}</strong><b>{site.cta} <span>↗</span></b></div></div></BrowserFrame><figcaption><span>0{index + 1}</span>{copy.gallery.labels[index]}</figcaption></figure>;
      })}</div>
    </section>

    <section id="pricing" className="launch2-evolve">
      <div className="launch2-evolve-copy"><p className="landing-eyebrow">{copy.evolve.eyebrow}</p><h2>{copy.evolve.title}</h2><p>{copy.evolve.body}</p></div>
      <div className="launch2-control-panel" aria-label={copy.evolve.dashboardLine}>
        <div className="launch2-control-bar"><i /><i /><i /><span>{platformConfig.brand.name}</span><b>●</b></div>
        <div className="launch2-control-body">
          <aside><strong>{platformConfig.brand.mark}</strong>{copy.evolve.dashboardItems.map((item, index) => <span className={index === 0 ? "active" : ""} key={item}><i>{["⌂", "◷", "◇", "€", "▧", "◐"][index]}</i>{item}</span>)}</aside>
          <div className="launch2-control-content">
            <header><div><small>{copy.evolve.eyebrow}</small><strong>{copy.evolve.dashboardLine}</strong></div><span>Live</span></header>
            <div className="launch2-control-workspace">
              <div className="launch2-control-preview"><img src={galleryImages[0]} alt="" /><div><small>NOA STUDIO</small><strong>{copy.gallery.sites[0].title}</strong><b>{copy.gallery.sites[0].cta}</b></div></div>
              <div className="launch2-control-modules">{copy.evolve.dashboardItems.slice(1).map((item, index) => <article key={item}><i>{["◷", "◇", "€", "▧", "◐"][index]}</i><span>{item}</span><b>↗</b></article>)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="launch2-pricing">
        {launchPromotionIsActive() ? <div className="launch2-offer-banner">{copy.evolve.offer}</div> : null}
        <div className="launch2-pricing-head"><div><span>{copy.evolve.pricing}</span><p>{copy.evolve.priceNote}</p><p><strong>{b2b.restriction}</strong><br />{legal.reviewed ? priceTaxPresentation(legal.config) : "Tax display requires operator configuration and review."}</p></div><CurrencySelector current={currency} label={copy.nav.pricing} /></div>
        <div className="launch2-price-grid">{plans.map((plan) => {
          const available = plan.purchasable;
          return <article className={available ? "featured available" : "unavailable"} key={plan.key}>
            <span>{plan.name}</span><strong>{plan.price}</strong><p>{copy.evolve.planDescriptions[plan.key]}</p>
            {available ? <a className="launch2-plan-action" href="#create">{copy.nav.create} →</a> : <button className="launch2-plan-action" type="button" disabled aria-disabled="true">{copy.evolve.unavailable}</button>}
          </article>;
        })}</div>
      </div>
    </section>

    <section className="launch2-trial-heading"><p className="landing-eyebrow">{copy.trial.eyebrow}</p><h2>{copy.trial.title}</h2><p>{copy.trial.body}</p><a href="#examples">{copy.trial.examples} ↗</a></section>
    <WebsiteTrialWizard trialDays={platformConfig.trialDays} locale={locale} supportedLocales={platformConfig.website.supportedLocales} />

    <footer className="landing-footer launch2-footer">
      <Link className="landing-brand" href="/"><PlatformLogo compact /></Link>
      <span>{useBuyerMarketing ? platformConfig.brand.tagline : copy.hero.eyebrow}</span>
      <div><Link href="/site-admin/login">{copy.nav.login}</Link><a href={platformConfig.brand.supportUrl}>{legacyCopy.footer.support}</a><Link href="/legal/privacy">{legacyCopy.footer.privacy}</Link><Link href="/legal/terms">{legacyCopy.footer.terms}</Link><Link href="/legal/imprint">{legacyCopy.footer.legal}</Link><Link href="/legal/cancellation">{legacyCopy.footer.cancellation}</Link></div>
    </footer>
  </main>;
}
