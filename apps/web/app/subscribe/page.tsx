import Link from "next/link";
import { SubscribeForm } from "../../components/subscribe-form";
import { PlatformLogo } from "../../components/platform-logo";
import { billingCurrencyForLocale, plansForCurrency } from "../../lib/platform-config";
import { cookies } from "next/headers";
import { accountCopy } from "../../lib/account-copy";
import { conversionLandingCopy } from "../../lib/conversion-landing-copy";
import { requireSiteAdminSession, trustedSiteAdminSessionHash } from "../../lib/site-admin-auth";
import { PostgresSiteRepository } from "@platform/site-data";
import { redirect } from "next/navigation";
import { b2bLaunchCopy } from "../../lib/b2b-policy";
import { priceTaxPresentation, resolvedPlatformLegalConfig } from "../../lib/legal-config";
import { launchPromotionIsActive } from "../../lib/launch-promotion";

import { customerPublicLegalIdentityComplete } from "@platform/website-engine";
import { customerLifecycleCopy } from "../../lib/customer-lifecycle-copy";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const adminSession = await requireSiteAdminSession();
  if (!adminSession) redirect("/site-admin/login");
  const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(adminSession) });
  const slug = (await repository.getActorCacheIdentities(adminSession.siteId)).slug;
  const requestedSlug = (await searchParams).demo;
  if (!slug || (requestedSlug !== undefined && requestedSlug !== slug))
    redirect("/site-admin/login?error=invalid");
  const requestCookies = await cookies();
  const locale = adminSession.preferredLocale;
  const currency = billingCurrencyForLocale(locale, requestCookies.get("platform_currency")?.value);
  const copy = accountCopy[locale];
  const [site, legal] = await Promise.all([repository.getStoredBySlug(slug), resolvedPlatformLegalConfig()]);
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-brand">
          <PlatformLogo />
        </Link>
        <Link href="/site-admin/login">{copy.subscription.login}</Link>
      </header>
      <section className="subscribe-hero">
        <p className="landing-eyebrow">{copy.subscription.eyebrow}</p>
        <h1>{copy.subscription.title}</h1>
        <p>{copy.subscription.body}</p>
        <p><strong>{b2bLaunchCopy(locale).restriction}</strong></p>
        <p className="subscription-cancellation-note">{customerLifecycleCopy[locale].checkout.cancellation}</p>
        {site && !customerPublicLegalIdentityComplete(site) ? (
          <p className="subscription-cancellation-note" role="status">
            <strong>{customerLifecycleCopy[locale].editor.legalIncompleteTitle}</strong>{" "}
            {customerLifecycleCopy[locale].editor.legalIncompleteBody}
          </p>
        ) : null}
        <SubscribeForm
          plans={plansForCurrency(currency)}
          copy={copy.subscription}
          currency={currency}
          siteSlug={slug}
          comingSoon={conversionLandingCopy[locale].evolve.unavailable}
          b2bCopy={b2bLaunchCopy(locale)}
          taxLabel={legal.reviewed ? priceTaxPresentation(legal.config) : customerLifecycleCopy[locale].checkout.taxUnavailable}
          promotionActive={launchPromotionIsActive()}
          initialBusinessName={site?.content.name ?? ""}
          locale={locale}
        />
      </section>
    </main>
  );
}
