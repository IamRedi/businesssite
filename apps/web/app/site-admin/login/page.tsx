import { cookies } from "next/headers";
import Link from "next/link";
import { configuredPlatformLocale } from "../../../lib/platform-config";
import { accountCopy } from "../../../lib/account-copy";
import { authAbuseCopy } from "../../../lib/auth-abuse-copy";

export default async function SiteAdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const locale = configuredPlatformLocale((await cookies()).get("platform_locale")?.value);
  const copy = accountCopy[locale];
  const error = (await searchParams).error;
  return (
    <main className="shell">
      <p className="eyebrow">{copy.login.eyebrow}</p>
      <h1>{copy.login.title}</h1>
      <form action="/api/site-admin/login" method="post" className="admin-login">
        <input
          required
          name="email"
          type="email"
          placeholder={copy.subscription.emailPlaceholder}
        />
        <input
          required
          name="password"
          type="password"
          placeholder={copy.login.password}
        />
        <button className="button">{copy.login.signIn}</button>
      </form>
      <p><Link href="/site-admin/forgot-password">{copy.login.forgot}</Link></p>
      {(await searchParams).reset ? <p className="success">{copy.login.reset}</p> : null}
      {error === "invalid" ? <p className="error">{authAbuseCopy[locale].invalid}</p> : null}
      {error === "rate" ? <p className="error">{authAbuseCopy[locale].rateLimited}</p> : null}
    </main>
  );
}
