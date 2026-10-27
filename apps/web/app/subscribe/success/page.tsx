import Link from "next/link";
import { PlatformLogo } from "../../../components/platform-logo";
import { accountCopy } from "../../../lib/account-copy";
import { requireSiteAdminSession } from "../../../lib/site-admin-auth";

export default async function SubscriptionSuccess({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const copy = accountCopy[(await requireSiteAdminSession())?.preferredLocale ?? "en"];
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link className="landing-brand" href="/">
          <PlatformLogo />
        </Link>
      </header>
      <section className="subscribe-hero">
        <p className="landing-eyebrow">{copy.success.eyebrow}</p>
        <h1>{copy.success.title}</h1>
        <p>{copy.success.body}</p>
        <div className="trial-actions">
          {demo ? (
            <Link className="landing-button" href={`/site/${demo}`}>
              {copy.success.openWebsite}
            </Link>
          ) : null}
          <Link className="trial-back" href="/site-admin/login">
            {copy.success.login}
          </Link>
        </div>
      </section>
    </main>
  );
}
